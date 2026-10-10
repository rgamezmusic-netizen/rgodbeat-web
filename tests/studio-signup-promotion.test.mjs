import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadSource } from './helpers/rg-fixtures.mjs';

const { PGlite } = await import(pathToFileURL(process.env.RG_TEST_PGLITE_MODULE).href);
const migration = await readFile('supabase/migrations/20261012000000_studio_signup_promotion.sql', 'utf8');
let db;
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const scalar = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
const isolated = (name, fn) => test(name, async () => {
  await db.exec('BEGIN');
  try { await fn(); } finally { await db.exec('ROLLBACK'); }
});
const account = async ({ created = 'now()', verified = true, email = `${randomUUID()}@fixture.invalid`, metadata = {} } = {}) => {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users(id,email,created_at,email_confirmed_at,raw_user_meta_data)
    VALUES($1,$2,${created},${verified ? 'now()' : 'NULL'},$3)`, [id, email, metadata]);
  return id;
};
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email varchar(255),created_at timestamptz DEFAULT now(),email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE NOT NULL,name text,auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,studio_access_until timestamptz,updated_at timestamptz DEFAULT now());`);
  // Exercise the real commerce identity bridge and shared serialized extender.
  const commerce = await readFile('supabase/migrations/20261007000000_commerce_security_gift_foundation.sql', 'utf8');
  const bridge = commerce.match(/CREATE OR REPLACE FUNCTION public\.rg_commerce_link_verified_customer\(p_user_id uuid\)[\s\S]*?END \$\$;/)[0];
  const economy = await readFile('supabase/migrations/20261006000000_rg_score_economy.sql', 'utf8');
  const extender = economy.match(/CREATE FUNCTION public\.rg_extend_studio_access\(p_customer_id uuid,p_days integer\)[\s\S]*?END; \$\$;/)[0];
  await db.exec(bridge + extender);
  await db.exec(migration);
});
after(async () => { await db?.close(); });

isolated('verified new account automatically receives exactly 90 days without checkout', async () => {
  const id = await account();
  assert.equal(await scalar('SELECT studio_access_until = now() + interval \'90 days\' FROM customers WHERE auth_user_id=$1', [id]), true);
  assert.equal(await scalar('SELECT count(*) FROM studio_signup_grants WHERE user_id=$1', [id]), 1);
});
isolated('unverified account receives access only on confirmation, even after campaign closes', async () => {
  const id = await account({ verified: false, created: "now()-interval '20 days'" });
  assert.equal(await scalar('SELECT count(*) FROM studio_signup_grants'), 0);
  await db.exec("UPDATE studio_signup_campaign SET starts_at=now()-interval '31 days',ends_at=now()-interval '1 day'");
  await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [id]);
  assert.equal(await scalar('SELECT studio_access_until = now() + interval \'90 days\' FROM customers WHERE auth_user_id=$1', [id]), true);
});
isolated('old accounts and exact end boundary are ineligible; exact start is eligible', async () => {
  const old = await account({ created: "(SELECT starts_at-interval '1 microsecond' FROM studio_signup_campaign)", metadata: { studio_days: 90, created_at: '2099-01-01' } });
  const end = await account({ created: '(SELECT ends_at FROM studio_signup_campaign)' });
  const start = await account({ created: '(SELECT starts_at FROM studio_signup_campaign)' });
  assert.deepEqual((await rows('SELECT user_id FROM studio_signup_grants')).map(x => x.user_id), [start]);
  for (const id of [old, end]) {
    await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [id]);
    assert.equal(await scalar('SELECT rg_grant_signup_studio_access($1)', [id]), null);
  }
});
isolated('repeat confirmations, service retries and email changes cannot renew the grant', async () => {
  const id = await account();
  const until = await scalar('SELECT studio_access_until FROM customers WHERE auth_user_id=$1', [id]);
  await db.query('UPDATE auth.users SET email_confirmed_at=now(),email=$2 WHERE id=$1', [id, `${randomUUID()}@fixture.invalid`]);
  assert.equal(await scalar('SELECT rg_grant_signup_studio_access($1)', [id]), null);
  assert.equal((await scalar('SELECT studio_access_until FROM customers WHERE auth_user_id=$1', [id])).getTime(), until.getTime());
  assert.equal(await scalar('SELECT count(*) FROM studio_signup_grants'), 1);
});
isolated('deleting and recreating a previously rewarded email cannot claim again', async () => {
  const email = `${randomUUID()}@fixture.invalid`;
  const id = await account({ email });
  await db.query('DELETE FROM auth.users WHERE id=$1', [id]);
  const replacement = await account({ email: email.toUpperCase() });
  assert.equal(await scalar('SELECT count(*) FROM studio_signup_grants'), 1);
  assert.equal(await scalar('SELECT rg_grant_signup_studio_access($1)', [replacement]), null);
});
isolated('guest customer and existing paid access are preserved and extended by 90 days', async () => {
  const email = `${randomUUID()}@fixture.invalid`, customer = randomUUID();
  await db.query("INSERT INTO customers(id,email,name,studio_access_until) VALUES($1,$2,'Existing buyer',now()+interval '45 days')", [customer,email]);
  const id = await account({ email });
  assert.equal(await scalar('SELECT id FROM customers WHERE auth_user_id=$1', [id]), customer);
  assert.equal(await scalar("SELECT studio_access_until=now()+interval '135 days' FROM customers WHERE id=$1", [customer]), true);
  await db.query('SELECT rg_extend_studio_access($1,30)', [customer]);
  assert.equal(await scalar("SELECT studio_access_until=now()+interval '165 days' FROM customers WHERE id=$1", [customer]), true);
});
isolated('expired access starts 90 days from confirmation and rollback removes the entire grant', async () => {
  const email = `${randomUUID()}@fixture.invalid`;
  await db.query("INSERT INTO customers(email,studio_access_until) VALUES($1,now()-interval '2 days')", [email]);
  await db.exec('SAVEPOINT signup');
  const id = await account({ email });
  assert.equal(await scalar("SELECT studio_access_until=now()+interval '90 days' FROM customers WHERE auth_user_id=$1", [id]), true);
  await db.exec('ROLLBACK TO SAVEPOINT signup');
  assert.equal(await scalar('SELECT count(*) FROM studio_signup_grants'), 0);
  assert.equal(await scalar("SELECT studio_access_until=now()-interval '2 days' FROM customers WHERE email=$1", [email]), true);
});
isolated('clients cannot edit campaign, inspect grant emails or execute grant function', async () => {
  for (const role of ['anon','authenticated']) {
    for (const table of ['studio_signup_campaign','studio_signup_grants']) {
      assert.equal(await scalar(`SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE')`, [role,table]), false);
      assert.equal(await scalar('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [table]), true);
    }
    assert.equal(await scalar("SELECT has_function_privilege($1,'rg_grant_signup_studio_access(uuid)','EXECUTE')", [role]), false);
  }
});
isolated('database status ends exactly at deadline', async () => {
  assert.equal(await scalar('SELECT active FROM rg_signup_studio_campaign_status()'), true);
  await db.exec("UPDATE studio_signup_campaign SET starts_at=now()-interval '720 hours',ends_at=now()");
  assert.equal(await scalar('SELECT active FROM rg_signup_studio_campaign_status()'), false);
});
test('reapplying migration does not restart campaign or renew granted access', async () => {
  const id = await account();
  const starts = await scalar('SELECT starts_at FROM studio_signup_campaign');
  const until = await scalar('SELECT studio_access_until FROM customers WHERE auth_user_id=$1', [id]);
  await db.exec(migration);
  assert.equal((await scalar('SELECT starts_at FROM studio_signup_campaign')).getTime(), starts.getTime());
  assert.equal((await scalar('SELECT studio_access_until FROM customers WHERE auth_user_id=$1', [id])).getTime(), until.getTime());
});
test('public endpoint never advertises an unavailable or expired offer', async () => {
  for (const result of [{data:null,error:{code:'missing'}}, {data:[],error:null}, {data:[{active:false,ends_at:'2026-11-01',server_time:'2026-11-02'}],error:null}]) {
    const { GET } = loadSource('app/api/auth/signup-promotion/route.ts', {
      '@/lib/commerce/admin-client': { createCommerceAdminClient: () => ({ rpc: async () => result }) },
    });
    const response = await GET();
    assert.equal((await response.json()).active, false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
