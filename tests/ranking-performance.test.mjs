import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

// Delayed local queries exercise the real projection without touching Supabase.
function database(failedTable) {
  const events = [];
  const tables = {
    rg_seasons: [{ id: 'season', ends_at: '2026-10-15T00:00:00Z' }],
    rg_reward_pool_totals: [{ pool_rg: '500' }],
    rg_season_sponsorships: [],
    rg_rank_snapshot_runs: [{ id: 'snapshot' }],
    rg_rank_snapshots: [{ ranking_type: 'tracks', entity_id: 'track', rank: 3 }],
    rg_tracks: [{ id: 'track', title: 'Track', beat_id: 'beat' }],
    rg_artists: [{ id: 'artist', stage_name: 'Artist', slug: 'artist' }],
    beats: [{ id: 'beat', title: 'Beat', slug: 'beat' }],
    rg_track_artists: [{ track_id: 'track', artist_id: 'artist', role: 'primary' }],
  };
  async function execute(name, data) {
    events.push(`start:${name}`);
    await new Promise(resolve => setTimeout(resolve, 5));
    events.push(`end:${name}`);
    return { data, error: name === failedTable ? { message: 'Unavailable' } : null };
  }
  return {
    events,
    rpc(name) {
      return execute(name, name === 'rg_ensure_seasons' ? 'season' : [
        { ranking_type: 'tracks', entity_id: 'track', score: '10' },
        { ranking_type: 'beats', entity_id: 'beat', score: '10' },
      ]);
    },
    from(name) {
      let one = false;
      const inclusions = [];
      const q = {
        select() { return q; }, eq() { return q; }, lte() { return q; },
        order() { return q; }, limit() { return q; },
        in(column, values) { inclusions.push([column, values]); return q; },
        single() { one = true; return q; }, maybeSingle() { one = true; return q; },
        then(resolve, reject) {
          const rows = (tables[name] ?? []).filter(row => inclusions.every(([column, values]) => values.includes(row[column])))
            .map(row => ({ ...row }));
          return execute(name, one ? rows[0] ?? null : rows).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

test('season reads overlap while ranks, movement and unranked primary artists stay accurate', async () => {
  const db = database();
  const { getRgSeasonRankings } = loadSource('lib/rg/phase2/rankings.ts', {
    './database': { createPhase2AdminClient: () => db },
  });
  const result = await getRgSeasonRankings(new Date('2026-10-10T00:00:00Z'));
  for (const query of ['rg_current_rank_totals', 'rg_rank_snapshot_runs', 'rg_season_sponsorships']) {
    assert.ok(db.events.indexOf(`start:${query}`) < db.events.indexOf('end:rg_reward_pool_totals'), `${query} must not wait for the pool`);
  }
  assert.equal(result.rewardPoolRg, 500);
  assert.deepEqual(result.rankings.artists, []);
  assert.equal(result.rankings.tracks[0].artist.stage_name, 'Artist');
  assert.equal(result.rankings.tracks[0].rank, 1);
  assert.equal(result.rankings.tracks[0].previousRank, 3);
  assert.equal(result.rankings.tracks[0].movement, 2);
  assert.equal(result.rankings.beats[0].beat.slug, 'beat');
});

test('parallel read failures remain unavailable instead of returning fabricated rankings', async () => {
  for (const failedTable of ['rg_current_rank_totals', 'rg_rank_snapshot_runs', 'rg_rank_snapshots', 'rg_tracks']) {
    const db = database(failedTable);
    const { getRgSeasonRankings } = loadSource('lib/rg/phase2/rankings.ts', {
      './database': { createPhase2AdminClient: () => db },
    });
    await assert.rejects(getRgSeasonRankings(), /could not/);
  }
});
