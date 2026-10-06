import 'server-only';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';
import { getPublicStorageUrl } from '@/lib/storage/public';
import { getRgChart } from './chart';
import type { ArtistProfile, BeatProfile, ChartData, PublicArtist, PublicBeat, PublicTrack, SeasonPerformance, TrackProfile } from './types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
type Kind = 'tracks' | 'artists' | 'beats';

async function performance(chart: ChartData, kind: Kind, id: string): Promise<SeasonPerformance> {
  const ranked = chart.rankings[kind].find(row => row.entityId === id);
  if (ranked) return { rank: ranked.rank, score: ranked.score, movement: ranked.movement, isNew: ranked.isNew, onFire: false };
  // Same authoritative ledger as the ranking RPC; sum only this entity's season points.
  const db = createPhase2AdminClient();
  const column = { tracks: 'track_id', artists: 'artist_id', beats: 'beat_id' }[kind];
  let score = 0;
  for (let offset = 0; ; offset += 500) {
    const result = await db.from('rg_score_events').select('score_points').eq('season_id', chart.season.id)
      .eq(column, id).order('id').range(offset, offset + 499);
    if (result.error) throw new Error('Season performance unavailable.');
    const rows = (result.data ?? []) as Array<{ score_points: number }>;
    score += rows.reduce((sum, row) => sum + Number(row.score_points), 0);
    if (rows.length < 500) break;
  }
  if (!Number.isSafeInteger(score) || score < 0) throw new Error('Invalid season performance.');
  return { rank: null, score, movement: null, isNew: false, onFire: false };
}

export async function getArtistProfile(value: string): Promise<ArtistProfile | null> {
  if (!slug.test(value)) return null;
  const db = createPhase2AdminClient();
  const result = await db.from('rg_artists').select('id,stage_name,slug,bio').eq('slug', value).eq('status', 'active').maybeSingle();
  if (result.error) throw new Error('Artist unavailable.');
  if (!result.data) return null;
  const artist = result.data as PublicArtist & { bio: string | null };
  const [chart, memberships, finals] = await Promise.all([
    getRgChart(),
    db.from('rg_track_artists').select('track_id,rg_tracks!inner(id,title,status,created_at)')
      .eq('artist_id', artist.id).eq('role', 'primary').eq('rg_tracks.status', 'published').order('track_id').limit(24),
    db.from('rg_season_finalizations').select('season_id,rank_run_id').order('finalized_at', { ascending: false }).limit(6),
  ]);
  if (memberships.error || finals.error) throw new Error('Artist performance unavailable.');
  const tracks = ((memberships.data ?? []) as Array<{ rg_tracks: { id: string; title: string; status: string } | Array<{ id: string; title: string; status: string }> }>).flatMap(row => {
    const track = Array.isArray(row.rg_tracks) ? row.rg_tracks[0] : row.rg_tracks;
    return track?.status === 'published' ? [{ id: track.id, title: track.title }] : [];
  });
  const completed = (finals.data ?? []) as Array<{ season_id: string; rank_run_id: string }>;
  const history: ArtistProfile['history'] = [];
  if (completed.length) {
    const [snapshots, seasons] = await Promise.all([
      db.from('rg_rank_snapshots').select('season_id,rank,score').eq('ranking_type', 'artists').eq('entity_id', artist.id).in('run_id', completed.map(row => row.rank_run_id)),
      db.from('rg_seasons').select('id,season_number').eq('status', 'finalized').in('id', completed.map(row => row.season_id)),
    ]);
    if (snapshots.error || seasons.error) throw new Error('Artist history unavailable.');
    const seasonMap = new Map(((seasons.data ?? []) as Array<{ id: string; season_number: number }>).map(row => [row.id, row.season_number]));
    for (const row of (snapshots.data ?? []) as Array<{ season_id: string; rank: number; score: number }>) {
      const number = seasonMap.get(row.season_id);
      if (number) history.push({ seasonNumber: number, rank: row.rank, score: Number(row.score) });
    }
    history.sort((a, b) => b.seasonNumber - a.seasonNumber);
  }
  return { artist: { id: artist.id, stage_name: artist.stage_name, slug: artist.slug, bio: artist.bio },
    tracks, history, performance: await performance(chart, 'artists', artist.id), seasonNumber: chart.season.season_number };
}

async function publicBeat(id: string): Promise<PublicBeat | null> {
  const result = await createPhase2AdminClient().from('beats').select('id,title,slug,cover_path').eq('id', id).eq('published', true).maybeSingle();
  if (result.error) throw new Error('Beat unavailable.');
  const beat = result.data as { id: string; title: string; slug: string; cover_path: string | null } | null;
  return beat ? { id: beat.id, title: beat.title, slug: beat.slug, coverUrl: getPublicStorageUrl(beat.cover_path) } : null;
}

export async function getTrackProfile(id: string): Promise<TrackProfile | null> {
  if (!uuid.test(id)) return null;
  const db = createPhase2AdminClient();
  const result = await db.from('rg_tracks').select('id,title,beat_id').eq('id', id).eq('status', 'published').maybeSingle();
  if (result.error) throw new Error('Track unavailable.');
  if (!result.data) return null;
  const track = result.data as PublicTrack;
  const membership = await db.from('rg_track_artists').select('artist_id').eq('track_id', id).eq('role', 'primary').maybeSingle();
  if (membership.error) throw new Error('Artist unavailable.');
  const artistId = (membership.data as { artist_id: string } | null)?.artist_id;
  if (!artistId) return null;
  const owner = await db.from('rg_artists').select('id,stage_name,slug').eq('id', artistId).eq('status', 'active').maybeSingle();
  if (owner.error) throw new Error('Artist unavailable.');
  if (!owner.data) return null;
  const artist = owner.data as PublicArtist;
  const [chart, beat, links] = await Promise.all([
    getRgChart(), track.beat_id ? publicBeat(track.beat_id) : Promise.resolve(null),
    db.from('rg_publication_links').select('id,youtube_video_id,youtube_export_job_ref,published_at')
      .eq('track_id', id).eq('artist_id', artistId).order('published_at', { ascending: false }).limit(20),
  ]);
  if (links.error) throw new Error('Publication unavailable.');
  let publication: TrackProfile['publication'] = null;
  // Unlisted/private uploads are NOT public discovery. A live confirmed public job is required.
  for (const link of (links.data ?? []) as Array<{ id: string; youtube_video_id: string; youtube_export_job_ref: string | null; published_at: string }>) {
    if (!link.youtube_export_job_ref) continue;
    const job = await db.from('youtube_export_jobs').select('youtube_video_id').eq('id', link.youtube_export_job_ref)
      .eq('status', 'uploaded').eq('privacy', 'public').eq('youtube_video_id', link.youtube_video_id).maybeSingle();
    if (job.error) throw new Error('Publication privacy unavailable.');
    if (!job.data) continue;
    const [metrics, milestones] = await Promise.all([
      db.from('rg_youtube_metric_snapshots').select('view_count,captured_at').eq('publication_id', link.id).order('captured_at', { ascending: false }).limit(1),
      db.from('rg_score_events').select('id').eq('publication_id', link.id).eq('event_type', 'YOUTUBE_VIEW_MILESTONE').limit(100),
    ]);
    if (metrics.error || milestones.error) throw new Error('Performance unavailable.');
    const observation = ((metrics.data ?? []) as Array<{ view_count: number | string; captured_at: string }>)[0];
    publication = { url: `https://www.youtube.com/watch?v=${encodeURIComponent(link.youtube_video_id)}`, publishedAt: link.published_at,
      viewCount: observation ? Number(observation.view_count) : null, observedAt: observation?.captured_at ?? null,
      milestoneCount: (milestones.data as unknown[] | null)?.length ?? 0 };
    break;
  }
  return { track: { id: track.id, title: track.title, beat_id: track.beat_id }, artist: { id: artist.id, stage_name: artist.stage_name, slug: artist.slug },
    beat, performance: await performance(chart, 'tracks', id), seasonNumber: chart.season.season_number, publication };
}

export async function getBeatProfile(value: string): Promise<BeatProfile | null> {
  // Catalog slugs predate RG artist slug constraints; preserve their existing format.
  if (!value || value.length > 200 || /[/\\\u0000-\u001f]/.test(value)) return null;
  const result = await createPhase2AdminClient().from('beats').select('id').eq('slug', value).eq('published', true).maybeSingle();
  if (result.error) throw new Error('Beat unavailable.');
  if (!result.data) return null;
  const id = (result.data as { id: string }).id;
  const [beat, chart] = await Promise.all([publicBeat(id), getRgChart()]);
  if (!beat) return null;
  return { beat, performance: await performance(chart, 'beats', id), seasonNumber: chart.season.season_number,
    tracks: chart.rankings.tracks.filter(row => row.track?.beat_id === id) };
}
