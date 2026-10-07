import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { resolve } from 'node:path';
import { loadSource } from './helpers/rg-fixtures.mjs';

const webhookSecret = 'whsec_local_fixture_only';
const stripe = new Stripe('sk_test_fixture_no_network', { apiVersion: '2025-02-24.acacia' });
const runtime = { fulfill: async () => {}, order: { id: 'order-fixture' }, duplicate: false, calls: [] };
const supabase = {
  async rpc(name, args) {
    runtime.calls.push({ kind: 'rpc', name, args });
    if (name === 'rg_claim_stripe_event') return { data: runtime.duplicate ? null : '00000000-0000-4000-8000-000000000001', error: null };
    return { data: null, error: null };
  },
  from(table) {
    const state = { table, filters: [], update: null, upsert: null };
    const builder = {
      select() { return this; },
      update(value) { state.update = value; return this; },
      upsert(value, options) { state.upsert = { value, options }; return this; },
      eq(key, value) { state.filters.push([key, value]); return this; },
      maybeSingle: async () => ({ data: runtime.order, error: null }),
      then(resolve, reject) {
        runtime.calls.push({ kind: 'query', ...state });
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
};
const route = loadSource(resolve('app/api/webhooks/stripe/route.ts'), {
  'next/server': {
    NextRequest: class {},
    NextResponse: { json: (body, init = {}) => ({ status: init.status || 200, json: async () => body }) },
  },
  '@/lib/stripe/server': {
    getStripe: () => stripe,
    getStripeWebhookSecret: () => webhookSecret,
    stripeWebhookSecret: webhookSecret,
    isStripeConfigured: () => true,
  },
  '@/lib/commerce/fulfillment': { fulfillStripeCheckoutSession: (...args) => runtime.fulfill(...args) },
  '@/lib/supabase/admin': { createAdminClient: () => supabase },
});

function signedRequest(type, object, { secret = webhookSecret, signatureOverride } = {}) {
  const event = {
    id: 'evt_fixture_' + type.replaceAll('.', '_'), object: 'event', api_version: '2025-02-24.acacia',
    created: 1_798_704_000, data: { object }, livemode: false, pending_webhooks: 1,
    request: { id: null, idempotency_key: null }, type,
  };
  const raw = JSON.stringify(event);
  const signature = signatureOverride || stripe.webhooks.generateTestHeaderString({ payload: raw, secret });
  return { text: async () => raw, headers: { get: (name) => name === 'stripe-signature' ? signature : null } };
}

function reset() {
  runtime.fulfill = async () => {};
  runtime.order = { id: 'order-fixture' };
  runtime.duplicate = false;
  runtime.calls = [];
}

test('Stripe SDK signature verification gates signed paid checkout fulfillment', async () => {
  reset();
  let fulfilled;
  runtime.fulfill = async (session) => { fulfilled = session; };
  const session = { id: 'cs_fixture', object: 'checkout.session', payment_status: 'paid', amount_total: 2500, currency: 'usd', metadata: {} };
  const response = await route.POST(signedRequest('checkout.session.completed', session));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).received, true);
  assert.equal(fulfilled.id, 'cs_fixture');
  assert.equal(runtime.calls.find((call) => call.name === 'rg_claim_stripe_event').args.p_event_type, 'checkout.session.completed');
  assert.equal(runtime.calls.at(-1).args.p_success, true);
});

test('invalid signature and unpaid checkout cannot fulfill or claim paid entitlement', async () => {
  reset();
  let fulfilled = false;
  runtime.fulfill = async () => { fulfilled = true; };
  const invalid = await route.POST(signedRequest('checkout.session.completed', { id: 'cs_invalid', payment_status: 'paid' }, { signatureOverride: 't=1,v1=00' }));
  assert.equal(invalid.status, 400);
  assert.equal(runtime.calls.length, 0);
  const unpaid = await route.POST(signedRequest('checkout.session.completed', { id: 'cs_unpaid', payment_status: 'unpaid' }));
  assert.equal(unpaid.status, 200);
  assert.equal(fulfilled, false);
  assert.equal(runtime.calls.at(-1).args.p_success, true);
});

test('duplicate verified Stripe event is acknowledged without a second fulfillment', async () => {
  reset();
  runtime.duplicate = true;
  let fulfilled = false;
  runtime.fulfill = async () => { fulfilled = true; };
  const response = await route.POST(signedRequest('checkout.session.completed', { id: 'cs_duplicate', payment_status: 'paid' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).duplicate, true);
  assert.equal(fulfilled, false);
});

test('failed mandatory fulfillment records failed lease so Stripe can retry', async () => {
  reset();
  let attempts = 0;
  runtime.fulfill = async () => { attempts++; if (attempts === 1) throw new Error('fixture_partial_failure'); };
  const first = await route.POST(signedRequest('checkout.session.completed', { id: 'cs_retry', payment_status: 'paid' }));
  assert.equal(first.status, 500);
  assert.equal(runtime.calls.at(-1).args.p_success, false);
  runtime.calls = [];
  const second = await route.POST(signedRequest('checkout.session.completed', { id: 'cs_retry', payment_status: 'paid' }));
  assert.equal(second.status, 200);
  assert.equal(attempts, 2);
  assert.equal(runtime.calls.at(-1).args.p_success, true);
});

test('signed full refund and dispute request order revocation', async () => {
  reset();
  const refund = await route.POST(signedRequest('charge.refunded', {
    id: 'ch_refund', object: 'charge', amount: 2500, amount_refunded: 2500, payment_intent: 'pi_refund',
  }));
  assert.equal(refund.status, 200);
  assert.ok(runtime.calls.some((call) => call.name === 'rg_revoke_commerce_order' && call.args.p_reason === 'refund'));

  reset();
  const dispute = await route.POST(signedRequest('charge.dispute.created', {
    id: 'dp_fixture', object: 'dispute', charge: {
      id: 'ch_dispute', object: 'charge', amount: 2500, amount_refunded: 0, payment_intent: 'pi_dispute',
    },
  }));
  assert.equal(dispute.status, 200);
  assert.ok(runtime.calls.some((call) => call.name === 'rg_revoke_commerce_order' && call.args.p_reason === 'dispute'));
});

test('partial refund remains a manual-review case', async () => {
  reset();
  const response = await route.POST(signedRequest('charge.refunded', {
    id: 'ch_partial', object: 'charge', amount: 2500, amount_refunded: 1000, payment_intent: 'pi_partial',
  }));
  assert.equal(response.status, 200);
  assert.ok(runtime.calls.some((call) => call.kind === 'query' && call.table === 'commerce_manual_reviews'
    && call.upsert?.value?.reason === 'partial_refund_item_mapping'));
  assert.ok(!runtime.calls.some((call) => call.name === 'rg_revoke_commerce_order'));
});
