import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';
function fixture(kind,key='studio_30') {
 const utility={passId:'pass',productKey:key,version:1,benefitKind:key==='studio_30'?'studio':'discount',name:key==='studio_30'?'RG Studio Pass / 30 days':'25% WAV Ticket',studioDays:key==='studio_30'?30:null,giftPass:true,discountCents:0};
 const intent={id:'intent',recipient_kind:kind,recipient_email:kind==='email'?'recipient@example.test':null,recipient_artist_id:kind==='artist'?'artist':null,recipient_artist_slug:kind==='artist'?'recipient':null,buyer_email:'buyer@example.test',state:'fulfilling',attempt_count:1,snapshot:{siteOrigin:'https://example.test'}};
 const tables={orders:[],order_items:[],purchases:[],beat_gifts:[],gift_claim_tokens:[],transactional_email_jobs:[],commerce_checkout_intents:[intent]};const calls=[],emails=[];
 const db={auth:{admin:{getUserById:async id=>({data:{user:{id,email:'recipient@example.test',email_confirmed_at:'2026-01-01',user_metadata:{legal_name:'Recipient Legal Name',full_name:'Recipient Stage'}}},error:null})}},from(table){let action='select',values=null,filters=[],one=false;
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},not(){return q;},is(k,v){filters.push([k,v]);return q;},gt(){return q;},limit(){return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},insert(v){action='insert';values=v;return q;},upsert(v){action='upsert';values=v;return q;},update(v){action='update';values=v;return q;},then(resolve,reject){
   calls.push({table,action,values});let rows=(tables[table]??[]).filter(r=>filters.every(([k,v])=>r[k]===v));
   if(action==='upsert'){const prior=tables[table].find(r=>r.order_id===values.order_id&&r.market_pass_id===values.market_pass_id);if(prior){Object.assign(prior,values);rows=[prior];}else{const row={id:table+'-id',...values};tables[table].push(row);rows=[row];}}
   if(action==='insert'){const row={id:table+'-id',...values};tables[table].push(row);rows=[row];}
   if(action==='update')for(const row of rows)Object.assign(row,values);
   return Promise.resolve({data:one?rows[0]??null:rows,error:null}).then(resolve,reject);
  }};return q;
 },async rpc(name,args){calls.push({name,args});if(name==='rg_resolve_gift_artist')return{data:[{artist_id:'artist',user_id:'recipient-user',recipient_email:'recipient@example.test',recipient_name:'Recipient'}],error:null};
  if(name==='rg_commerce_link_verified_customer')return{data:'recipient-customer',error:null};
  if(name==='rg_allocate_commerce_license_id')return{data:'RG-MP3-2026-000001',error:null};
  if(name==='rg_prepare_gift_claim_email'){tables.beat_gifts[0].status='ready_to_claim';return{data:true,error:null};}
  if(name==='rg_assign_market_gift'){assert.equal(intent.state,'fulfilled');assert.equal(tables.orders[0].status,'completed');tables.beat_gifts[0].status='claimed';return{data:key==='studio_30'?'2030-01-31T00:00:00Z':null,error:null};}
  return{data:null,error:null};}};
 const engine=loadSource('lib/commerce/gift-fulfillment.ts',{'./email':{encryptTransactionalSecret:()=>'encrypted-test-link',enqueueTransactionalEmail:async(db,email)=>emails.push(email),processQueuedGiftEmailImmediately:async()=>({status:'test-provider-only'})}});
 const input={supabase:db,intent,session:{id:'rgmarket:intent',payment_intent:null,amount_total:0,currency:'usd',customer:null,customer_details:{email:'buyer@example.test'},metadata:{}},existingOrder:null,payer:{customerId:'buyer-customer',email:'buyer@example.test',name:'Buyer'},cart:{items:[],totalAmount:0,currency:'usd'},utility};
 return{engine,input,tables,calls,emails};
}
test('Studio EMAIL uses existing Gift V1 record/token/email preparation and waits for safe claim',async()=>{
 const f=fixture('email');const result=await f.engine.fulfillPaidGiftCheckout(f.input);assert.equal(result.giftStatus,'ready_to_claim');
 assert.equal(f.tables.beat_gifts[0].market_pass_id,'pass');assert.equal(f.tables.order_items[0].beat_id,null);assert.equal(f.tables.orders[0].total_amount,0);
 assert.ok(f.calls.some(c=>c.name==='rg_prepare_gift_claim_email'));assert.equal(f.calls.some(c=>c.name==='rg_assign_market_gift'||c.name==='rg_grant_commerce_studio_access'),false);
 assert.equal(f.tables.commerce_checkout_intents[0].state,'fulfilled');assert.equal(f.calls.some(c=>c.table?.includes('score')),false);
});
test('Studio RG ARTIST assigns only to verified recipient after order completion and retries the same gift',async()=>{
 const f=fixture('artist');const result=await f.engine.fulfillPaidGiftCheckout(f.input);assert.equal(result.giftStatus,'claimed');
 const assign=f.calls.find(c=>c.name==='rg_assign_market_gift');assert.deepEqual(assign.args,{p_gift_id:'beat_gifts-id',p_user_id:'recipient-user',p_customer_id:'recipient-customer'});
 assert.equal(f.calls.some(c=>c.name==='rg_prepare_gift_claim_email'),false);assert.equal(f.tables.beat_gifts[0].status,'claimed');
 f.input.existingOrder={id:'orders-id',status:'completed',payment_status:'paid'};await f.engine.fulfillPaidGiftCheckout(f.input);
 assert.equal(f.tables.beat_gifts.length,1);assert.equal(f.tables.order_items.length,1);assert.equal(f.emails.find(e=>e.messageType==='gift_received').recipientEmail,'recipient@example.test');
});
test('discount-ticket RG ARTIST transfers the entitlement using Gift V1 without premature Studio access or a beat license',async()=>{
 const f=fixture('artist','wav_25');await f.engine.fulfillPaidGiftCheckout(f.input);
 assert.equal(f.tables.beat_gifts[0].market_pass_id,'pass');assert.ok(f.calls.some(c=>c.name==='rg_assign_market_gift'));
 assert.equal(f.calls.some(c=>c.table==='purchases'||c.name==='rg_grant_commerce_studio_access'),false);
});

test('direct artist beat gift uses recipient legal identity, keeps payer separate and preserves fulfillment',async()=>{
 const f=fixture('artist');delete f.input.utility;
 f.input.cart={items:[{beatId:'beat',beatTitle:'Beat',licenseTypeId:'license',licenseTier:'mp3',licenseName:'MP3',unitPrice:29}],totalAmount:29,currency:'usd'};
 f.input.session.amount_total=2900;
 const result=await f.engine.fulfillPaidGiftCheckout(f.input);
 assert.equal(result.giftStatus,'claimed');assert.equal(f.tables.purchases.length,1);
 assert.match(f.tables.purchases[0].contract_text,/LICENSEE: Recipient Legal Name \(recipient@example.test\)/);
 assert.match(f.tables.purchases[0].contract_text,/PURCHASER \(PAYER\): Buyer/);
 assert.doesNotMatch(f.tables.purchases[0].contract_text,/Recipient Stage/);
 assert.equal(f.tables.purchases[0].customer_id,'recipient-customer');
});
