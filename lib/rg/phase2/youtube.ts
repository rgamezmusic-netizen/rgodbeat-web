import 'server-only';
import { createPhase2AdminClient } from './database';
import { getYouTubeChannelSettings, refreshYouTubeAccessToken } from '@/lib/youtube/channel';
import { parseYoutubeMetrics, youtubeMilestoneEvidence, type VerifiedViewObservation } from './youtube-metrics';

type PublicationLink = { id: string; track_id: string; artist_id: string; youtube_video_id: string };
type TrackBeat = { id: string; beat_id: string | null };
type MetricRule = { points: number };

/** Pulls counts only for already verified RG publication links; never accepts client metrics. */
export async function refreshRgYoutubeMilestones(now = new Date()) {
  const db = createPhase2AdminClient();
  const publicationLinks: PublicationLink[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('rg_publication_links').select('id,track_id,artist_id,youtube_video_id')
      .order('id', { ascending: true }).range(offset, offset + 499);
    if (error) throw new Error('Linked YouTube publications could not be loaded.');
    const page = (data ?? []) as PublicationLink[];
    publicationLinks.push(...page);
    if (page.length < 500) break;
  }
  if (!publicationLinks.length) return { checked: 0, viewSnapshots: 0, milestonesRecorded: 0, connectionVerified: false };
  const channel = await getYouTubeChannelSettings();
  if (!channel?.channel_id) throw new Error('The verified YouTube channel is not connected.');
  const token = await refreshYouTubeAccessToken();
  const { data: seasonId, error: seasonError } = await db.rpc('rg_ensure_seasons', { p_now: now.toISOString() });
  if (seasonError || !seasonId) throw new Error('Active RG season could not be loaded.');
  const seasonResult = await db.from('rg_seasons').select('rules_version,starts_at,ends_at')
    .in('status', ['active', 'ended']).lte('starts_at', now.toISOString());
  if (seasonResult.error || !seasonResult.data) throw new Error('Unfinished RG season rules could not be loaded.');
  const seasons = seasonResult.data as Array<{ rules_version: number; starts_at: string; ends_at: string }>;
  const rulesResult = await db.from('rg_rule_versions').select('version,youtube_view_milestones')
    .in('version', [...new Set(seasons.map(season => season.rules_version))]);
  if (rulesResult.error || !rulesResult.data) throw new Error('YouTube milestone rules could not be loaded.');
  const ruleVersions = rulesResult.data as Array<{ version: number; youtube_view_milestones: Record<string, MetricRule> }>;
  const rulesByVersion = new Map(ruleVersions.map(rule => [rule.version, rule.youtube_view_milestones]));
  let snapshots = 0;
  let recorded = 0;
  let failures = 0;
  for (let offset = 0; offset < publicationLinks.length; offset += 50) {
    const batch = publicationLinks.slice(offset, offset + 50);
    const tracksResult = await db.from('rg_tracks').select('id,beat_id').in('id', [...new Set(batch.map(link => link.track_id))]);
    if (tracksResult.error) throw new Error('RG Track beat associations could not be loaded.');
    const trackById = new Map(((tracksResult.data ?? []) as TrackBeat[]).map(track => [track.id, track]));
    const url = new URL('https://youtube.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'statistics,snippet,status');
    url.searchParams.set('id', batch.map((link) => link.youtube_video_id).join(','));
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(`YouTube statistics request failed (${response.status}).`);
    const viewsByVideo = new Map(parseYoutubeMetrics(payload, channel.channel_id).map((item) => [item.videoId, item.viewCount]));
    for (const link of batch) {
      const views = viewsByVideo.get(link.youtube_video_id);
      if (views === undefined || !Number.isSafeInteger(views) || views < 0) continue;
      const track = trackById.get(link.track_id);
      if (!track) continue;
      const observedDay = now.toISOString().slice(0, 10);
      const { error: snapshotError } = await db.from('rg_youtube_metric_snapshots').insert({
        publication_id: link.id, observed_day: observedDay, view_count: views, captured_at: now.toISOString(),
      });
      if (!snapshotError) snapshots++;
      else if (snapshotError.code !== '23505') throw new Error('YouTube metric evidence could not be persisted.');
      const observations: VerifiedViewObservation[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await db.from('rg_youtube_metric_snapshots').select('view_count,captured_at,observed_day')
          .eq('publication_id', link.id).order('observed_day', { ascending: true }).range(offset, offset + 499);
        if (result.error) throw new Error('Persisted YouTube metric evidence could not be loaded.');
        const page = (result.data ?? []) as VerifiedViewObservation[];
        observations.push(...page);
        if (page.length < 500) break;
      }
      // First observation is baseline; persisted crossings can safely replay after a temporary failure.
      for (const season of seasons) {
        const milestones = rulesByVersion.get(season.rules_version);
        if (!milestones) throw new Error('An unfinished season milestone rule version is unavailable.');
        for (const event of youtubeMilestoneEvidence(observations, milestones, season.starts_at, season.ends_at)) {
          const { error } = await db.rpc('rg_record_score_event', {
            p_event_type: 'YOUTUBE_VIEW_MILESTONE', p_artist_id: link.artist_id,
            p_track_id: link.track_id, p_beat_id: track.beat_id, p_publication_id: link.id,
            p_source_type: 'youtube_publication', p_source_id: link.id, p_milestone_key: event.milestone,
            p_verified_at: event.verifiedAt, p_evidence: { view_count: event.viewCount, captured_at: event.verifiedAt, provider: 'youtube_data_api' },
          });
          if (!error) recorded++;
          else if (!['score_artist_season_cap','score_artist_inactive','score_track_unverified','score_rule_disabled'].some(code => error.message?.includes(code))) {
            failures++; console.error('[RG YouTube milestone]', error.code || 'EVENT_NOT_RECORDED');
          }
        }
      }
    }
  }
  if (failures) throw new Error('Verified YouTube milestone Score events could not be reconciled.');
  return { checked: publicationLinks.length, viewSnapshots: snapshots, milestonesRecorded: recorded, connectionVerified: true };
}
