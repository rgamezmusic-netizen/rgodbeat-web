import 'server-only';
import { createPhase2AdminClient } from './database';
import type { RankingKind } from './engine';

type Season = { id: string; season_number: number; name: string; starts_at: string; ends_at: string; status: string; rules_version: number };
type RankTotal = { ranking_type: RankingKind; entity_id: string; score: number | string };
type SnapshotEntry = { ranking_type: RankingKind; entity_id: string; rank: number };
type TrackIdentity = { id: string; title: string; beat_id: string | null };
type ArtistIdentity = { id: string; stage_name: string; slug: string };
type BeatIdentity = { id: string; title: string; slug: string; cover_path: string | null };
type Membership = { track_id: string; artist_id: string; role: string };
type SponsorLink = { sponsor_id: string; visibility_tier: string; starts_at: string; ends_at: string };
type Sponsor = { id: string; name: string; slug: string; logo_path: string | null; website_url: string | null };

export async function getRgSeasonRankings(now = new Date()) {
  const db = createPhase2AdminClient();
  const { data: seasonId, error: seasonError } = await db.rpc('rg_ensure_seasons', { p_now: now.toISOString() });
  if (seasonError || !seasonId) throw new Error('RG season calendar is not available.');
  const { data: seasonData, error: seasonLoadError } = await db.from('rg_seasons').select('*').eq('id', seasonId).single();
  if (seasonLoadError || !seasonData) throw new Error('Current RG season could not be loaded.');
  const currentSeason = seasonData as Season;
  // These reads share only the season ID; no query needs to wait for another.
  const [poolResult, sponsorshipsResult, totalsResult, latestRunResult] = await Promise.all([
    db.from('rg_reward_pool_totals').select('pool_rg').eq('season_id', currentSeason.id).maybeSingle(),
    db.from('rg_season_sponsorships').select('sponsor_id,visibility_tier,starts_at,ends_at')
      .eq('season_id', currentSeason.id).eq('status', 'active').lte('starts_at', now.toISOString()).order('starts_at', { ascending: false }),
    db.rpc('rg_current_rank_totals', { p_season_id: currentSeason.id }),
    db.from('rg_rank_snapshot_runs').select('id')
      .eq('season_id', currentSeason.id).order('captured_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (poolResult.error || sponsorshipsResult.error) throw new Error('Season reward pool or sponsors could not be loaded.');
  if (totalsResult.error) throw new Error('RG score ledger could not be aggregated.');
  if (latestRunResult.error) throw new Error('RG ranking snapshot could not be loaded.');
  const totals = (totalsResult.data ?? []) as RankTotal[];
  const latestRun = latestRunResult.data as { id: string } | null;
  const sponsorLinks = ((sponsorshipsResult.data ?? []) as SponsorLink[]).filter((link) => new Date(link.ends_at) > now);
  const sponsorIds = [...new Set(sponsorLinks.map((link) => link.sponsor_id))];
  const [{ data: sponsorData, error: sponsorError }, savedResult] = await Promise.all([
    sponsorIds.length
      ? db.from('rg_sponsors').select('id,name,slug,logo_path,website_url').in('id', sponsorIds).eq('status', 'active')
      : Promise.resolve({ data: [], error: null }),
    latestRun?.id
      ? db.from('rg_rank_snapshots').select('ranking_type,entity_id,rank').eq('run_id', latestRun.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sponsorError) throw new Error('Active RG sponsors could not be loaded.');
  if (savedResult.error) throw new Error('RG rank movement could not be loaded.');
  const sponsorRows = ((sponsorData ?? []) as Sponsor[]).map((sponsor) => {
    let websiteUrl: string | null = null;
    try { const parsed = new URL(sponsor.website_url || ''); if (parsed.protocol === 'https:') websiteUrl = parsed.toString(); } catch { /* Hide unapproved/invalid sponsor links. */ }
    return { ...sponsor, website_url: websiteUrl };
  });
  const sponsors = sponsorLinks.map((link) => ({ ...link, sponsor: sponsorRows.find((row) => row.id === link.sponsor_id) ?? null }))
    .filter((link) => link.sponsor);
  const movementByKind = new Map<RankingKind, Map<string, number>>();
  if (latestRun?.id) {
    const savedRows = (savedResult.data ?? []) as SnapshotEntry[];
    for (const kind of ['tracks', 'artists', 'beats'] as const) {
      movementByKind.set(kind, new Map(savedRows.filter((row) => row.ranking_type === kind)
        .map((row) => [row.entity_id, row.rank])));
    }
  }
  const buildRows = (kind: RankingKind) => totals.filter((row) => row.ranking_type === kind)
    .sort((a, b) => Number(b.score) - Number(a.score) || a.entity_id.localeCompare(b.entity_id))
    .map((row, index) => {
      const rank = index + 1;
      const previousRank = movementByKind.get(kind)?.get(row.entity_id) ?? null;
      return { entityId: row.entity_id, rank, score: Number(row.score), previousRank,
        movement: previousRank === null ? null : previousRank - rank, isNew: previousRank === null };
    });
  const ranked = { tracks: buildRows('tracks'), artists: buildRows('artists'), beats: buildRows('beats') };
  const trackIds = ranked.tracks.map(row => row.entityId);
  const artistIds = ranked.artists.map(row => row.entityId);
  const beatIds = ranked.beats.map(row => row.entityId);
  const [tracksResult, artistsResult, beatsResult, membershipsResult] = await Promise.all([
    trackIds.length ? db.from('rg_tracks').select('id,title,beat_id').in('id', trackIds) : Promise.resolve({ data: [], error: null }),
    artistIds.length ? db.from('rg_artists').select('id,stage_name,slug').in('id', artistIds) : Promise.resolve({ data: [], error: null }),
    beatIds.length ? db.from('beats').select('id,title,slug,cover_path').in('id', beatIds) : Promise.resolve({ data: [], error: null }),
    ranked.tracks.length ? db.from('rg_track_artists').select('track_id,artist_id,role').in('track_id', ranked.tracks.map((row) => row.entityId)).eq('role', 'primary') : Promise.resolve({ data: [], error: null }),
  ]);
  if (tracksResult.error || artistsResult.error || beatsResult.error || membershipsResult.error) throw new Error('RG ranking identities could not be loaded.');
  const trackRows = (tracksResult.data ?? []) as TrackIdentity[];
  const artistRows = (artistsResult.data ?? []) as ArtistIdentity[];
  const missingArtistIds = [...new Set(((membershipsResult.data ?? []) as Membership[]).map((row) => row.artist_id))]
    .filter((id) => !artistRows.some((artist) => artist.id === id));
  if (missingArtistIds.length) {
    const { data, error } = await db.from('rg_artists').select('id,stage_name,slug').in('id', missingArtistIds);
    if (error) throw new Error('RG track artist identities could not be loaded.');
    artistRows.push(...((data ?? []) as ArtistIdentity[]));
  }
  const beatRows = (beatsResult.data ?? []) as BeatIdentity[];
  const membershipRows = (membershipsResult.data ?? []) as Membership[];
  const tracks = new Map(trackRows.map((row) => [row.id, row]));
  const artists = new Map(artistRows.map((row) => [row.id, row]));
  const beats = new Map(beatRows.map((row) => [row.id, row]));
  const primaryArtist = new Map(membershipRows.map((row) => [row.track_id, row.artist_id]));
  const identities = {
    tracks: ranked.tracks.map((row) => {
      const artistId = primaryArtist.get(row.entityId);
      return { ...row, track: tracks.get(row.entityId) ?? null, artist: artistId ? artists.get(artistId) ?? null : null };
    }),
    artists: ranked.artists.map((row) => ({ ...row, artist: artists.get(row.entityId) ?? null })),
    beats: ranked.beats.map((row) => ({ ...row, beat: beats.get(row.entityId) ?? null })),
  };
  return { season: currentSeason, rewardPoolRg: Number((poolResult.data as { pool_rg?: number | string } | null)?.pool_rg ?? 0), sponsors,
    serverTime: now.toISOString(), countdownMs: Math.max(0, new Date(currentSeason.ends_at).getTime() - now.getTime()), rankings: identities };
}
