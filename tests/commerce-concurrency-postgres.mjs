import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const expectedDatabase = 'rgodbeat_validation';
const beatId = 'e945fabb-86f7-45fd-b879-734ea211b500';
const orderA = '41000000-0000-4000-8000-000000000001';
const orderB = '41000000-0000-4000-8000-000000000002';
const orderC = '42000000-0000-4000-8000-000000000001';
const itemA = '51000000-0000-4000-8000-000000000001';
const itemB = '51000000-0000-4000-8000-000000000002';
const itemC = '52000000-0000-4000-8000-000000000001';
const intentC = '32000000-0000-4000-8000-000000000001';
const giftC = '62000000-0000-4000-8000-000000000001';
const tokenC = '72000000-0000-4000-8000-000000000001';
const userC = '12000000-0000-4000-8000-000000000001';
const customerC = '22000000-0000-4000-8000-000000000001';
const psqlArgs = ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', '-d', expectedDatabase];

if (process.env.PGDATABASE !== expectedDatabase || process.env.PGPORT !== '55439'
  || !process.env.PGHOST?.includes('rgodbeat-sock')) {
  throw new Error('Set PGHOST=/private/tmp/rgodbeat-sock.kgznUf PGPORT=55439 PGUSER=rafael PGDATABASE=rgodbeat_validation');
}

function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [...psqlArgs, '-c', sql], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim())));
  });
}

function hold(sql) {
  const child = spawn('psql', [...psqlArgs, '-c', sql], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim())));
  });
  return { done };
}

await query(`DO $$ BEGIN IF current_database()<>'${expectedDatabase}' THEN RAISE EXCEPTION 'wrong database'; END IF; END $$;
DELETE FROM public.transactional_email_jobs WHERE source_id='${orderA}' AND message_type='lease_race';
UPDATE public.customers SET studio_access_until=(SELECT prior_until FROM public.commerce_studio_access_grants WHERE source_type='order' AND source_id='${orderA}')
 WHERE id='00000000-0000-4000-8000-000000000001' AND EXISTS (SELECT 1 FROM public.commerce_studio_access_grants WHERE source_type='order' AND source_id='${orderA}');
DELETE FROM public.commerce_studio_access_grants WHERE source_type='order' AND source_id='${orderA}';
DELETE FROM public.gift_claim_contexts WHERE gift_id='${giftC}';
DELETE FROM public.gift_claim_tokens WHERE id='${tokenC}';
DELETE FROM public.beat_gifts WHERE id='${giftC}';
DELETE FROM public.commerce_studio_access_grants WHERE source_type='gift' AND source_id='${intentC}';
DELETE FROM public.purchases WHERE order_id='${orderC}';
DELETE FROM public.beat_exclusive_inventory WHERE order_id IN ('${orderA}','${orderB}');
DELETE FROM public.order_items WHERE id IN ('${itemA}','${itemB}','${itemC}');
DELETE FROM public.orders WHERE id IN ('${orderA}','${orderB}','${orderC}');
DELETE FROM public.commerce_checkout_intents WHERE id='${intentC}';
DELETE FROM public.customers WHERE id='${customerC}';
DELETE FROM auth.users WHERE id='${userC}';
INSERT INTO public.orders(id,customer_id,stripe_checkout_session_id,status,payment_status,currency,subtotal_amount,total_amount)
 VALUES('${orderA}','00000000-0000-4000-8000-000000000001','cs_race_a','processing','paid','usd',499,499),
       ('${orderB}','00000000-0000-4000-8000-000000000001','cs_race_b','processing','paid','usd',499,499);
INSERT INTO public.order_items(id,order_id,beat_id,license_type_id,unit_price,currency)
 SELECT '${itemA}'::uuid,'${orderA}'::uuid,'${beatId}'::uuid,id,499,'usd' FROM public.license_types WHERE slug='exclusive'
 UNION ALL
 SELECT '${itemB}'::uuid,'${orderB}'::uuid,'${beatId}'::uuid,id,499,'usd' FROM public.license_types WHERE slug='exclusive';
INSERT INTO public.transactional_email_jobs(source_type,source_id,message_type,recipient_email,payload,status,next_attempt_at)
 VALUES('commerce_receipt','${orderA}','lease_race','test@example.invalid','{}','queued',now());
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${userC}','concurrent-recipient@rgodbeat.test',now());
INSERT INTO public.customers(id,email,name,auth_user_id,studio_access_until)
 VALUES('${customerC}','concurrent-recipient@rgodbeat.test','Concurrent Recipient','${userC}',now()+interval '5 days');
INSERT INTO public.commerce_checkout_intents(id,buyer_email,recipient_mode,recipient_kind,recipient_email,snapshot,state,stripe_checkout_session_id,stripe_payment_intent_id)
 VALUES('${intentC}','buyer@rgodbeat.test','gift','email','concurrent-recipient@rgodbeat.test',
  '{"items":[{"beatId":"08e7ff1f-b73a-4403-949f-46bf39018bcb","licenseTier":"wav"}],"totalAmountCents":4900,"currency":"usd"}',
  'fulfilled','cs_claim_race','pi_claim_race');
INSERT INTO public.orders(id,customer_id,stripe_checkout_session_id,stripe_payment_intent_id,status,payment_status,currency,subtotal_amount,total_amount)
 VALUES('${orderC}','00000000-0000-4000-8000-000000000001','cs_claim_race','pi_claim_race','completed','paid','usd',49,49);
INSERT INTO public.order_items(id,order_id,beat_id,license_type_id,unit_price,currency)
 SELECT '${itemC}'::uuid,'${orderC}'::uuid,'08e7ff1f-b73a-4403-949f-46bf39018bcb'::uuid,id,49,'usd' FROM public.license_types WHERE slug='wav';
INSERT INTO public.beat_gifts(id,intent_id,order_id,order_item_id,recipient_kind,recipient_email,status,payment_status)
 VALUES('${giftC}','${intentC}','${orderC}','${itemC}','email','concurrent-recipient@rgodbeat.test','ready_to_claim','paid');
INSERT INTO public.gift_claim_tokens(id,gift_id,token_hash,generation,expires_at)
 VALUES('${tokenC}','${giftC}',repeat('f',64),1,now()+interval '1 hour');
UPDATE public.beat_gifts SET claim_token_generation=1 WHERE id='${giftC}';`);

try {
  const inventoryWrite = (order, item) => `BEGIN;
INSERT INTO public.beat_exclusive_inventory(beat_id,order_item_id,order_id,state,source)
 VALUES('${beatId}','${item}','${order}','held','verified_payment')
 ON CONFLICT(beat_id) DO NOTHING RETURNING order_id;
SELECT pg_sleep(2);
COMMIT;`;
  const invFirst = hold(inventoryWrite(orderA, itemA));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const invSecond = hold(inventoryWrite(orderB, itemB));
  const inventoryResults = await Promise.all([invFirst.done, invSecond.done]);
  assert.equal(inventoryResults.reduce((n, output) => n + Number(output.includes(orderA) || output.includes(orderB)), 0), 1,
    'only one exclusive reservation may win');
  const held = await query(`SELECT count(*) FROM public.beat_exclusive_inventory WHERE beat_id='${beatId}' AND state='held'`);
  assert.equal(held, '1', 'the paid pending order keeps one exclusive reservation');

  const grantSql = `BEGIN;
SELECT public.rg_grant_commerce_studio_access('order','${orderA}','00000000-0000-4000-8000-000000000001',30);
SELECT pg_sleep(2);
COMMIT;`;
  const grantFirst = hold(grantSql);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const grantSecond = hold(grantSql);
  const grantResults = await Promise.all([grantFirst.done, grantSecond.done]);
  const returnedUntil = grantResults.map((output) => output.split('\n')[0]).filter(Boolean);
  assert.equal(returnedUntil.length, 2);
  assert.equal(returnedUntil[0], returnedUntil[1], 'duplicate normal fulfillment receives the same Studio expiry');
  assert.equal(await query(`SELECT count(*) FROM public.commerce_studio_access_grants WHERE source_type='order' AND source_id='${orderA}'`), '1');

  const leaseFirst = hold('BEGIN; SELECT job_id FROM public.rg_claim_transactional_email_job(); SELECT pg_sleep(2); COMMIT;');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const leaseSecond = hold('SELECT job_id FROM public.rg_claim_transactional_email_job();');
  const leaseResults = await Promise.all([leaseFirst.done, leaseSecond.done]);
  assert.equal(leaseResults.reduce((n, output) => n + Number(output.length > 0), 0), 1,
    'SKIP LOCKED must lease a queue job to exactly one concurrent worker');
  const job = await query(`SELECT status||':'||attempts FROM public.transactional_email_jobs WHERE source_id='${orderA}' AND message_type='lease_race'`);
  assert.equal(job, 'sending:1');
  const claimSql = (license) => `BEGIN;
SELECT gift_id FROM public.rg_claim_beat_gift(repeat('f',64),'${userC}','${customerC}','${license}','PURCHASER (PAYER): Buyer\\nLICENSEE: Concurrent Recipient');
SELECT pg_sleep(2);
COMMIT;`;
  const claimFirst = hold(claimSql('RG-WAV-2026-099998'));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const claimSecond = hold(claimSql('RG-WAV-2026-099999'));
  const claimResults = await Promise.allSettled([claimFirst.done, claimSecond.done]);
  assert.equal(claimResults.filter((result) => result.status === 'fulfilled').length, 1,
    'only one concurrent claim may commit');
  const claimState = await query(`SELECT (SELECT count(*) FROM public.purchases WHERE order_id='${orderC}')||':'||
    (SELECT status FROM public.beat_gifts WHERE id='${giftC}')||':'||
    (SELECT count(*) FROM public.commerce_studio_access_grants WHERE source_type='gift' AND source_id='${intentC}')`);
  assert.equal(claimState, '1:claimed:1', 'one purchase, claim state and Studio grant commit atomically');
  console.log('PASS: PostgreSQL 16 exclusive reservation race has exactly one winner');
  console.log('PASS: PostgreSQL 16 concurrent normal Studio grants are idempotent');
  console.log('PASS: PostgreSQL 16 email queue SKIP LOCKED race has exactly one lease');
  console.log('PASS: PostgreSQL 16 concurrent gift claim commits exactly one recipient entitlement');
} finally {
  await query(`DELETE FROM public.transactional_email_jobs WHERE source_id='${orderA}' AND message_type='lease_race';
DELETE FROM public.gift_claim_contexts WHERE gift_id='${giftC}';
DELETE FROM public.gift_claim_tokens WHERE id='${tokenC}';
DELETE FROM public.beat_gifts WHERE id='${giftC}';
DELETE FROM public.commerce_studio_access_grants WHERE source_type='gift' AND source_id='${intentC}';
UPDATE public.customers SET studio_access_until=(SELECT prior_until FROM public.commerce_studio_access_grants WHERE source_type='order' AND source_id='${orderA}')
 WHERE id='00000000-0000-4000-8000-000000000001' AND EXISTS (SELECT 1 FROM public.commerce_studio_access_grants WHERE source_type='order' AND source_id='${orderA}');
DELETE FROM public.commerce_studio_access_grants WHERE source_type='order' AND source_id='${orderA}';
DELETE FROM public.purchases WHERE order_id='${orderC}';
DELETE FROM public.beat_exclusive_inventory WHERE order_id IN ('${orderA}','${orderB}');
DELETE FROM public.order_items WHERE id IN ('${itemA}','${itemB}','${itemC}');
DELETE FROM public.orders WHERE id IN ('${orderA}','${orderB}','${orderC}');
DELETE FROM public.commerce_checkout_intents WHERE id='${intentC}';
DELETE FROM public.customers WHERE id='${customerC}';
DELETE FROM auth.users WHERE id='${userC}';`);
}
