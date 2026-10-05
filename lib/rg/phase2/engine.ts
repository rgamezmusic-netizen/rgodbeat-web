export const SEASON_LENGTH_DAYS = 14;
export const SUPPORT_CYCLE_DAYS = 90;
export const RANK_LIMIT = 23;

export type RankingKind = 'tracks' | 'artists' | 'beats';
export type ScoreEvent = {
  artist_id: string | null;
  track_id: string | null;
  beat_id: string | null;
  score_points: number;
};
export type RankRow = {
  entityId: string;
  rank: number;
  score: number;
  previousRank: number | null;
  movement: number | null;
  isNew: boolean;
};

export function scoreEventIdempotencyKey(input: { seasonId: string; eventType: string; sourceType: string; sourceId: string; milestoneKey?: string | null }) {
  return JSON.stringify([input.seasonId, input.eventType, input.sourceType, input.sourceId, input.milestoneKey ?? null]);
}

export function trackPublicationRewardKey(trackId: string) {
  return `TRACK_PUBLISHED:${trackId}`;
}

export function getCrossedYoutubeMilestones(previousViews: number, currentViews: number, configured: Record<string, { points: number }>) {
  if (!Number.isSafeInteger(previousViews) || !Number.isSafeInteger(currentViews) || previousViews < 0 || currentViews < previousViews) return [];
  return Object.entries(configured).filter(([threshold, rule]) => Number(threshold) > previousViews && Number(threshold) <= currentViews
    && Number.isSafeInteger(rule.points) && rule.points > 0).map(([threshold]) => threshold).sort((a, b) => Number(a) - Number(b));
}

/** Season windows are fixed 14-day UTC intervals from an explicit anchor. */
export function getSeasonWindow(anchor: Date, at: Date) {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(at.getTime())) throw new Error('Invalid season date.');
  const seasonNumber = Math.max(1, Math.floor((at.getTime() - anchor.getTime()) / (SEASON_LENGTH_DAYS * 86_400_000)) + 1);
  const startsAt = new Date(anchor.getTime() + (seasonNumber - 1) * SEASON_LENGTH_DAYS * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + SEASON_LENGTH_DAYS * 86_400_000);
  return { seasonNumber, startsAt, endsAt, status: at < startsAt ? 'scheduled' as const : at < endsAt ? 'active' as const : 'ended' as const };
}

/** All ranking dimensions are projections of the same verified score ledger. */
export function aggregateRanking(events: ScoreEvent[], kind: RankingKind, previous: Map<string, number> = new Map(), limit = RANK_LIMIT): RankRow[] {
  const scoreById = new Map<string, number>();
  for (const event of events) {
    const entityId = kind === 'artists' ? event.artist_id : kind === 'tracks' ? event.track_id : event.beat_id;
    if (!entityId || !Number.isSafeInteger(event.score_points) || event.score_points < 0) continue;
    scoreById.set(entityId, (scoreById.get(entityId) ?? 0) + event.score_points);
  }
  return [...scoreById.entries()]
    .sort(([idA, scoreA], [idB, scoreB]) => scoreB - scoreA || idA.localeCompare(idB))
    .slice(0, limit)
    .map(([entityId, score], index) => {
      const rank = index + 1;
      const previousRank = previous.get(entityId) ?? null;
      return { entityId, rank, score, previousRank, movement: previousRank === null ? null : previousRank - rank, isNew: previousRank === null };
    });
}

export type SupportTier = { name: string; minimum: number; poolBps: number };
export function getSupportTier(cycleContribution: number, tiers: SupportTier[]) {
  if (!Number.isSafeInteger(cycleContribution) || cycleContribution < 0) throw new Error('Invalid support amount.');
  const ordered = [...tiers].sort((a, b) => a.minimum - b.minimum);
  if (!ordered.length || ordered[0].minimum !== 0) throw new Error('Support tiers must include a zero threshold.');
  const tier = ordered.filter((candidate) => candidate.minimum <= cycleContribution).at(-1)!;
  if (!Number.isInteger(tier.poolBps) || tier.poolBps < 0 || tier.poolBps > 10_000) throw new Error('Invalid pool split.');
  return tier;
}

export function splitContribution(amount: number, poolBps: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isInteger(poolBps) || poolBps < 0 || poolBps > 10_000) throw new Error('Invalid contribution.');
  const pool = Number(BigInt(amount) * BigInt(poolBps) / BigInt(10_000));
  return { gross: amount, pool, reserve: amount - pool };
}

export type PoolFormula = { base: number; activity: number; commerce: number; direct: number; sponsors: number; minimum: number; maximum: number; issuanceCap: number };
export function calculateSeasonPool(input: PoolFormula) {
  const values = Object.values(input);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0) || input.maximum < input.minimum) throw new Error('Invalid season pool configuration.');
  const generated = BigInt(input.base) + BigInt(input.activity) + BigInt(input.commerce);
  const minimum = BigInt(input.minimum);
  const requested = generated > minimum ? generated : minimum;
  const issued = requested < BigInt(input.issuanceCap) ? requested : BigInt(input.issuanceCap);
  const funded = issued + BigInt(input.direct) + BigInt(input.sponsors);
  return Number(funded < BigInt(input.maximum) ? funded : BigInt(input.maximum));
}

export function calculateMaximumDiscount(purchaseCents: number, rgBalance: number, rgPerUsdCent: number, maximumPercent = 50) {
  if (![purchaseCents, rgBalance, rgPerUsdCent, maximumPercent].every(Number.isSafeInteger) || purchaseCents < 0 || rgBalance < 0 || rgPerUsdCent <= 0 || maximumPercent < 0 || maximumPercent > 50) throw new Error('Invalid redemption inputs.');
  const discountCapCents = Number(BigInt(purchaseCents) * BigInt(maximumPercent) / BigInt(100));
  const balanceValueCents = Math.floor(rgBalance / rgPerUsdCent);
  const appliedCents = Math.min(discountCapCents, balanceValueCents);
  return { appliedCents, rgToRedeem: appliedCents * rgPerUsdCent, cashCents: purchaseCents - appliedCents };
}

export function extendEntitlement(currentExpiry: Date | null, now: Date, days: number) {
  if (!Number.isSafeInteger(days) || days < 0) throw new Error('Invalid entitlement duration.');
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return new Date(base.getTime() + days * 86_400_000);
}

export function distributeSeasonPool(pool: number, percentages: { first: number; second: number; third: number }) {
  if (!Number.isSafeInteger(pool) || pool < 0) throw new Error('Invalid reward pool.');
  const shares = [percentages.first, percentages.second, percentages.third];
  if (shares.some((share) => !Number.isInteger(share) || share < 0) || shares.reduce((a, b) => a + b, 0) > 80) throw new Error('Podium distribution must preserve at least 20% for programs and reserve.');
  const first = Number(BigInt(pool) * BigInt(percentages.first) / BigInt(100));
  const second = Number(BigInt(pool) * BigInt(percentages.second) / BigInt(100));
  const third = Number(BigInt(pool) * BigInt(percentages.third) / BigInt(100));
  return { first, second, third, unallocated: pool - first - second - third };
}

export function isScoreEligible(event: { scorePoints: number; category: string; origin?: string }) {
  // Funding and coin purchase are never competitive activity, even if a caller mislabels them.
  if (event.origin && ['PURCHASED_RG', 'SPONSOR_CONTRIBUTION', 'POOL_CONTRIBUTION', 'BUY_AND_BOOST'].includes(event.origin)) return false;
  return Number.isSafeInteger(event.scorePoints) && event.scorePoints > 0;
}

export type EconomyScenario = {
  earnedRg: number; purchasedRg: number; userContributionsRg: number; sponsorContributionsRg: number;
  rewardPoolRg: number; reserveRg: number; redeemedRg: number; eligibleSalesCents: number;
  rgPerUsdCent: number; maxDiscountPercent: number; seasonIssuanceCap: number; maximumOutstandingRg: number;
  poolIssuanceRg?: number; assumedRedemptionBps?: number; rewardObligationsRg?: number;
};
export function simulateEconomy(input: EconomyScenario) {
  const quantities = [input.earnedRg, input.purchasedRg, input.userContributionsRg, input.sponsorContributionsRg,
    input.rewardPoolRg, input.reserveRg, input.redeemedRg, input.eligibleSalesCents, input.seasonIssuanceCap, input.maximumOutstandingRg,
    input.poolIssuanceRg ?? 0, input.rewardObligationsRg ?? 0, input.assumedRedemptionBps ?? 10_000];
  if (quantities.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid economy simulation values.');
  if (input.userContributionsRg + input.redeemedRg > input.earnedRg + input.purchasedRg || (input.assumedRedemptionBps ?? 10_000) > 10_000) throw new Error('Invalid economy funding or redemption assumption.');
  if (input.rewardPoolRg + input.reserveRg > input.userContributionsRg + input.sponsorContributionsRg + (input.poolIssuanceRg ?? 0)) throw new Error('Unfunded reward pool.');
  const grossWalletIssuanceRg = input.earnedRg + input.purchasedRg + input.sponsorContributionsRg;
  const walletOutstandingRg = Math.max(0, input.earnedRg + input.purchasedRg - input.userContributionsRg - input.redeemedRg);
  const outstandingRg = walletOutstandingRg + input.rewardPoolRg + input.reserveRg;
  if (![grossWalletIssuanceRg, walletOutstandingRg, outstandingRg, input.earnedRg + (input.poolIssuanceRg ?? 0)].every(Number.isSafeInteger)) throw new Error('Economy totals exceed safe integer limits.');
  const discountExposure = calculateMaximumDiscount(input.eligibleSalesCents, walletOutstandingRg, input.rgPerUsdCent, input.maxDiscountPercent);
  return {
    grossWalletIssuanceRg,
    walletOutstandingRg,
    rewardPoolRg: input.rewardPoolRg,
    reserveRg: input.reserveRg,
    outstandingRg,
    maximumDiscountExposureCents: discountExposure.appliedCents,
    seasonIssuanceRg: input.earnedRg + (input.poolIssuanceRg ?? 0),
    rewardObligationsRg: input.rewardObligationsRg ?? 0,
    obligationsFunded: (input.rewardObligationsRg ?? 0) <= input.rewardPoolRg,
    assumedDiscountExposureCents: Math.floor(discountExposure.appliedCents * (input.assumedRedemptionBps ?? 10_000) / 10_000),
    withinSeasonIssuanceCap: input.earnedRg + (input.poolIssuanceRg ?? 0) <= input.seasonIssuanceCap,
    withinOutstandingCap: outstandingRg <= input.maximumOutstandingRg,
  };
}
