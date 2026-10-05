import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateRanking, calculateMaximumDiscount, calculateSeasonPool, distributeSeasonPool,
  extendEntitlement, getCrossedYoutubeMilestones, getSeasonWindow, getSupportTier, isScoreEligible,
  scoreEventIdempotencyKey, simulateEconomy, splitContribution, trackPublicationRewardKey,
} from '../lib/rg/phase2/engine';

test('14-day season windows use UTC boundaries and advance exactly on the boundary', () => {
  const anchor = new Date('2026-10-05T00:00:00.000Z');
  assert.equal(getSeasonWindow(anchor, new Date('2026-10-18T23:59:59.999Z')).seasonNumber, 1);
  const next = getSeasonWindow(anchor, new Date('2026-10-19T00:00:00.000Z'));
  assert.equal(next.seasonNumber, 2);
  assert.equal(next.startsAt.toISOString(), '2026-10-19T00:00:00.000Z');
});

test('all three rankings aggregate the same ledger and nullable beats do not enter beat ranks', () => {
  const events = [
    { artist_id: 'artist-b', track_id: 'track-1', beat_id: null, score_points: 10 },
    { artist_id: 'artist-b', track_id: 'track-2', beat_id: 'beat-z', score_points: 4 },
    { artist_id: 'artist-a', track_id: 'track-3', beat_id: 'beat-a', score_points: 4 },
  ];
  assert.deepEqual(aggregateRanking(events, 'artists').map((row) => [row.entityId, row.score]), [['artist-b', 14], ['artist-a', 4]]);
  assert.deepEqual(aggregateRanking(events, 'tracks').map((row) => row.entityId), ['track-1', 'track-2', 'track-3']);
  assert.deepEqual(aggregateRanking(events, 'beats').map((row) => row.entityId), ['beat-a', 'beat-z']);
});

test('ranking is deterministic and movement identifies NEW and downward movement', () => {
  const rows = aggregateRanking([
    { artist_id: 'b', track_id: null, beat_id: null, score_points: 5 },
    { artist_id: 'a', track_id: null, beat_id: null, score_points: 5 },
  ], 'artists', new Map([['b', 1]]));
  assert.deepEqual(rows.map(({ entityId, movement, isNew }) => [entityId, movement, isNew]), [['a', null, true], ['b', -1, false]]);
});

test('90-day support tier and split are configurable and conserve every RG unit', () => {
  const tiers = [
    { minimum: 0, name: 'SUPPORTER', poolBps: 9000 }, { minimum: 1000, name: 'BOOSTER', poolBps: 9300 },
    { minimum: 5000, name: 'POWER', poolBps: 9600 }, { minimum: 15000, name: 'ELITE', poolBps: 10000 },
  ];
  assert.equal(getSupportTier(1000, tiers).name, 'BOOSTER');
  assert.deepEqual(splitContribution(10_000, 9000), { gross: 10_000, pool: 9_000, reserve: 1_000 });
  assert.deepEqual(splitContribution(10_000, 10_000), { gross: 10_000, pool: 10_000, reserve: 0 });
});

test('pool issuance is capped and podium distributions preserve the unallocated share', () => {
  assert.equal(calculateSeasonPool({ base: 100, activity: 100, commerce: 50, direct: 500, sponsors: 250, minimum: 0, maximum: 800, issuanceCap: 700 }), 700);
  assert.deepEqual(distributeSeasonPool(48_500, { first: 40, second: 25, third: 15 }), { first: 19_400, second: 12_125, third: 7_275, unallocated: 9_700 });
});

test('redemption covers at most half an eligible purchase and preserves cash due', () => {
  assert.deepEqual(calculateMaximumDiscount(5_000, 10_000, 1, 50), { appliedCents: 2_500, rgToRedeem: 2_500, cashCents: 2_500 });
  assert.equal(calculateMaximumDiscount(5_000, 500, 1, 50).cashCents, 4_500);
});

test('Premium awards extend active access and do not reduce a later expiry', () => {
  const now = new Date('2026-10-05T00:00:00.000Z');
  assert.equal(extendEntitlement(new Date('2026-11-20T00:00:00.000Z'), now, 30).toISOString(), '2026-12-20T00:00:00.000Z');
  assert.equal(extendEntitlement(null, now, 15).toISOString(), '2026-10-20T00:00:00.000Z');
});

test('purchased RG, sponsor funding, and contributions cannot become competitive score', () => {
  assert.equal(isScoreEligible({ scorePoints: 10, category: 'PERFORMANCE', origin: 'SPONSOR_CONTRIBUTION' }), false);
  assert.equal(isScoreEligible({ scorePoints: 10, category: 'PERFORMANCE', origin: 'PURCHASED_RG' }), false);
  assert.equal(isScoreEligible({ scorePoints: 10, category: 'CREATION', origin: 'TRACK_PUBLISHED' }), true);
});

test('verified source and milestone keys are stable; track publication key is lifetime-idempotent', () => {
  const input = { seasonId: 's1', eventType: 'YOUTUBE_VIEW_MILESTONE', sourceType: 'youtube_publication', sourceId: 'pub1', milestoneKey: '1000' };
  assert.equal(scoreEventIdempotencyKey(input), scoreEventIdempotencyKey({ ...input }));
  assert.notEqual(scoreEventIdempotencyKey(input), scoreEventIdempotencyKey({ ...input, milestoneKey: '5000' }));
  assert.equal(trackPublicationRewardKey('track1'), trackPublicationRewardKey('track1'));
  assert.deepEqual(getCrossedYoutubeMilestones(900, 5200, { '1000': { points: 3 }, '5000': { points: 4 }, '10000': { points: 6 } }), ['1000', '5000']);
  assert.deepEqual(getCrossedYoutubeMilestones(0, 5200, { '1000': { points: 3 } }), ['1000']);
});

test('economy simulation totals issuance, obligations, redemption exposure, and caps', () => {
  const result = simulateEconomy({ earnedRg: 1000, purchasedRg: 5000, userContributionsRg: 500, sponsorContributionsRg: 1000,
    rewardPoolRg: 1350, reserveRg: 150, redeemedRg: 100, eligibleSalesCents: 10_000, rgPerUsdCent: 1,
    maxDiscountPercent: 50, seasonIssuanceCap: 2000, maximumOutstandingRg: 10_000 });
  assert.equal(result.grossWalletIssuanceRg, 7000);
  assert.equal(result.walletOutstandingRg, 5400);
  assert.equal(result.outstandingRg, 6900);
  assert.equal(result.maximumDiscountExposureCents, 5000);
  assert.equal(result.withinSeasonIssuanceCap, false);
  assert.equal(result.withinOutstandingCap, true);
});
