import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
if (process.env.PGDATABASE !== 'rgodbeat_validation' || !process.env.PGHOST?.startsWith('/private/tmp/rgodbeat-') || !/^\d+$/.test(process.env.PGPORT ?? '')) throw Error('Use the isolated rgodbeat_validation Unix-socket test database only.');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
function query(sql,onReady) {
 return new Promise((resolve,reject)=>{
  const p=spawn('psql',['-X','-v','ON_ERROR_STOP=1','-Atq','-d','rgodbeat_validation',...(onReady?[]:['-c',sql])]);let out='',error='';
  if(onReady)p.stdin.end(sql+'\n');
  p.stdout.on('data',data=>{out+=data;if(out.includes('RG_READY'))onReady?.();});p.stderr.on('data',data=>error+=data);p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(Error(error)));
 });
}
async function owner(amount) {
 const user=randomUUID();await query(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${literal(user)},'${user}@example.test',now());SELECT public.rg_credit_controlled_utility(${literal(user)},${amount},'Authorized isolated concurrency fixture',${literal(randomUUID())});`);return user;
}
const first=await owner(10000);
const key=randomUUID();
const purchase=(user,key)=>`SELECT public.rg_purchase_beat_pass(${literal(user)},${literal(key)})`;
const same=await Promise.all([query(`BEGIN;${purchase(first,key)};SELECT pg_sleep(1);COMMIT;`),query(purchase(first,key))]);
assert.equal(same[0].split('\n')[0],same[1]);
assert.equal(await query(`SELECT count(*) FROM public.rg_beat_passes WHERE user_id=${literal(first)}`),'1');
const second=await owner(10000);
const different=await Promise.allSettled([query(`BEGIN;${purchase(second,randomUUID())};SELECT pg_sleep(1);COMMIT;`),query(purchase(second,randomUUID()))]);
assert.equal(different.filter(r=>r.status==='fulfilled').length,1);
assert.match(different.find(r=>r.status==='rejected').reason.message,/insufficient_rg_balance/);
assert.equal(await query(`SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id=${literal(second)}`),'0');
const pass=(await query(`SELECT id FROM public.rg_beat_passes WHERE user_id=${literal(second)}`)).trim();
const intents=[randomUUID(),randomUUID()];
for(const intent of intents)await query(`INSERT INTO public.commerce_checkout_intents(id,buyer_auth_user_id,recipient_mode,snapshot) VALUES(${literal(intent)},${literal(second)},'self',jsonb_build_object('kind','rg_market','paymentMethod','rg_market','totalAmountCents',0,'utility',jsonb_build_object('passId',${literal(pass)},'productKey','beat_pass','version',1)));`);
const reserve=intent=>`SELECT public.rg_reserve_market_pass(${literal(second)},${literal(pass)},${literal(intent)})`;
const reservations=await Promise.allSettled([query(`BEGIN;${reserve(intents[0])};SELECT pg_sleep(1);COMMIT;`),query(reserve(intents[1]))]);
assert.equal(reservations.filter(r=>r.status==='fulfilled').length,1);
assert.match(reservations.find(r=>r.status==='rejected').reason.message,/market_pass_unavailable/);
// Release races with a reservation to the closed intent: never reserve a closed payment.
const reservedIntent=await query(`SELECT reserved_intent_id FROM public.rg_beat_passes WHERE id=${literal(pass)}`);
await query(`UPDATE public.commerce_checkout_intents SET state='expired' WHERE id=${literal(reservedIntent)};SELECT public.rg_release_market_pass(${literal(second)},${literal(reservedIntent)});`);
await assert.rejects(query(reserve(reservedIntent)),/market_intent_owner_or_state_mismatch/);
console.log('PASS: concurrent purchase idempotency, different-key double spend, competing reservation, closed-intent release.');
const earningUser=randomUUID(),earningArtist=randomUUID();
await query(`BEGIN;
UPDATE public.rg_economy_config SET direct_earning_v1_enabled=true,season_issuance_cap=1000000,maximum_outstanding_rg=100000000,maximum_utility_exposure_cents=100000000;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${literal(earningUser)},'${earningUser}@example.test',now());
INSERT INTO public.rg_artists(id,user_id,stage_name,slug,status) VALUES(${literal(earningArtist)},${literal(earningUser)},'Race earning fixture','race-${earningArtist}','active');
DO $$ DECLARE track uuid;job uuid;publication uuid;event uuid;i integer;BEGIN
 FOR i IN 1..6 LOOP
 track:=public.create_rg_track(${literal(earningUser)},${literal(earningArtist)},'Race verified fixture '||i,NULL);job:=gen_random_uuid();
 INSERT INTO public.youtube_export_jobs(id,user_id,artist_name,title,privacy,status,youtube_video_id,youtube_url,finished_at) VALUES(job,${literal(earningUser)},'Race artist','Verified fixture','public','uploaded',job::text,'https://youtube.com/watch?v='||job::text,now());
 publication:=public.record_rg_publication_link(${literal(earningUser)},${literal(earningArtist)},track,NULL,job,job::text);
 event:=public.rg_record_score_event('TRACK_PUBLISHED',${literal(earningArtist)},track,NULL,publication,'rg_publication_link',publication::text);
 IF i<=4 THEN PERFORM public.rg_award_verified_activity(event); END IF;
 END LOOP;
END $$;COMMIT;`);
const pending=(await query(`SELECT id FROM public.rg_score_events e WHERE artist_id=${literal(earningArtist)} AND NOT EXISTS(SELECT 1 FROM public.rg_coin_ledger l WHERE l.source_type='verified_activity' AND l.source_id=e.id::text) ORDER BY id`)).split('\n');
assert.equal(pending.length,2);
const awards=await Promise.all([query(`BEGIN;SELECT public.rg_award_verified_activity(${literal(pending[0])});SELECT pg_sleep(1);COMMIT;`),query(`SELECT public.rg_award_verified_activity(${literal(pending[1])})`)]);
assert.equal(awards.filter(value=>value.split('\n')[0].length>0).length,1);
assert.equal(await query(`SELECT sum(amount) FROM public.rg_coin_ledger WHERE user_id=${literal(earningUser)} AND origin_type='EARNED_RG'`),'1000');
await query('UPDATE public.rg_economy_config SET direct_earning_v1_enabled=false');
console.log('PASS: concurrent verified awards cannot exceed 1000 RG per account/season.');

// A credit committed after transaction start is still spendable. Transaction-time
// created_at must not incorrectly reject live allocations after waiting for a lock.
const lateOwner=randomUUID();await query(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${literal(lateOwner)},'${lateOwner}@example.test',now());`);
let signal;const ready=new Promise(resolve=>signal=resolve);
const delayed=query(`BEGIN;SELECT 'RG_READY';SELECT pg_sleep(1);${purchase(lateOwner,randomUUID())};COMMIT;`,()=>signal());
await ready;await query(`SELECT public.rg_credit_controlled_utility(${literal(lateOwner)},10000,'Authorized isolated late-credit concurrency fixture',${literal(randomUUID())})`);
await delayed;
assert.equal(await query(`SELECT count(*) FROM public.rg_beat_passes WHERE user_id=${literal(lateOwner)}`),'1');
assert.equal(await query(`SELECT count(*) FROM public.rg_coin_spend_allocations a JOIN public.rg_coin_ledger d ON d.id=a.debit_id JOIN public.rg_coin_ledger c ON c.id=a.credit_id WHERE d.user_id=${literal(lateOwner)} AND c.created_at>d.created_at`),'1');
console.log('PASS: a real committed late credit remains spendable by an earlier-started transaction.');
