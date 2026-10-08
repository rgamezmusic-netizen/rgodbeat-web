import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadSource } from './helpers/rg-fixtures.mjs';
import { marketRows } from './helpers/rg-market-fixtures.mjs';

const checkoutIntent = () => ({
  id: 'intent-fixture', recipient_mode: 'self', recipient_kind: null, recipient_email: null,
  recipient_artist_id: null, recipient_artist_slug: null, buyer_email: 'payer@example.test',
  state: 'awaiting_payment', attempt_count: 0, buyer_auth_user_id:'payer-user',
  snapshot: { items: [{ beatId: 'beat-frozen', beatTitle: 'Frozen Beat', licenseTypeId: 'license-wav', licenseTier: 'wav', licenseName: 'WAV', unitPrice: 12.5 }], totalAmountCents: 2500, currency: 'usd' },
});

function commerceFixture({ failPurchaseOnce = false, snapshot = checkoutIntent().snapshot, legalName = null } = {}) {
  const state = { intent: { ...checkoutIntent(), snapshot }, order: null, orderItem: null, purchase: null,
    calls: [], failPurchaseOnce, allocated: 0, studioUntil: '2030-01-31T00:00:00.000Z' };
  const client = {
    auth: { admin: { getUserById: async id => ({ data: { user: {
      id, email: 'payer@example.test', email_confirmed_at: '2026-01-01',
      user_metadata: { full_name: 'Payer Stage', legal_name: legalName },
    } }, error: null }) } },
    calls: state.calls,
    async rpc(name, args) {
      state.calls.push({ kind: 'rpc', name, args });
      if (name === 'rg_resolve_commerce_payer_customer') return { data: 'payer-customer', error: null };
      if (name === 'rg_allocate_commerce_license_id') return { data: `RG-WAV-2026-${String(++state.allocated).padStart(6, '0')}`, error: null };
      if (name === 'rg_grant_commerce_studio_access') return { data: state.studioUntil, error: null };
      return { data: null, error: null };
    },
    from(table) {
      const query = { table, action: 'select', filters: [], values: null };
      const builder = {
        select() { return this; },
        eq(key, value) { query.filters.push([key, value]); return this; },
        not() { return this; },
        insert(values) { query.action = 'insert'; query.values = values; return this; },
        upsert(values) { query.action = 'upsert'; query.values = values; return this; },
        update(values) { query.action = 'update'; query.values = values; return this; },
        maybeSingle: () => execute(query, 'maybeSingle'),
        single: () => execute(query, 'single'),
        then(resolve, reject) { return execute(query, 'then').then(resolve, reject); },
      };
      return builder;
    },
  };

  function execute(query, mode) {
    state.calls.push({ kind: 'query', ...query, mode });
    const value = (key) => query.filters.find(([filter]) => filter === key)?.[1];
    let data = null;
    let error = null;
    if (query.table === 'orders') {
      if (query.action === 'select') {
        data = state.order?.stripe_checkout_session_id === value('stripe_checkout_session_id') ? { ...state.order } : null;
      } else if (query.action === 'insert') {
        state.order = { ...query.values, id: 'order-fixture' };
        data = { id: state.order.id };
      } else if (query.action === 'update') {
        if (state.order) Object.assign(state.order, query.values);
      }
    } else if (query.table === 'rg_beat_passes') {
      data={id:'market-pass',user_id:'payer-user',product_key:state.intent.snapshot.utility.productKey,product_version:1,status:'reserved',reserved_intent_id:state.intent.id};
    } else if (query.table === 'rg_market_products') {
      data=marketRows.find(row=>row.product_key===value('product_key'));
    } else if (query.table === 'commerce_checkout_intents') {
      if (query.action === 'select') data = { ...state.intent };
      else if (query.action === 'update') {
        Object.assign(state.intent, query.values);
        data = { id: state.intent.id };
      }
    } else if (query.table === 'order_items') {
      if (query.action === 'upsert') {
        state.orderItem ||= { ...query.values, id: 'order-item-fixture' };
        data = { id: state.orderItem.id };
      }
    } else if (query.table === 'purchases') {
      if (query.action === 'select') data = state.purchase ? { id: state.purchase.id, license_id: state.purchase.license_id, status: state.purchase.status } : null;
      else if (query.action === 'upsert' && state.failPurchaseOnce) {
        state.failPurchaseOnce = false;
        error = { code: 'fixture_internal_failure' };
      } else if (query.action === 'upsert') {
        state.purchase = { ...query.values, id: 'purchase-fixture' };
        data = { id: state.purchase.id };
      }
    }
    if (mode === 'then') return Promise.resolve({ data, error });
    if (mode === 'single' && !data && !error) error = { code: 'no_rows' };
    return Promise.resolve({ data, error });
  }

  return { client, state };
}

function fulfillmentFor(fixture) {
  return loadSource(resolve('lib/commerce/fulfillment.ts'), {
    'server-only': {},
    '@/lib/commerce/admin-client': { createCommerceAdminClient: () => fixture.client },
    './gift-fulfillment': { fulfillPaidGiftCheckout: async () => ({ status: 'fulfilled' }) },
  });
}

const session = (patch = {}) => ({
  id: 'cs-fixture', payment_status: 'paid', amount_total: 2500, currency: 'usd',
  payment_intent: 'pi-fixture', customer: null,
  customer_details: { email: 'payer@example.test', name: 'Payer' },
  metadata: { commerceIntentId: 'intent-fixture' }, ...patch,
});

test('normal fulfillment preserves the paid frozen price, license, payer and Studio source', async () => {
  const fixture = commerceFixture();
  const fulfillment = fulfillmentFor(fixture);
  const result = await fulfillment.fulfillStripeCheckoutSession(session());
  assert.equal(result.status, 'fulfilled');
  assert.equal(fixture.state.order.total_amount, 25);
  assert.equal(fixture.state.order.status, 'completed');
  assert.equal(fixture.state.orderItem.unit_price, 12.5);
  assert.equal(fixture.state.purchase.license_tier, 'wav');
  assert.equal(fixture.state.purchase.customer_id, 'payer-customer');
  assert.equal(fixture.state.purchase.license_id, 'RG-WAV-2026-000001');
  const studioGrant = fixture.state.calls.find((call) => call.name === 'rg_grant_commerce_studio_access');
  assert.deepEqual(studioGrant.args, { p_source_type: 'order', p_source_id: 'order-fixture', p_customer_id: 'payer-customer', p_days: 30 });
});

test('paid fulfillment uses the saved legal identity instead of Stripe or artistic display name', async () => {
  const fixture = commerceFixture({ legalName: 'José Rafael Gámez' });
  await fulfillmentFor(fixture).fulfillStripeCheckoutSession(session());
  assert.match(fixture.state.purchase.contract_text, /José Rafael Gámez/);
  assert.match(fixture.state.purchase.contract_text, /RAFAEL GAMEZ \(RGODBEAT\)/);
  assert.doesNotMatch(fixture.state.purchase.contract_text, /Payer Stage/);
  const resolution = fixture.state.calls.find(call => call.name === 'rg_resolve_commerce_payer_customer');
  assert.equal(resolution.args.p_name, 'José Rafael Gámez');
});

test('Stripe amount mismatch cannot replace the frozen checkout result', async () => {
  const fixture = commerceFixture();
  const fulfillment = fulfillmentFor(fixture);
  await assert.rejects(() => fulfillment.fulfillStripeCheckoutSession(session({ amount_total: 2499 })), /PAYMENT_SNAPSHOT_MISMATCH/);
  assert.equal(fixture.state.order, null);
  assert.equal(fixture.state.purchase, null);
  assert.equal(fixture.state.calls.some((call) => call.name === 'rg_resolve_commerce_payer_customer'), false);
});

test('mandatory purchase failure leaves order processing and a retry completes it', async () => {
  const fixture = commerceFixture({ failPurchaseOnce: true });
  const fulfillment = fulfillmentFor(fixture);
  await assert.rejects(() => fulfillment.fulfillStripeCheckoutSession(session()), /PURCHASE_ENTITLEMENT_FAILED/);
  assert.equal(fixture.state.order.status, 'processing');
  assert.equal(fixture.state.purchase, null);
  assert.equal(fixture.state.intent.state, 'fulfilling');

  const retry = await fulfillment.fulfillStripeCheckoutSession(session());
  assert.equal(retry.status, 'fulfilled');
  assert.equal(fixture.state.order.status, 'completed');
  assert.equal(fixture.state.purchase.license_tier, 'wav');
  assert.equal(fixture.state.calls.filter((call) => call.name === 'rg_grant_commerce_studio_access').length, 1);
});

const utilitySnapshot = (key) => {
 const product=marketRows.find(row=>row.product_key===key);
 return {kind:'rg_market',paymentMethod:'rg_market',currency:'usd',totalAmountCents:key==='studio_30'?0:2175,
 items:key==='studio_30'?[]:[{beatId:'beat-frozen',beatTitle:'Frozen Beat',licenseTypeId:'license-mp3',licenseTier:'mp3',licenseName:'MP3',catalogUnitPrice:29,unitPrice:21.75}],
 utility:{passId:'market-pass',productKey:key,version:1,benefitKind:product.benefit_kind,name:product.name,studioDays:product.studio_days,giftPass:false,discountCents:key==='studio_30'?0:725}};
};
test('actual Market fulfillment preserves the partial USD price and consumes only after canonical completion',async()=>{
 const fixture=commerceFixture({snapshot:utilitySnapshot('mp3_25')});
 const result=await fulfillmentFor(fixture).fulfillStripeCheckoutSession(session({amount_total:2175,metadata:{type:'rg_market',commerceIntentId:'intent-fixture'}}));
 assert.equal(result.status,'fulfilled');assert.equal(fixture.state.order.total_amount,21.75);assert.equal(fixture.state.purchase.license_tier,'mp3');
 const consumption=fixture.state.calls.findIndex(c=>c.name==='rg_consume_market_pass');
 const completion=fixture.state.calls.findIndex(c=>c.table==='orders'&&c.action==='update'&&c.values.status==='completed');
 assert.ok(consumption>completion);assert.equal(fixture.state.intent.state,'fulfilled');
});
test('actual RG Studio fulfillment uses the existing idempotent Studio grant for the purchaser at zero USD',async()=>{
 const fixture=commerceFixture({snapshot:utilitySnapshot('studio_30')});const fulfillment=fulfillmentFor(fixture);
 const marketSession=session({id:'rgmarket:intent-fixture',amount_total:0,payment_intent:null,metadata:{type:'rg_market',commerceIntentId:'intent-fixture'}});
 for(let i=0;i<2;i++)assert.equal((await fulfillment.fulfillStripeCheckoutSession(marketSession)).status,'fulfilled');
 assert.equal(fixture.state.order.total_amount,0);assert.equal(fixture.state.purchase,null);
 for(const grant of fixture.state.calls.filter(c=>c.name==='rg_grant_commerce_studio_access'))assert.deepEqual(grant.args,{p_source_type:'order',p_source_id:'order-fixture',p_customer_id:'payer-customer',p_days:30});
 assert.equal(fixture.state.calls.filter(c=>c.name==='rg_consume_market_pass').length,2);
});
