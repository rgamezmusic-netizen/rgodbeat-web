// Run only against the disposable PostgreSQL fixture, after rg-wallet-v3-postgres.sql.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const exec = promisify(execFile);
assert.equal(process.env.PGDATABASE, 'rgodbeat_validation');
assert.match(process.env.PGHOST || '', /^\/private\/tmp\/rgodbeat-/);
const sql = async text => (await exec('/opt/homebrew/bin/psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', text], { env: process.env })).stdout.trim();
const owner = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const publications = [];
for (let i = 0; i < 8; i++) publications.push(await sql(`SELECT public.test_wallet_publication(6,'parallel-${i}')`));
const rewards = await Promise.all(publications.map(p => sql(`SELECT public.rg_reward_publication('${p}')`).then(JSON.parse)));
assert.deepEqual(rewards.filter(r => r.points > 0).map(r => r.points).sort((a,b) => a-b), [4,7,23]);
assert.equal(await sql(`SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='${owner(6)}'`), '34');
const replays = await Promise.all(Array.from({ length: 8 }, () => sql(`SELECT public.rg_reward_publication('${publications[0]}')`)));
assert.equal(new Set(replays).size, 1);
console.log('PASS: eight concurrent publications yield exactly three rewards and 34 RG; concurrent retries do not mint RG.');

await sql(`INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key) VALUES('${owner(7)}',100,'ADMIN_CORRECTION','Isolated concurrency seed','fixture','parallel-seed','parallel-seed')`);
const sends = await Promise.allSettled(Array.from({ length: 2 }, () => sql(`SELECT public.rg_transfer_wallet('${owner(7)}','wallet-artist-8',80,'${randomUUID()}')`)));
assert.equal(sends.filter(r => r.status === 'fulfilled').length, 1);
assert.equal(await sql(`SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='${owner(7)}'`), '20');
assert.equal(await sql(`SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='${owner(8)}'`), '80');
console.log('PASS: competing transfers cannot overdraw the sender; both sides conserve RG.');

const topup = randomUUID();
await sql(`INSERT INTO public.rg_wallet_topups(id,user_id,request_key,amount_cents,amount_rg,stripe_session_id) VALUES('${topup}','${owner(8)}','${randomUUID()}',1000,1000,'cs_parallel_topup')`);
const credits = await Promise.all(Array.from({ length: 8 }, () => sql(`SELECT public.rg_credit_wallet_topup('${topup}','cs_parallel_topup','pi_parallel_topup',1000,'usd')`)));
assert.equal(credits.filter(c => c === 't').length, 1);
assert.equal(await sql(`SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='${owner(8)}'`), '1080');
console.log('PASS: eight simultaneous paid confirmations credit one purchase exactly once.');

const intents = [randomUUID(), randomUUID()];
for (const id of intents) await sql(`INSERT INTO public.commerce_checkout_intents(id,buyer_auth_user_id,recipient_mode,snapshot) VALUES('${id}','${owner(8)}','self','{"kind":"rg_wallet","paymentMethod":"rg_wallet","rgAmount":900,"totalAmountCents":0,"currency":"usd","items":[{"licenseTier":"mp3","unitPrice":0,"catalogUnitPrice":9}]}')`);
const purchases = await Promise.allSettled(intents.map(id => sql(`SELECT public.rg_reserve_wallet_checkout('${owner(8)}','${id}')`)));
assert.equal(purchases.filter(r => r.status === 'fulfilled').length, 1);
assert.equal(await sql(`SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='${owner(8)}'`), '180');
const reserved = intents[purchases.findIndex(r => r.status === 'fulfilled')];
await Promise.all(Array.from({ length: 8 }, () => sql(`SELECT public.rg_reserve_wallet_checkout('${owner(8)}','${reserved}')`)));
assert.equal(await sql(`SELECT count(*) FROM public.rg_coin_ledger WHERE source_type='wallet_checkout' AND source_id='${reserved}'`), '1');
console.log('PASS: competing license reservations cannot overspend; repeated reservations debit only once.');
