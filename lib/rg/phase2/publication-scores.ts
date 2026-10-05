import 'server-only';
import { createPhase2AdminClient } from './database';

type Publication = { id: string; track_id: string; artist_id: string };

/** Reconciles verified links in unfinished seasons before finalization; never awards historical imports. */
export async function reconcileRgPublicationScores(now = new Date()) {
  const db = createPhase2AdminClient();
  const { data: seasonId, error } = await db.rpc('rg_ensure_seasons', { p_now: now.toISOString() });
  if (error || !seasonId) throw new Error('RG publication reconciliation season unavailable.');
  const seasonResult = await db.from('rg_seasons').select('id,starts_at,ends_at')
    .in('status', ['active', 'ended']).lte('starts_at', now.toISOString());
  if (seasonResult.error || !seasonResult.data) throw new Error('RG publication reconciliation windows unavailable.');
  const seasons = seasonResult.data as Array<{ id: string; starts_at: string; ends_at: string }>;
  let checked = 0;
  let capped = 0;
  let failures = 0;
  let skipped = 0;
  for (const season of seasons) {
    for (let offset = 0; ; offset += 500) {
      const result = await db.from('rg_publication_links').select('id,track_id,artist_id')
        .gte('published_at', season.starts_at).lt('published_at', season.ends_at).order('id', { ascending: true }).range(offset, offset + 499);
      if (result.error) throw new Error('Verified RG publications could not be reconciled.');
      const links = (result.data ?? []) as Publication[];
      if (!links.length) break;
      const tracks = await db.from('rg_tracks').select('id,beat_id').in('id', [...new Set(links.map(link => link.track_id))]);
      if (tracks.error) throw new Error('RG publication beats could not be verified.');
      const scored = await db.from('rg_score_events').select('track_id').eq('event_type', 'TRACK_PUBLISHED').in('track_id', [...new Set(links.map(link => link.track_id))]);
      if (scored.error) throw new Error('Prior publication Score events could not be loaded.');
      const scoredTracks = new Set(((scored.data ?? []) as Array<{ track_id: string }>).map(event => event.track_id));
      const beats = new Map(((tracks.data ?? []) as Array<{ id: string; beat_id: string | null }>).map(track => [track.id, track.beat_id]));
      for (const link of links) {
        if (scoredTracks.has(link.track_id)) { skipped++; continue; }
        if (!beats.has(link.track_id)) { failures++; continue; }
        const score = await db.rpc('rg_record_score_event', {
          p_event_type: 'TRACK_PUBLISHED', p_artist_id: link.artist_id, p_track_id: link.track_id,
          p_beat_id: beats.get(link.track_id), p_publication_id: link.id,
          p_source_type: 'rg_publication_link', p_source_id: link.id, p_milestone_key: null,
        });
        checked++;
        if (score.error?.message?.includes('score_artist_season_cap')) capped++;
        else if (score.error && ['score_artist_inactive','score_track_unverified'].some(code => score.error?.message?.includes(code))) skipped++;
        else if (score.error) { failures++; console.error('[RG publication Score reconciliation]', score.error.code || 'FAILED'); }
        else scoredTracks.add(link.track_id);
      }
      if (links.length < 500) break;
    }
  }
  if (failures) throw new Error('One or more verified publication Score events could not be reconciled.');
  return { checked, capped, skipped };
}
