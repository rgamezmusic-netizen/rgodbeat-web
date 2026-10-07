import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadSource } from './helpers/rg-fixtures.mjs';
import { marketRows, marketProducts } from './helpers/rg-market-fixtures.mjs';
const {calculateTicketPayment,readMarketProduct}=loadSource('lib/rg/product/catalog.ts');
const user={id:randomUUID(),email:'fixture@example.test',email_confirmed_at:'2026-10-01T00:00:00Z'};
const request=body=>{const r=new Request('http://localhost/api/checkout/rg-market',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)});Object.defineProperty(r,'nextUrl',{value:new URL(r.url)});return r;};
function fixture(key='mp3_25',price=29) {
 const state={passes:[{id:randomUUID(),user_id:user.id,product_key:key,product_version:1,status:'available',reserved_intent_id:null}],intents:[],calls:[],stripeCalls:[],fulfillments:[],price};
 const tables={rg_beat_passes:state.passes,rg_market_products:marketRows.map(r=>({...r})),commerce_checkout_intents:state.intents,purchases:[],orders:[]};
 const db={from(table){let filters=[],action='select',values=null,one=false;
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},insert(v){action='insert';values=v;return q;},update(v){action='update';values=v;return q;},then(resolve,reject){
   state.calls.push({table,action,values,filters});let rows=(tables[table]??[]).filter(r=>filters.every(([k,v])=>r[k]===v));
   if(action==='insert'){const row={id:randomUUID(),state:'awaiting_payment',stripe_checkout_session_id:null,verified_paid_at:null,...values};tables[table].push(row);rows=[row];}
   if(action==='update')for(const row of rows)Object.assign(row,values);
   return Promise.resolve({data:one?rows[0]??null:rows,error:null}).then(resolve,reject);
  }};return q;
 },async rpc(name,args){state.calls.push({name,args});if(name==='rg_reserve_market_pass'){const p=state.passes[0];if(p.reserved_intent_id&&p.reserved_intent_id!==args.p_intent_id)return{data:null,error:{message:'already_reserved'}};p.status='reserved';p.reserved_intent_id=args.p_intent_id;return{data:p.id,error:null};}if(name==='rg_release_market_pass'){state.passes[0].status='available';state.passes[0].reserved_intent_id=null;return{data:true,error:null};}return{data:null,error:null};}};
 const stripe={checkout:{sessions:{async create(params,options){state.stripeCalls.push({params,options});return{id:'cs_fixture',client_secret:'test_secret',payment_status:'unpaid',status:'open'};},async retrieve(){state.calls.push({name:'stripe_retrieve'});return{id:'cs_fixture',client_secret:'test_secret',payment_status:state.paid?'paid':'unpaid',status:state.paid?'complete':'open'};},async expire(){state.calls.push({name:'stripe_expire'});return{id:'cs_fixture',payment_status:'unpaid',status:'expired'};}}}};
 const fulfillment={async resolveAuthoritativeCart(items){state.calls.push({name:'resolveAuthoritativeCart'});return{items:items.map(i=>({beatId:i.beatId,licenseTier:i.licenseTier,beatTitle:'Server beat',licenseName:i.licenseTier,licenseTypeId:'license',unitPrice:state.price})),totalAmount:state.price,currency:'usd'};},async fulfillStripeCheckoutSession(session){state.fulfillments.push(session);state.intents[0].state='fulfilled';return{status:'fulfilled',orderId:'order',giftStatus:state.intents[0].recipient_mode==='gift'?'ready_to_claim':undefined};}};
 const route=loadSource('app/api/checkout/rg-market/route.ts',{'@/lib/auth/server':{getCurrentUser:async()=>user},'@/lib/commerce/admin-client':{createCommerceAdminClient:()=>db},'@/lib/commerce/fulfillment':fulfillment,'@/lib/stripe/server':{getStripe:()=>stripe,isStripeConfigured:()=>true}});
 const cancel=loadSource('app/api/checkout/rg-market/cancel/route.ts',{'@/lib/auth/server':{getCurrentUser:async()=>user},'@/lib/commerce/admin-client':{createCommerceAdminClient:()=>db},'@/lib/stripe/server':{getStripe:()=>stripe}});
 return{state,db,route,cancel,body:{passId:state.passes[0].id,idempotencyKey:randomUUID(),items:[{beatId:randomUUID(),licenseTier:key.startsWith('wav')?'wav':'mp3'}]}};
}

test('locked catalog prices and benefits round in cents and cap against validated actual prices',()=>{
 for(const row of marketRows)assert.deepEqual(readMarketProduct(row),marketProducts.find(p=>p.productKey===row.product_key));
 for(const [key,tier,cents,discount] of [['mp3_25','mp3',2900,725],['wav_25','wav',4900,1225],['mp3_50','mp3',2900,1450],['wav_50','wav',4900,2450],['mp3_25','mp3',10000,725],['mp3_25','mp3',101,25]]){
  assert.deepEqual(calculateTicketPayment(marketProducts.find(p=>p.productKey===key),tier,cents),{discountCents:discount,remainingCents:cents-discount});
 }
 for(const tier of ['exclusive','stems','unlimited','wav'])assert.throws(()=>calculateTicketPayment(marketProducts.find(p=>p.productKey==='mp3_25'),tier,2900),/not eligible/);
 assert.throws(()=>calculateTicketPayment(marketProducts.find(p=>p.productKey==='beat_pass'),'mp3',5000),/exceeds/);
});
test('server quote ignores client amounts, exposes no conversion, reserves nothing and honors cap',async()=>{
 const f=fixture('wav_50',100);const response=await f.route.POST(request({...f.body,quoteOnly:true,discountCents:10000,totalAmount:0,percentage:100}));
 assert.equal(response.status,200);const quote=await response.json();assert.equal(quote.discountCents,2450);assert.equal(quote.remainingCents,7550);
 assert.equal(f.state.intents.length,0);assert.equal(f.state.calls.some(c=>c.name==='rg_reserve_market_pass'),false);assert.equal(f.state.stripeCalls.length,0);
 assert.doesNotMatch(JSON.stringify(quote),/ledger|rgPerUsd|conversion/);
});
test('partial payment reserves one ticket before Stripe and freezes only server-calculated remainder',async()=>{
 const f=fixture('mp3_25');const response=await f.route.POST(request({...f.body,discountAmount:29,totalAmount:0}));assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.totalAmount,21.75);assert.equal(f.state.stripeCalls[0].params.line_items[0].price_data.unit_amount,2175);
 assert.equal(f.state.intents[0].snapshot.utility.discountCents,725);assert.equal(f.state.intents[0].snapshot.items[0].catalogUnitPrice,29);
 assert.equal(f.state.passes[0].status,'reserved');assert.equal(f.state.fulfillments.length,0);
 const before=f.state.calls.filter(c=>c.name==='resolveAuthoritativeCart').length;f.state.price=100;
 const retry=await f.route.POST(request(f.body));assert.equal(retry.status,200);assert.equal((await retry.json()).totalAmount,21.75);
 assert.equal(f.state.intents.length,1);assert.equal(f.state.calls.filter(c=>c.name==='resolveAuthoritativeCart').length,before);
 const conflict=await f.route.POST(request({...f.body,items:[{beatId:randomUUID(),licenseTier:'mp3'}]}));assert.equal(conflict.status,409);
});
test('existing Beat Pass and Studio Pass fulfill at zero without a Stripe charge or fake inventory',async()=>{
 for(const key of ['beat_pass','studio_30']){const f=fixture(key);const body=key==='studio_30'?{...f.body,items:[]}:f.body;
  const response=await f.route.POST(request(body));assert.equal(response.status,200);assert.equal(f.state.stripeCalls.length,0);assert.equal(f.state.fulfillments[0].amount_total,0);
  assert.equal(f.state.fulfillments[0].metadata.type,'rg_market');assert.equal(f.state.intents[0].snapshot.utility.benefitKind,key==='studio_30'?'studio':'beat');
 }
});
test('no stacking, excluded license tiers, wrong owner or wrong category can create a payment intent',async()=>{
 for(const patch of [{items:[{beatId:randomUUID(),licenseTier:'exclusive'}]},{items:[{beatId:randomUUID(),licenseTier:'wav'}]},{items:[{beatId:randomUUID(),licenseTier:'mp3'},{beatId:randomUUID(),licenseTier:'mp3'}]}]){const f=fixture();const response=await f.route.POST(request({...f.body,...patch}));assert.equal(response.status,503);assert.equal(f.state.intents.length,0);assert.equal(f.state.stripeCalls.length,0);}
 const f=fixture();f.state.passes[0].user_id=randomUUID();assert.equal((await f.route.POST(request(f.body))).status,404);assert.equal(f.state.intents.length,0);
});
test('Gift EMAIL freezes the existing Gift V1 recipient for an unredeemed ticket, not a new gift architecture',async()=>{
 const previous={flag:process.env.RG_GIFTS_ENABLED,key:process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY};process.env.RG_GIFTS_ENABLED='true';process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY=Buffer.alloc(32,8).toString('base64');
 try{const f=fixture('wav_25');const response=await f.route.POST(request({...f.body,items:[],giftPass:true,recipientMode:'gift',recipientKind:'email',recipientEmail:' RECIPIENT@example.test '}));assert.equal(response.status,200);
  assert.equal(f.state.intents[0].recipient_email,'recipient@example.test');assert.equal(f.state.intents[0].recipient_mode,'gift');assert.equal(f.state.intents[0].snapshot.utility.giftPass,true);assert.equal(f.state.stripeCalls.length,0);
 }finally{if(previous.flag===undefined)delete process.env.RG_GIFTS_ENABLED;else process.env.RG_GIFTS_ENABLED=previous.flag;if(previous.key===undefined)delete process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;else process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY=previous.key;}
});
test('fulfillment rejects manipulated discount/reservation before writing commerce or PTS',async()=>{
 const f=fixture('mp3_25');const utility={passId:f.body.passId,productKey:'mp3_25',version:1,benefitKind:'discount',name:'25% MP3 Ticket',studioDays:null,giftPass:false,discountCents:725};
 f.state.passes[0].status='reserved';f.state.passes[0].reserved_intent_id='intent';
 const {validateMarketUtility}=loadSource('lib/commerce/market-utility.ts');
 const intent={id:'intent',buyer_auth_user_id:user.id,state:'awaiting_payment'};
 const snapshot={utility,totalAmountCents:2175,items:[{licenseTier:'mp3',catalogUnitPrice:29,unitPrice:21.75}]};
 assert.equal((await validateMarketUtility(f.db,intent,snapshot)).discountCents,725);
 await assert.rejects(validateMarketUtility(f.db,intent,{...snapshot,totalAmountCents:0}),/PAYMENT_MISMATCH/);
 await assert.rejects(validateMarketUtility(f.db,intent,{...snapshot,items:[...snapshot.items,...snapshot.items]}),/STACKING/);
 f.state.passes[0].user_id=randomUUID();await assert.rejects(validateMarketUtility(f.db,intent,snapshot),/RESERVATION_MISSING/);
});

test('cancel verifies/expires Stripe before releasing and refuses paid or unlinked sessions',async()=>{
 const f=fixture();await f.route.POST(request(f.body));const intent=f.state.intents[0];
 const response=await f.cancel.POST(request({intentId:intent.id}));assert.equal(response.status,200);assert.equal(f.state.passes[0].status,'available');
 assert.ok(f.state.calls.findIndex(c=>c.name==='rg_release_market_pass')>f.state.calls.findIndex(c=>c.name==='stripe_expire'));
 for(const kind of ['paid','unlinked']){const g=fixture();await g.route.POST(request(g.body));g.state.paid=kind==='paid';if(kind==='unlinked')g.state.intents[0].stripe_checkout_session_id=null;
  assert.equal((await g.cancel.POST(request({intentId:g.state.intents[0].id}))).status,409);assert.equal(g.state.passes[0].status,'reserved');assert.equal(g.state.calls.some(c=>c.name==='rg_release_market_pass'),false);
 }
});

test('resume rebuilds the owned original frozen request and cannot replace its recipient or pass',async()=>{
 const f=fixture('mp3_25');await f.route.POST(request(f.body));f.state.price=100;
 const resume=loadSource('app/api/checkout/rg-market/resume/route.ts',{'@/lib/auth/server':{getCurrentUser:async()=>user},'@/lib/commerce/admin-client':{createCommerceAdminClient:()=>f.db},'../route':{POST:f.route.POST}});
 const response=await resume.POST(request({intentId:f.state.intents[0].id,passId:randomUUID(),recipientMode:'gift',recipientEmail:'spoof@example.test'}));
 assert.equal(response.status,200);assert.equal((await response.json()).totalAmount,21.75);assert.equal(f.state.intents.length,1);assert.equal(f.state.intents[0].recipient_mode,'self');
 f.state.intents[0].buyer_auth_user_id=randomUUID();assert.equal((await resume.POST(request({intentId:f.state.intents[0].id}))).status,404);
});
