import 'server-only';
import { getRgSeasonRankings } from '@/lib/rg/phase2/rankings';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';
import { getPublicStorageUrl } from '@/lib/storage/public';
import { safeHttpsUrl } from './presentation';
import type { ChartData, ChartEntry } from './types';

/** Public allowlist. No ownership, balances, rules, audit IDs or ledger evidence. */
export async function getRgChart(): Promise<ChartData> {
  const source = await getRgSeasonRankings();
  const { data, error } = await createPhase2AdminClient().from('rg_rule_versions')
    .select('reward_distribution').eq('version', source.season.rules_version).single();
  if (error || !data) throw new Error('Season rewards could not be loaded.');
  const distribution = (data as { reward_distribution: Record<string, unknown> }).reward_distribution;
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
  const rankings: ChartData['rankings'] = { tracks: [], artists: [], beats: [] };
  for (const kind of ['tracks', 'artists', 'beats'] as const) {
    rankings[kind] = source.rankings[kind].map(row => {
      const entry: ChartEntry = { entityId: row.entityId, rank: row.rank, score: row.score, previousRank: row.previousRank,
        movement: row.movement, isNew: row.isNew, onFire: false };
      if ('track' in row && row.track) entry.track = { id: row.track.id, title: row.track.title, beat_id: row.track.beat_id };
      if ('artist' in row && row.artist) entry.artist = { id: row.artist.id, stage_name: row.artist.stage_name, slug: row.artist.slug };
      if ('beat' in row && row.beat) {
        entry.beat = { id: row.beat.id, title: row.beat.title, slug: row.beat.slug, coverUrl: getPublicStorageUrl(row.beat.cover_path) };
        entry.rankedTrackCount = source.rankings.tracks.filter(track => track.track?.beat_id === row.entityId).length;
      }
      return entry;
    });
  }
  return {
    season: { id: source.season.id, season_number: source.season.season_number, name: source.season.name,
      starts_at: source.season.starts_at, ends_at: source.season.ends_at, status: source.season.status },
    serverTime: source.serverTime, rewardPoolRg: source.rewardPoolRg, rewards, ...(rewardTail ? { rewardTail } : {}), rankings,
    sponsors: source.sponsors.flatMap(link => link.sponsor ? [{ name: link.sponsor.name,
      websiteUrl: safeHttpsUrl(link.sponsor.website_url), logoUrl: getPublicStorageUrl(link.sponsor.logo_path), tier: link.visibility_tier }] : []),
  };
}
