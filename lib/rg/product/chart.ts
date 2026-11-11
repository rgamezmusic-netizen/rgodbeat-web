import 'server-only';
import { getRgSeasonRankings } from '@/lib/rg/phase2/rankings';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';
import { getPublicStorageUrl } from '@/lib/storage/public';
import { buildHallOfFame, computeArtistMedalTally, safeHttpsUrl } from './presentation';
import type { ChartData, ChartEntry, PublicArtist, RgArtistMedalTally } from './types';

/** Public allowlist. No ownership, balances, rules, audit IDs or ledger evidence. */
export async function getRgChart(): Promise<ChartData> {
  const db = createPhase2AdminClient();
  const [source, ruleResult, finalsResult] = await Promise.all([
    getRgSeasonRankings(),
    db.from('rg_rule_versions').select('version,reward_distribution'),
    db.from('rg_season_finalizations').select('season_id,rank_run_id').order('finalized_at', { ascending: false }).limit(500),
  ]);
  let ruleRow: { reward_distribution: Record<string, unknown> } | null = null;
  if (!ruleResult.error && Array.isArray(ruleResult.data)) {
    const matched = (ruleResult.data as Array<{ version?: number; reward_distribution: Record<string, unknown> }>)
      .find(r => r.version === source.season.rules_version || r.version === undefined);
    if (matched) ruleRow = matched;
  }
  if (!ruleRow) {
    const fallbackRule = await db.from('rg_rule_versions')
      .select('reward_distribution').eq('version', source.season.rules_version).single();
    if (fallbackRule.error || !fallbackRule.data) throw new Error('Season rewards could not be loaded.');
    ruleRow = fallbackRule.data as { reward_distribution: Record<string, unknown> };
  }
  const distribution = ruleRow.reward_distribution;
  const days = distribution.premium_days as Record<string, unknown> | undefined;
  const rewards = [1, 2, 3].map(place => ({ place, premiumDays: Number(days?.[place]), poolSharePercent: Number(distribution[place]) }));
  if (rewards.some(r => !Number.isSafeInteger(r.premiumDays) || r.premiumDays < 0 || !Number.isSafeInteger(r.poolSharePercent) || r.poolSharePercent < 0)
    || rewards.reduce((sum, r) => sum + r.poolSharePercent, 0) > 80) throw new Error('Season reward configuration is invalid.');
  let rewardTail: ChartData['rewardTail'];
  if (source.season.rules_version === 2) {
    if (rewards.some(r => r.poolSharePercent !== 20) || distribution.tail_percent !== 40
      || distribution.tail_start !== 4 || distribution.tail_end !== 23 || distribution.tail_weight !== '24-rank') throw new Error('Season reward configuration is invalid.');
    rewardTail = { firstPlace: 4, lastPlace: 23, poolSharePercent: 40 };
  }

  // Load infinite medal history across all finalized seasons for Hall of Fame & Ranking rows
  const completed = (!finalsResult.error ? (finalsResult.data ?? []) : []) as Array<{ season_id: string; rank_run_id: string }>;
  const historyByArtistId = new Map<string, Array<{ seasonNumber: number; rank: number; score: number }>>();
  const winnerArtistsById = new Map<string, PublicArtist>();
  if (completed.length > 0) {
    const runIds = completed.map(r => r.rank_run_id);
    const seasonIds = completed.map(r => r.season_id);
    const [snapshotsResult, seasonsResult] = await Promise.all([
      db.from('rg_rank_snapshots')
        .select('season_id,entity_id,rank,score')
        .eq('ranking_type', 'artists')
        .in('run_id', runIds)
        .in('rank', [1, 2, 3]),
      db.from('rg_seasons')
        .select('id,season_number')
        .eq('status', 'finalized')
        .in('id', seasonIds),
    ]);
    if (!snapshotsResult.error && !seasonsResult.error) {
      const seasonMap = new Map(
        ((seasonsResult.data ?? []) as Array<{ id: string; season_number: number }>).map(row => [row.id, Number(row.season_number)])
      );
      const snapRows = ((snapshotsResult.data ?? []) as Array<{ season_id: string; entity_id: string; rank: number; score: number | string }>)
        .filter(row => Number(row.rank) >= 1 && Number(row.rank) <= 3 && seasonMap.has(row.season_id));
      const winnerIds = [...new Set(snapRows.map(row => row.entity_id))];
      if (winnerIds.length > 0) {
        const artistsResult = await db.from('rg_artists')
          .select('id,stage_name,slug')
          .eq('status', 'active')
          .in('id', winnerIds);
        if (!artistsResult.error) {
          for (const a of (artistsResult.data ?? []) as PublicArtist[]) {
            winnerArtistsById.set(a.id, { id: a.id, stage_name: a.stage_name, slug: a.slug });
          }
        }
      }
      for (const row of snapRows) {
        const seasonNumber = seasonMap.get(row.season_id);
        if (!seasonNumber) continue;
        const list = historyByArtistId.get(row.entity_id) ?? [];
        list.push({ seasonNumber, rank: Number(row.rank), score: Math.max(0, Number(row.score) || 0) });
        historyByArtistId.set(row.entity_id, list);
      }
    }
  }

  const medalsByArtistId = new Map<string, RgArtistMedalTally>();
  for (const [artistId, hist] of historyByArtistId.entries()) {
    medalsByArtistId.set(artistId, computeArtistMedalTally(hist));
  }

  const rankings: ChartData['rankings'] = { tracks: [], artists: [], beats: [] };
  for (const kind of ['tracks', 'artists', 'beats'] as const) {
    rankings[kind] = source.rankings[kind].map(row => {
      const entry: ChartEntry = { entityId: row.entityId, rank: row.rank, score: row.score, previousRank: row.previousRank,
        movement: row.movement, isNew: row.isNew, onFire: false };
      if ('track' in row && row.track) entry.track = { id: row.track.id, title: row.track.title, beat_id: row.track.beat_id };
      if ('artist' in row && row.artist) {
        entry.artist = { id: row.artist.id, stage_name: row.artist.stage_name, slug: row.artist.slug };
        if (!winnerArtistsById.has(row.artist.id)) {
          winnerArtistsById.set(row.artist.id, entry.artist);
        }
      }
      if ('beat' in row && row.beat) {
        entry.beat = { id: row.beat.id, title: row.beat.title, slug: row.beat.slug, coverUrl: getPublicStorageUrl(row.beat.cover_path) };
        entry.rankedTrackCount = source.rankings.tracks.filter(track => track.track?.beat_id === row.entityId).length;
      }
      if ('interactions' in row && row.interactions) {
        entry.interactions = {
          recordedCount: Math.max(0, Number(row.interactions.recordedCount) || 0),
          viewCount: Math.max(0, Number(row.interactions.viewCount) || 0),
          likeCount: Math.max(0, Number(row.interactions.likeCount) || 0),
          commentCount: Math.max(0, Number(row.interactions.commentCount) || 0),
        };
      }
      const artistIdForMedals = kind === 'artists' ? row.entityId : kind === 'tracks' ? entry.artist?.id : undefined;
      if (artistIdForMedals) {
        const tally = medalsByArtistId.get(artistIdForMedals);
        if (tally && tally.total > 0) {
          entry.medals = tally;
        }
      }
      return entry;
    });
  }

  const currentRankByArtistId = new Map<string, number>();
  for (const row of rankings.artists) {
    currentRankByArtistId.set(row.entityId, row.rank);
  }
  const hallOfFame = buildHallOfFame(
    [...historyByArtistId.entries()]
      .map(([artistId, history]) => {
        const artist = winnerArtistsById.get(artistId);
        if (!artist) return null;
        return {
          artist,
          history,
          currentSeasonRank: currentRankByArtistId.get(artistId) ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  );

  return {
    season: { id: source.season.id, season_number: source.season.season_number, name: source.season.name,
      starts_at: source.season.starts_at, ends_at: source.season.ends_at, status: source.season.status },
    serverTime: source.serverTime, rewardPoolRg: source.rewardPoolRg, rewards, ...(rewardTail ? { rewardTail } : {}), rankings,
    hallOfFame,
    sponsors: source.sponsors.flatMap(link => link.sponsor ? [{ name: link.sponsor.name,
      websiteUrl: safeHttpsUrl(link.sponsor.website_url), logoUrl: getPublicStorageUrl(link.sponsor.logo_path), tier: link.visibility_tier }] : []),
  };
}
