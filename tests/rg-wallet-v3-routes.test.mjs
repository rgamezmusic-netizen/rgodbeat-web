import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';
const id='a0000000-0000-4000-8000-000000000001';
const key='d0000000-0000-4000-8000-000000000001';
const user={id,email:'verified@example.test',email_confirmed_at:'2026-01-01'};
const response={json:(body,init={})=>({status:init.status||200,body})};
const req=(body,origin='https://rg.example')=>({json:async()=>body,headers:new Headers({origin}),nextUrl:new URL('https://rg.example/api/rg/wallet')});

test('transfer uses the authenticated sender and integer RG; foreign Origins, guests and fractional amounts cannot mutate wallets',async()=>{
 const calls=[];let current=user;
 const route=loadSource('app/api/rg/wallet/transfer/route.ts',{
  'next/server':{NextResponse:response},'@/lib/auth/server':{getCurrentUser:async()=>current},
  '@/lib/commerce/admin-client':{createCommerceAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:'transfer-id',error:null}}})},
 });
 const body={artistSlug:'recipient',amountRg:23,idempotencyKey:key,userId:'forged-user'};
 assert.equal((await route.POST(req(body,'https://evil.example'))).status,403);
 current=null;assert.equal((await route.POST(req(body))).status,401);current=user;
 assert.equal((await route.POST(req({...body,amountRg:1.5}))).status,400);
 assert.equal(calls.length,0);
 assert.equal((await route.POST(req(body))).status,200);
 assert.equal(calls[0].name,'rg_transfer_wallet');assert.equal(calls[0].args.p_sender_id,id);assert.equal(calls[0].args.p_amount_rg,23);
});

test('RG checkout quotes the final server offer, rejects stale prices and never debits on quote or price mismatch',async()=>{
 const rpc=[];const cartCalls=[];
 const db={from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:null,error:null})};return q},rpc:async(...args)=>{rpc.push(args);throw Error('unexpected debit')}};
 const route=loadSource('app/api/checkout/rg-wallet/route.ts',{
  'next/server':{NextResponse:response},'@/lib/auth/server':{getCurrentUser:async()=>user},
  '@/lib/commerce/admin-client':{createCommerceAdminClient:()=>db},
  '@/lib/commerce/fulfillment':{resolveAuthoritativeCart:async items=>{cartCalls.push(items);return{items:[{unitPrice:29}],totalAmount:29,currency:'usd'}},fulfillStripeCheckoutSession:async()=>{throw Error('unexpected fulfillment')}},
 });
 const items=[{beatId:id,licenseTier:'mp3',unitPrice:0.01}];
 const quote=await route.POST(req({quoteOnly:true,items,amountRg:1}));
 assert.equal(quote.status,200);assert.equal(quote.body.amountRg,2900);assert.equal(quote.body.totalUsd,29);
 const changed=await route.POST(req({items,idempotencyKey:key,expectedAmountRg:1450}));
 assert.equal(changed.status,409);assert.equal(changed.body.priceChanged,true);assert.equal(rpc.length,0);
 assert.equal((await route.POST(req({quoteOnly:true,items:[...items,...items]}))).status,400);
 assert.equal((await route.POST(req({quoteOnly:true,items,recipientMode:'gift'}))).status,400);
 assert.equal(cartCalls.length,2);
});

test('top-up fulfillment requires the paid Stripe session to match the frozen owner, currency, amount and session binding',async()=>{
 const frozen={id,user_id:'owner',stripe_session_id:'cs_verified',currency:'usd',amount_cents:2900,amount_rg:2900,status:'pending'};
 const calls=[];
 const db={from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:frozen,error:null}),single:async()=>({data:frozen,error:null})};return q},rpc:async(name,args)=>{calls.push({name,args});frozen.status='credited';frozen.credited_at='2026-01-01';return{data:true,error:null}}};
 const {fulfillRgTopup}=loadSource('lib/rg/wallet-payments.ts',{'@/lib/commerce/admin-client':{createCommerceAdminClient:()=>db}});
 const session={id:'cs_verified',mode:'payment',payment_status:'paid',amount_total:2900,currency:'usd',client_reference_id:id,payment_intent:'pi_verified',metadata:{type:'rg_wallet_topup',topupId:id,userId:'owner'}};
 for(const patch of [{payment_status:'unpaid'},{amount_total:1450},{currency:'eur'},{id:'cs_other'},{client_reference_id:key},{metadata:{...session.metadata,userId:'foreign'}}]) {
  await assert.rejects(fulfillRgTopup({...session,...patch}),/UNVERIFIED|MISMATCH/);
 }
 assert.equal(calls.length,0);
 assert.equal((await fulfillRgTopup(session)).amountRg,2900);
 assert.deepEqual(calls,[{name:'rg_credit_wallet_topup',args:{p_topup_id:id,p_session_id:'cs_verified',p_payment_intent_id:'pi_verified',p_amount_cents:2900,p_currency:'usd'}}]);
});

test('partial refunds use cumulative refunded cents; unrelated Stripe payments stay on the existing commerce path',async()=>{
 const calls=[];
 const db={from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id,stripe_session_id:'cs_rg',amount_cents:1000,user_id:'owner'},error:null})};return q},rpc:async(name,args)=>{calls.push({name,args});return{data:true,error:null}}};
 const {reverseRgTopup}=loadSource('lib/rg/wallet-payments.ts',{'@/lib/commerce/admin-client':{createCommerceAdminClient:()=>db}});
 const stripe={checkout:{sessions:{list:async()=>({data:[{id:'cs_rg',client_reference_id:id,amount_total:1000,metadata:{type:'rg_wallet_topup',topupId:id,userId:'owner'}}]})}}};
 assert.equal(await reverseRgTopup(stripe,'pi_rg',400),true);assert.equal(calls[0].args.p_reversed_cents,400);
 assert.equal(await reverseRgTopup({checkout:{sessions:{list:async()=>({data:[{id:'cs_ordinary'}]})}}},'pi_ordinary',400),false);
});

test('100 RG per USD uses cents from the final price with no second marketing discount',()=>{
 const {rgCostFromUsd}=loadSource('lib/rg/wallet-request.ts');
 assert.equal(rgCostFromUsd(29),2900);assert.equal(rgCostFromUsd(49),4900);assert.equal(rgCostFromUsd(39.99),3999);
 assert.throws(()=>rgCostFromUsd(NaN));assert.throws(()=>rgCostFromUsd(-29));
});
