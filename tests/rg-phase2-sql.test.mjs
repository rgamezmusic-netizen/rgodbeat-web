import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { dependencyFixture } from './helpers/rg-fixtures.mjs';

// Temporary test runner dependency only: see docs/rg-phase2-verification.md.
const modulePath = process.env.RG_TEST_PGLITE_MODULE;
if (!modulePath) throw new Error('Set RG_TEST_PGLITE_MODULE to the isolated PGlite installation. No production database is used.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
let db;
const preflightSql = await readFile('supabase/preflight/20261006000000_rg_score_economy_preflight.sql','utf8');
const query = async (sql, params = []) => {
  await db.exec('SAVEPOINT assertion_query');
  try {
    const rows = (await db.query(sql, params)).rows.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k,typeof v==='string' && /^-?\d+$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : v])));
    await db.exec('RELEASE SAVEPOINT assertion_query'); return rows;
  } catch (error) {
    await db.exec('ROLLBACK TO SAVEPOINT assertion_query; RELEASE SAVEPOINT assertion_query'); throw error;
  }
};
const scalar = async (sql, params = []) => Object.values((await query(sql, params))[0])[0];
const rpc = (name, args) => (name==='rg_current_rank_totals' ? query : scalar)(`SELECT ${name==='rg_current_rank_totals' ? '* FROM ' : ''}public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);
const transaction = (name, fn) => test(name, async () => {
  await db.exec('BEGIN');
  try { await fn(); } finally { await db.exec('ROLLBACK'); }
});
async function artist() {
  const user = randomUUID(), id = randomUUID();
  await query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user, `${user}@fixture.invalid`]);
  await query('INSERT INTO rg_artists(id,user_id,stage_name,slug) VALUES($1,$2,$3,$4)', [id, user, 'Fixture artist', 'a-' + id]);
  return { user, artist: id };
}
async function publication(owner, beat = null, track = null, views = null) {
  track ??= await rpc('create_rg_track', [owner.user, owner.artist, 'Fixture song', beat]);
  const job = randomUUID(), video = randomUUID();
  await query("INSERT INTO youtube_export_jobs(id,user_id,status,youtube_video_id,finished_at) VALUES($1,$2,'uploaded',$3,now())", [job, owner.user, video]);
  const id = await rpc('record_rg_publication_link', [owner.user, owner.artist, track, beat, job, video]);
  if (views !== null) await query("INSERT INTO rg_youtube_metric_snapshots(publication_id,observed_day,view_count,captured_at) VALUES($1,(now() AT TIME ZONE 'UTC')::date-1,900,now()-interval '1 day'),($1,(now() AT TIME ZONE 'UTC')::date,$2,now())", [id, views]);
  return { ...owner, track, beat, id, job, video };
}
const publishedScore = (p) => rpc('rg_record_score_event', ['TRACK_PUBLISHED', p.artist, p.track, p.beat, p.id, 'rg_publication_link', p.id]);
const milestone = (p, key, views) => scalar('SELECT rg_record_score_event($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)', ['YOUTUBE_VIEW_MILESTONE', p.artist, p.track, p.beat, p.id, 'youtube_publication', p.id, key, { view_count: views }]);
const contribute = (season, user, amount, source = randomUUID(), key = source) => rpc('rg_contribute_to_pool', [season, user, null, amount, 'wallet_contribution', source, key]);
const credit = (user, amount, season, key = randomUUID(), origin = 'EARNED_RG') => rpc('rg_credit_coins', [user, null, amount, origin, 'Fixture credit', 'verified_fixture', key, key, season]);
const seasonId = () => scalar("SELECT id FROM rg_seasons WHERE status='active'");
const configure = () => db.exec('UPDATE rg_economy_config SET maximum_outstanding_rg=1000000,season_issuance_cap=100000,maximum_pool_rg=200000');
before(async () => {
  db = new PGlite();
  await db.exec(dependencyFixture);
  await db.exec(await readFile('supabase/migrations/20261005000000_rg_identity_publications.sql', 'utf8'));
  const youtubeMigration = await readFile('supabase/migrations/20261003000001_youtube_channel.sql','utf8');
  const reservation = youtubeMigration.slice(youtubeMigration.indexOf('CREATE OR REPLACE FUNCTION public.reserve_youtube_export_job'),youtubeMigration.indexOf('COMMIT;'));
  await db.exec(reservation);
  const preflight = (await db.query(preflightSql)).rows;
  assert.ok(preflight.length > 100);
  assert.deepEqual(preflight.filter(row=>!row.ready), [], 'Preflight must be executable and all TRUE against compatible dependency fixtures before migration.');
  assert.equal(preflight.find(row=>row.check_name==='column:auth.users.email').actual_type,'character varying(255)');
  await db.exec(await readFile('supabase/migrations/20261006000000_rg_score_economy.sql', 'utf8'));
});
after(async () => { await db?.close(); });

transaction('every Phase 2 table explicitly enables RLS and denies direct client access', async () => {
  const migration = await readFile('supabase/migrations/20261006000000_rg_score_economy.sql','utf8');
  const tables = [...migration.matchAll(/CREATE TABLE public\.(rg_\w+)\s*\(/g)].map(match=>match[1]);
  assert.equal(tables.length,14);
  for (const table of tables) {
    assert.ok(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`),`${table} must have an explicit RLS statement.`);
  }
  const rows = await query(`SELECT c.relname,c.relrowsecurity,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_access,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_access,
    has_table_privilege('service_role',c.oid,'SELECT') AS server_read
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[tables]);
  assert.equal(rows.length,tables.length);
  for (const row of rows) {
    assert.equal(row.relrowsecurity,true,row.relname);
    assert.equal(row.anon_access,false,row.relname);
    assert.equal(row.authenticated_access,false,row.relname);
    assert.equal(row.server_read,true,row.relname);
  }
});

transaction('preflight accepts text/varchar email and rejects missing, incompatible or unreadable email', async () => {
  const check = async () => {
    const rows = await query(preflightSql);
    return {
      column: rows.find(row=>row.check_name==='column:auth.users.email'),
      readable: rows.find(row=>row.check_name==='editor_can_read_auth_email'),
    };
  };
  assert.deepEqual((await check()).column,{check_name:'column:auth.users.email',ready:true,actual_type:'character varying(255)'});
  await query('ALTER TABLE auth.users ALTER COLUMN email TYPE text');
  assert.deepEqual((await check()).column,{check_name:'column:auth.users.email',ready:true,actual_type:'text'});
  await query('ALTER TABLE auth.users ALTER COLUMN email TYPE boolean USING NULL::boolean');
  assert.deepEqual((await check()).column,{check_name:'column:auth.users.email',ready:false,actual_type:'boolean'});
  await query('ALTER TABLE auth.users DROP COLUMN email');
  assert.deepEqual((await check()).column,{check_name:'column:auth.users.email',ready:false,actual_type:null});
  assert.equal((await check()).readable.ready,false);
  await query('ALTER TABLE auth.users ADD COLUMN email varchar(255)');
  await query('GRANT USAGE ON SCHEMA auth TO authenticated');
  await query('GRANT SELECT(id) ON auth.users TO authenticated');
  await query('SET LOCAL ROLE authenticated');
  const denied = await check();
  assert.equal(denied.column.ready,true,'Catalog presence and type are independent of SELECT access.');
  assert.equal(denied.readable.ready,false,'Unreadable email must block the preflight.');
  await query('RESET ROLE');
});

transaction('real Phase 1 RPCs verify owner, beat, draft, primary artist and uploaded job before Score', async () => {
  const owner = await artist(), foreign = await artist(), beat = randomUUID();
  await query('INSERT INTO beats(id) VALUES($1)', [beat]);
  const track = await rpc('create_rg_track', [owner.user, owner.artist, 'Real fixture draft', beat]);
  assert.equal(await scalar('SELECT status FROM rg_tracks WHERE id=$1', [track]), 'draft');
  assert.equal(await scalar("SELECT count(*) FROM rg_track_artists WHERE track_id=$1 AND artist_id=$2 AND role='primary'", [track, owner.artist]), 1);
  await assert.rejects(() => rpc('create_rg_track', [foreign.user, owner.artist, 'Spoof', beat]), /artist_unavailable/);
  await assert.rejects(() => rpc('create_rg_track', [owner.user, owner.artist, 'Bad beat', randomUUID()]), /beat_unavailable/);
  await assert.rejects(() => query('INSERT INTO rg_artists(user_id,stage_name,slug) VALUES($1,$2,$3)', [owner.user, 'Second', 'second']), /unique/);
  const job = randomUUID(); await query("INSERT INTO youtube_export_jobs(id,user_id,status) VALUES($1,$2,'reserved')", [job, owner.user]);
  await assert.rejects(() => rpc('record_rg_publication_link', [owner.user, owner.artist, track, beat, job, 'video']), /youtube_job_unverified/);
  assert.equal(await scalar('SELECT status FROM rg_tracks WHERE id=$1', [track]), 'draft');
  const p = await publication(owner, beat, track), score = await publishedScore(p);
  assert.equal(await publishedScore(p), score);
  const republished = await publication(owner, beat, track); assert.equal(await publishedScore(republished), score);
  assert.equal(await scalar('SELECT count(*) FROM rg_score_events'), 1);
  assert.equal(await rpc('record_rg_publication_link', [owner.user, owner.artist, track, beat, p.job, p.video]), p.id);
  await assert.rejects(() => rpc('record_rg_publication_link', [owner.user, owner.artist, track, null, p.job, p.video]), /track_beat_mismatch/);
  const second = await rpc('create_rg_track', [owner.user, owner.artist, 'Second song', beat]);
  await assert.rejects(() => rpc('record_rg_publication_link', [owner.user, owner.artist, second, beat, p.job, p.video]), /already_linked/);
  await query('UPDATE youtube_export_jobs SET youtube_video_id=$1 WHERE id=$2', [p.video, republished.job]);
  await assert.rejects(() => rpc('record_rg_publication_link', [owner.user, owner.artist, second, beat, republished.job, p.video]), /already_linked/);
});
transaction('one actual Score ledger powers all rankings, nullable beat never enters Beat ranking', async () => {
  const a = await artist(), beat = randomUUID(); await query('INSERT INTO beats(id) VALUES($1)', [beat]);
  await publishedScore(await publication(a)); await publishedScore(await publication(a, beat));
  const ranks = await rpc('rg_current_rank_totals', [await seasonId()]);
  assert.equal(ranks.filter(r => r.ranking_type === 'tracks').length, 2);
  assert.equal(ranks.find(r => r.ranking_type === 'artists').score, 20);
  assert.equal(ranks.find(r => r.ranking_type === 'beats').score, 10);
});
transaction('milestone is lifetime-idempotent even at cap and requires persisted server evidence', async () => {
  const p = await publication(await artist(), null, null, 100000);
  const keys = ['1000','5000','10000','25000','50000','100000'];
  for (const key of keys) await milestone(p, key, 100000);
  const first = await milestone(p, '1000', 100000);
  assert.equal(await milestone(p, '1000', 100000), first);
  assert.equal(await scalar('SELECT count(*) FROM rg_score_events'), 6);
  const other = await publication({ user:p.user, artist:p.artist }, null, null, 5000);
  await assert.rejects(() => milestone(other, '1000', 5000), /score_artist_season_cap/);
  const missing = await publication(await artist());
  await assert.rejects(() => milestone(missing, '1000', 1000), /snapshot_unverified/);
});
transaction('publication cap blocks trivial-track farming; old publications cannot be newly scored', async () => {
  const a = await artist();
  for (let n=0;n<10;n++) await publishedScore(await publication(a));
  await assert.rejects(() => publishedScoreFromOwner(a), /score_artist_season_cap/);
  const old = await publication(await artist()); await query("UPDATE rg_publication_links SET published_at=now()-interval '30 days' WHERE id=$1", [old.id]);
  await assert.rejects(() => publishedScore(old), /outside_season/);
});
async function publishedScoreFromOwner(a) { return publishedScore(await publication(a)); }
transaction('default money switches and issuance caps fail closed; client roles cannot mutate or call privileged RPCs', async () => {
  const a=await artist(), season=await seasonId();
  await assert.rejects(() => credit(a.user, 1, season), /season_issuance_cap/);
  await assert.rejects(() => credit(a.user, 1, season, randomUUID(), 'PURCHASED_RG'), /fulfillment_disabled/);
  const b = await query("SELECT purchases_enabled,redemption_enabled,sponsor_fulfillment_enabled,maximum_outstanding_rg,season_issuance_cap,maximum_pool_rg FROM rg_economy_config");
  assert.deepEqual(Object.values(b[0]), [false,false,false,0,0,0]);
  for (const role of ['anon','authenticated']) {
    assert.equal(await scalar("SELECT has_function_privilege($1,'public.rg_credit_coins(uuid,uuid,bigint,text,text,text,text,text,uuid,jsonb)','EXECUTE')", [role]), false);
    const privileges=await query("SELECT tablename,has_table_privilege($1,'public.'||tablename,'INSERT') AS insertable,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'rg_%' AND tablename NOT IN ('rg_artists','rg_tracks','rg_track_artists','rg_publication_links')", [role]);
    assert.ok(privileges.length>=14); assert.ok(privileges.every(x=>x.rowsecurity&&!x.insertable));
  }
});
transaction('coin credit, debit, source uniqueness, atomic pool split and negative-balance protection', async () => {
  await configure(); const a=await artist(), season=await seasonId(), key=randomUUID();
  const id=await credit(a.user,20000,season,key); assert.equal(await credit(a.user,20000,season,key),id);
  await assert.rejects(()=>credit(a.user,20001,season,key),/idempotency_key_conflict/);
  await assert.rejects(()=>rpc('rg_credit_coins',[a.user,null,20000,'EARNED_RG','Fixture credit','verified_fixture',key,randomUUID(),season]),/unique/);
  const source=randomUUID(), tx=await contribute(season,a.user,1000,source);
  assert.equal(await contribute(season,a.user,1000,source),tx);
  assert.deepEqual(await query('SELECT pool_rg,reserve_rg FROM rg_reward_pool_totals WHERE season_id=$1',[season]),[{pool_rg:900,reserve_rg:100}]);
  await contribute(season,a.user,10000);
  assert.deepEqual(await query('SELECT pool_rg,reserve_rg FROM rg_reward_pool_totals WHERE season_id=$1',[season]),[{pool_rg:10200,reserve_rg:800}]);
  assert.equal(await scalar('SELECT balance_rg FROM rg_coin_balances WHERE user_id=$1',[a.user]),9000);
  await assert.rejects(()=>contribute(season,a.user,10000),/insufficient_rg_balance/);
  await assert.rejects(()=>contribute(season,a.user,1000,source,randomUUID()),/unique/);
  assert.equal(await scalar('SELECT balance_rg FROM rg_coin_balances WHERE user_id=$1',[a.user]),9000);
  assert.equal(await scalar('SELECT sum(amount) + (SELECT sum(pool_rg+reserve_rg) FROM rg_reward_pool_transactions) FROM rg_coin_ledger'),20000);
  await assert.rejects(()=>query('UPDATE rg_coin_ledger SET amount=amount+1'),/append_only/);
});
transaction('support cycles reset after 90 days and retain historical contributions after auth deletion', async () => {
  await configure();const a=await artist(),season=await seasonId();await credit(a.user,3000,season);await contribute(season,a.user,1000);
  await db.exec("UPDATE rg_economy_config SET support_anchor_at=now()-interval '90 days'");
  await contribute(season,a.user,1000);
  assert.deepEqual((await query('SELECT cycle_number,contributed_rg FROM rg_support_cycles ORDER BY cycle_number')).map(r=>[r.cycle_number,r.contributed_rg]),[[0,1000],[1,1000]]);
  await query('DELETE FROM auth.users WHERE id=$1',[a.user]);
  assert.equal(await scalar('SELECT count(*) FROM rg_support_cycles'),2);
  assert.equal(await scalar('SELECT sum(amount) FROM rg_coin_ledger'),1000);
});
transaction('sponsor funding is separate from Score, conserves supply and cannot trust a payment claim', async () => {
  await configure();const p=await publication(await artist());await publishedScore(p);const season=await seasonId(),sponsor=randomUUID(),source=randomUUID();
  await query("INSERT INTO rg_sponsors(id,name,slug,status,logo_path,website_url) VALUES($1,'Sponsor','fixture-sponsor','active','approved/logo.png','https://example.com')",[sponsor]);
  const before=await rpc('rg_current_rank_totals',[season]);
  const run=()=>rpc('rg_contribute_to_pool',[season,null,sponsor,1000,'stripe_checkout_session',source,source]);
  await assert.rejects(run,/sponsor_fulfillment_disabled/);
  await db.exec('UPDATE rg_economy_config SET sponsor_fulfillment_enabled=true');
  await assert.rejects(run,/sponsorship_not_verified/);
  await query("INSERT INTO rg_season_sponsorships(sponsor_id,season_id,contribution_rg,payment_reference,status,starts_at,ends_at) VALUES($1,$2,1000,$3,'active',now(),now()+interval '14 days')",[sponsor,season,source]);
  const id=await run(); assert.equal(await run(),id);
  assert.equal(await scalar('SELECT pool_rg FROM rg_reward_pool_totals WHERE season_id=$1',[season]),900);
  assert.equal(await scalar('SELECT reserve_rg FROM rg_reward_pool_totals WHERE season_id=$1',[season]),100);
  const secondSource=randomUUID();
  await query("INSERT INTO rg_season_sponsorships(sponsor_id,season_id,contribution_rg,payment_reference,status,starts_at,ends_at) VALUES($1,$2,10000,$3,'active',now(),now()+interval '14 days')",[sponsor,season,secondSource]);
  await rpc('rg_contribute_to_pool',[season,null,sponsor,10000,'stripe_checkout_session',secondSource,secondSource]);
  assert.equal(await scalar('SELECT pool_rg FROM rg_reward_pool_totals WHERE season_id=$1',[season]),10200);
  assert.equal(await scalar('SELECT reserve_rg FROM rg_reward_pool_totals WHERE season_id=$1',[season]),800);
  assert.equal(await scalar('SELECT count(*) FROM rg_score_events'),1);
  assert.deepEqual(await rpc('rg_current_rank_totals',[season]),before);
  // This fixture models a trusted fulfillment record, not a real Stripe confirmation.
});
transaction('daily scheduled snapshots and repeat finalization are idempotent; Premium expiry never shortens', async () => {
  await configure(); const season=await seasonId();
  const owners=[];
  for(let i=0;i<3;i++){const a=await artist();owners.push(a);await publishedScore(await publication(a));}
  const ordered=(await rpc('rg_current_rank_totals',[season])).filter(r=>r.ranking_type==='artists').sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
  const future='2030-11-20T00:00:00.000Z';
  for(const a of owners)await query("INSERT INTO customers(email,name,studio_access_until) SELECT email,'Existing customer',$2 FROM auth.users WHERE id=$1",[a.user,future]);
  const run=await rpc('rg_capture_rank_snapshot',[season,false]); assert.equal(await rpc('rg_capture_rank_snapshot',[season,false]),run);
  await credit(owners[0].user,1000,season); await contribute(season,owners[0].user,1000);
  await query("UPDATE rg_seasons SET starts_at=now()-interval '14 days',ends_at=now()-interval '1 second',status='ended' WHERE id=$1",[season]);
  assert.equal(await rpc('rg_finalize_season',[season]),true);
  assert.equal(await rpc('rg_finalize_season',[season]),true);
  const rewards=await query('SELECT artist_id,coin_rg,premium_days,premium_expires_at FROM rg_season_rewards ORDER BY place');
  assert.equal(rewards.length,3);
  assert.deepEqual(rewards.map(r=>r.coin_rg),[360,225,135]);
  assert.deepEqual(rewards.map(r=>r.premium_days),[30,15,15]);
  assert.equal(new Date(rewards[0].premium_expires_at).toISOString(),'2030-12-20T00:00:00.000Z');
  assert.equal(new Date(rewards[1].premium_expires_at).toISOString(),'2030-12-05T00:00:00.000Z');
  assert.equal(await scalar('SELECT pool_rg FROM rg_reward_pool_totals WHERE season_id=$1',[season]),180);
  const frozen=await rpc('rg_current_rank_totals',[season]);
  await query("UPDATE rg_artists SET status='retired' WHERE id=$1",[ordered[0].entity_id]);
  assert.deepEqual(await rpc('rg_current_rank_totals',[season]),frozen);
  await assert.rejects(()=>query('UPDATE rg_seasons SET name=$1 WHERE id=$2',['Changed',season]),/immutable/);
  await assert.rejects(()=>query('UPDATE rg_season_finalizations SET final_pool_rg=1'),/append_only/);
});
transaction('SQL Premium awards extend expired/null access and handle deleted owners safely', async () => {
  await configure();const season=await seasonId(),owners=[];
  for(let i=0;i<3;i++){const a=await artist();owners.push(a);await publishedScore(await publication(a));}
  await query("INSERT INTO customers(email,studio_access_until) SELECT email,now()-interval '5 days' FROM auth.users WHERE id=$1",[owners[0].user]);
  await query("INSERT INTO customers(email,studio_access_until) SELECT email,NULL FROM auth.users WHERE id=$1",[owners[1].user]);
  await query('DELETE FROM auth.users WHERE id=$1',[owners[2].user]);
  await query("UPDATE rg_seasons SET starts_at=now()-interval '14 days',ends_at=now()-interval '1 second',status='ended' WHERE id=$1",[season]);
  await rpc('rg_finalize_season',[season]);
  assert.equal(await scalar('SELECT count(*) FROM rg_season_rewards'),3);
  assert.equal(await scalar('SELECT count(*) FROM rg_season_rewards WHERE user_id IS NULL'),1);
  assert.equal(await scalar('SELECT count(*) FROM customers WHERE studio_access_until>now()'),2);
});
transaction('season boundaries create one active season, preserve finalized history and reject early finalization',async()=>{
  const id=await seasonId();
  await assert.rejects(()=>rpc('rg_finalize_season',[id]),/not_ready/);
  await assert.rejects(()=>rpc('rg_capture_rank_snapshot',[id,true]),/not_ready/);
  const next=await scalar("SELECT rg_ensure_seasons((SELECT ends_at FROM rg_seasons WHERE id=$1))",[id]);
  assert.notEqual(next,id);assert.equal(await scalar("SELECT count(*) FROM rg_seasons WHERE status='active'"),1);
  assert.equal(await scalar('SELECT status FROM rg_seasons WHERE id=$1',[id]),'ended');
  assert.equal(await scalar('SELECT (extract(epoch FROM ends_at-starts_at)/86400)::integer FROM rg_seasons WHERE id=$1',[next]),14);
});
transaction('minting and pool caps reject excess atomically; retry after closure returns prior contribution',async()=>{
  await configure();const a=await artist(),season=await seasonId(),source=randomUUID();
  await assert.rejects(()=>credit(a.user,100001,season),/issuance_cap/);
  await credit(a.user,1000,season);
  await db.exec('UPDATE rg_economy_config SET maximum_pool_rg=800');
  await assert.rejects(()=>contribute(season,a.user,1000,source),/pool_cap/);
  assert.equal(await scalar('SELECT balance_rg FROM rg_coin_balances WHERE user_id=$1',[a.user]),1000);
  assert.equal(await scalar('SELECT count(*) FROM rg_reward_pool_transactions'),0);
  await db.exec('UPDATE rg_economy_config SET maximum_pool_rg=2000');
  const id=await contribute(season,a.user,1000,source);
  await query("UPDATE rg_seasons SET status='ended',starts_at=now()-interval '14 days',ends_at=now()-interval '1 second' WHERE id=$1",[season]);
  assert.equal(await contribute(season,a.user,1000,source),id);
  await assert.rejects(()=>contribute(season,a.user,1),/season_unavailable/);
});
transaction('delayed verified publication scores its original unfinished season, and cannot alter finalized results',async()=>{
  const p=await publication(await artist()),season=await seasonId();
  await query("UPDATE rg_seasons SET starts_at=now()-interval '14 days',ends_at=now()-interval '1 second',status='ended' WHERE id=$1",[season]);
  await query("UPDATE rg_publication_links SET published_at=now()-interval '1 hour' WHERE id=$1",[p.id]);
  const score=await publishedScore(p);
  assert.equal(await scalar('SELECT season_id FROM rg_score_events WHERE id=$1',[score]),season);
  await rpc('rg_finalize_season',[season]);assert.equal(await publishedScore(p),score);
  const newTrack=await publication({user:p.user,artist:p.artist});
  await query("UPDATE rg_publication_links SET published_at=now()-interval '1 hour' WHERE id=$1",[newTrack.id]);
  await assert.rejects(()=>publishedScore(newTrack),/outside_season/);
  assert.equal(await scalar('SELECT count(*) FROM rg_score_events'),1);
});
transaction('shared commerce/Premium entitlement RPC extends the existing future field and is service-only',async()=>{
  const a=await artist();const id=await scalar("INSERT INTO customers(email,studio_access_until) SELECT email,'2030-11-20T00:00:00Z' FROM auth.users WHERE id=$1 RETURNING id",[a.user]);
  assert.equal(new Date(await rpc('rg_extend_studio_access',[id,30])).toISOString(),'2030-12-20T00:00:00.000Z');
  assert.equal(new Date(await rpc('rg_extend_studio_access',[id,15])).toISOString(),'2031-01-04T00:00:00.000Z');
  await assert.rejects(()=>rpc('rg_extend_studio_access',[id,0]),/invalid_studio_extension/);
  assert.equal(await scalar("SELECT has_function_privilege('authenticated','public.rg_extend_studio_access(uuid,integer)','EXECUTE')"),false);
});
transaction('SQL season timestamps pin UTC and stay exactly 14 days through DST regardless of caller timezone',async()=>{
  await db.exec("SET LOCAL timezone='America/Chicago'");
  await db.exec("UPDATE rg_economy_config SET season_anchor_at='2026-10-05T00:00:00Z'");
  // Seeded periods are fixture-only; discard them before checking the configured historical anchor.
  await db.exec('DELETE FROM rg_seasons');
  await rpc('rg_ensure_seasons',['2026-11-16T00:00:00Z']);
  assert.ok((await query('SELECT (extract(epoch FROM ends_at-starts_at)/86400)::integer AS days FROM rg_seasons')).every(row=>row.days===14));
  assert.equal(await scalar("SELECT season_number FROM rg_seasons WHERE status='active'"),4);
});
