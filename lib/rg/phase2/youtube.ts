import 'server-only';
import { createPhase2AdminClient } from './database';
import { refreshYouTubeAccessToken } from '@/lib/youtube/channel';
import { getCrossedYoutubeMilestones } from './engine';

type YoutubeApiResponse = { items?: Array<{ id: string; statistics?: { viewCount?: string } }>; error?: { message?: string } };
type PublicationLink = { id: string; track_id: string; artist_id: string; youtube_video_id: string };
type TrackBeat = { id: string; beat_id: string | null };
type MetricRule = { points: number };
type MetricSnapshot = { view_count: number | string };

/** Pulls counts only for already verified RG publication links; never accepts client metrics. */
export async function refreshRgYoutubeMilestones(now = new Date()) {
  const db = createPhase2AdminClient();
  const { data: links, error: linksError } = await db.from('rg_publication_links')
    .select('id,track_id,artist_id,youtube_video_id').order('published_at', { ascending: false }).limit(500);
  if (linksError) throw new Error('Linked YouTube publications could not be loaded.');
  const publicationLinks = (links ?? []) as PublicationLink[];
  if (!publicationLinks.length) return { checked: 0, viewSnapshots: 0, milestonesRecorded: 0 };
  const token = await refreshYouTubeAccessToken();
  const { data: seasonId, error: seasonError } = await db.rpc('rg_ensure_seasons', { p_now: now.toISOString() });
  if (seasonError || !seasonId) throw new Error('Active RG season could not be loaded.');
  const { data: seasonData, error: seasonLoadError } = await db.from('rg_seasons').select('rules_version').eq('id', seasonId).single();
  if (seasonLoadError || !seasonData) throw new Error('Active RG season rules could not be loaded.');
  const season = seasonData as { rules_version: number };
  const [rulesResult, tracksResult] = await Promise.all([
    db.from('rg_rule_versions').select('youtube_view_milestones').eq('version', season.rules_version).single(),
    db.from('rg_tracks').select('id,beat_id').in('id', [...new Set(publicationLinks.map((link) => link.track_id))]),
  ]);
  if (rulesResult.error || tracksResult.error) throw new Error('YouTube milestone rules or RG Tracks could not be loaded.');
  const milestoneConfig = rulesResult.data as { youtube_view_milestones: Record<string, MetricRule> };
  const milestones = milestoneConfig.youtube_view_milestones;
  const tracks = (tracksResult.data ?? []) as TrackBeat[];
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  let snapshots = 0;
  let recorded = 0;
  for (let offset = 0; offset < publicationLinks.length; offset += 50) {
    const batch = publicationLinks.slice(offset, offset + 50);
    const url = new URL('https://youtube.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('id', batch.map((link) => link.youtube_video_id).join(','));
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    const payload = await response.json() as YoutubeApiResponse;
    if (!response.ok) throw new Error(`YouTube statistics request failed (${response.status}).`);
    const viewsByVideo = new Map((payload.items ?? []).map((item) => [item.id, Number(item.statistics?.viewCount ?? 0)]));
    for (const link of batch) {
      const views = viewsByVideo.get(link.youtube_video_id);
      if (views === undefined || !Number.isSafeInteger(views) || views < 0) continue;
      const track = trackById.get(link.track_id);
      if (!track) continue;
      const observedDay = now.toISOString().slice(0, 10);
      const { data: previousData, error: previousError } = await db.from('rg_youtube_metric_snapshots')
        .select('view_count').eq('publication_id', link.id).lt('observed_day', observedDay)
        .order('observed_day', { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw new Error('Previous YouTube metric snapshot could not be loaded.');
      const previousSnapshot = previousData as MetricSnapshot | null;
      const { error: snapshotError } = await db.from('rg_youtube_metric_snapshots').insert({
        publication_id: link.id, observed_day: observedDay, view_count: views, captured_at: now.toISOString(),
      });
      if (!snapshotError) snapshots++;
      else if (snapshotError.code !== '23505') console.error('[RG YouTube metric snapshot]', snapshotError.code || 'WRITE_FAILED');
      // The first observation establishes a baseline. It cannot award old lifetime views
      // accumulated before the system began collecting verifiable snapshots.
      const crossed = previousSnapshot
        ? getCrossedYoutubeMilestones(Number(previousSnapshot.view_count), views, milestones)
        : [];
      for (const milestone of crossed) {
        const { error } = await db.rpc('rg_record_score_event', {
          p_event_type: 'YOUTUBE_VIEW_MILESTONE', p_artist_id: link.artist_id,
          p_track_id: link.track_id, p_beat_id: track.beat_id, p_publication_id: link.id,
          p_source_type: 'youtube_publication', p_source_id: link.id, p_milestone_key: milestone,
          p_verified_at: now.toISOString(), p_evidence: { view_count: views, captured_at: now.toISOString(), provider: 'youtube_data_api' },
        });
        if (!error) recorded++;
        else if (error.code !== '23505') console.error('[RG YouTube milestone]', error.code || 'EVENT_NOT_RECORDED');
      }
    }
  }
  return { checked: publicationLinks.length, viewSnapshots: snapshots, milestonesRecorded: recorded };
}
