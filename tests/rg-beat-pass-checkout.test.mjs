import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { loadSource } from './helpers/rg-fixtures.mjs';
import { marketRows } from './helpers/rg-market-fixtures.mjs';

const user = { id: '40000000-0000-4000-8000-000000000001', email: 'payer@example.test', email_confirmed_at: '2026-10-01', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const line = { beatId: 'beat', beatTitle: 'Beat', licenseTier: 'mp3', licenseTypeId: 'mp3-license', licenseName: 'MP3', unitPrice: 29 };
const body = { paymentMethod: 'rg_beat_pass', idempotencyKey: '50000000-0000-4000-8000-000000000001', recipientMode: 'gift', recipientKind: 'email', recipientEmail: 'recipient@example.test', items: [{ beatId: 'beat', licenseTier: 'mp3' }] };
const request = (payload, path = 'rg-beat-pass') => new NextRequest(`https://example.test/api/checkout/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' }, body: JSON.stringify(payload) });

test('Stripe client loading is deferred until the normal payment form requests it', async () => {
  const calls = [];
  const client = loadSource('lib/stripe/client.ts', {
    '@stripe/stripe-js/pure': { loadStripe: key => { calls.push(key); return Promise.resolve(null); } },
    '@stripe/stripe-js': new Proxy({}, { get() { throw Error('Eager Stripe runtime import'); } }),
  });
  assert.deepEqual(calls, []);
  const first = client.getStripeClient();
  assert.equal(first, client.getStripeClient());
  await first;
  assert.equal(calls.length, 1);
});

function fixture({ reserveError = null, fulfillmentError = false } = {}) {
  const calls = [];
  const db = {
    async rpc(name, args) { calls.push({ name, args }); return { data: null, error: name === 'rg_reserve_next_beat_pass' ? reserveError : null }; },
    from(table) {
      const state = { table, action: 'select', values: null };
      const query = {
        select() { return query; }, eq() { return query; },
        insert(values) { state.action = 'insert'; state.values = values; return query; },
        update(values) { state.action = 'update'; state.values = values; return query; },
        single: () => execute(), maybeSingle: () => execute(), then: (resolve) => execute().then(resolve),
      };
      async function execute() {
        calls.push({ ...state });
        if (table === 'rg_economy_config') return { data: { beat_pass_enabled: true, beat_pass_cost_rg: 10000, beat_pass_eligible_license_tiers: ['mp3'] }, error: null };
        if (table === 'rg_market_products') return {data:marketRows.find(row=>row.product_key==='beat_pass'),error:null};
        if (table === 'purchases') return { data: [], error: null };
        if (state.action === 'insert') return { data: { id: 'intent' }, error: null };
        return { data: null, error: null };
      }
      return query;
    },
  };
  const replacements = {
    '@/lib/auth/server': { getCurrentUser: async () => user },
    '@/lib/commerce/admin-client': { createCommerceAdminClient: () => db },
    '@/lib/commerce/fulfillment': {
      resolveAuthoritativeCart: async () => ({ items: [line], totalAmount: 29, currency: 'usd' }),
      fulfillStripeCheckoutSession: async (session) => {
        calls.push({ name: 'fulfillment', session });
        if (fulfillmentError) throw Error('Gift fulfillment failed');
        return { status: 'fulfilled', orderId: 'order', giftStatus: 'awaiting_claim' };
      },
    },
    '@/lib/stripe/server': {
      isStripeConfigured: () => true,
      getStripe: () => ({ checkout: { sessions: { create: async (params) => { calls.push({ name: 'stripe_session', params }); return { id: 'cs-fixture', client_secret: 'fixture', url: null }; } } } }),
    },
  };
  return { calls, replacements, route: loadSource('app/api/checkout/rg-beat-pass/route.ts', replacements) };
}

async function giftConfig(run) {
  const keys = ['RG_GIFTS_ENABLED', 'RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY'];
  const saved = keys.map(key => process.env[key]);
  process.env.RG_GIFTS_ENABLED = 'true';
  process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  try { await run(); } finally { keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }); }
}

test('Beat Pass email gift freezes a $0 Gift V1 intent and reserves before fulfillment without Stripe', async () => giftConfig(async () => {
  const f = fixture();
  const response = await f.route.POST(request(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'fulfilled', orderId: 'order', totalAmount: 0, paymentMethod: 'rg_beat_pass', purchases: [], giftStatus: 'awaiting_claim' });
  const intent = f.calls.find(call => call.table === 'commerce_checkout_intents' && call.action === 'insert').values;
  assert.equal(intent.buyer_auth_user_id, user.id);
  assert.equal(intent.recipient_mode, 'gift');
  assert.equal(intent.recipient_kind, 'email');
  assert.equal(intent.recipient_email, body.recipientEmail);
  assert.equal(intent.snapshot.totalAmountCents, 0);
  assert.equal(intent.snapshot.items[0].unitPrice, 0);
  assert.equal(intent.snapshot.items[0].catalogUnitPrice, 29);
  const reserve = f.calls.findIndex(call => call.name === 'rg_reserve_next_beat_pass');
  const fulfill = f.calls.findIndex(call => call.name === 'fulfillment');
  assert.ok(reserve >= 0 && fulfill > reserve);
  assert.equal(f.calls[fulfill].session.amount_total, 0);
  assert.equal(f.calls[fulfill].session.payment_intent, null);
  assert.ok(f.calls[fulfill].session.id.startsWith('rgpass:'));
  assert.ok(!f.calls.some(call => call.name === 'stripe_session'));
}));

test('missing encryption key fails closed; valid configuration reaches email validation without mutations', async () => giftConfig(async () => {
  delete process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  const f = fixture();
  const blocked = await f.route.POST(request(body));
  assert.equal(blocked.status, 503);
  assert.equal((await blocked.json()).error, 'El envío seguro de regalos no está configurado.');
  process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const allowed = await f.route.POST(request({ ...body, recipientEmail: 'invalid' }));
  assert.equal(allowed.status, 400);
  assert.equal((await allowed.json()).error, 'Escribe un correo válido para recibir el regalo.');
  assert.ok(!f.calls.some(call => call.action === 'insert' || call.name === 'rg_reserve_next_beat_pass' || call.name === 'stripe_session'));
}));

test('reservation failure or fulfillment failure never falls back to Stripe or consumes the pass in the route', async () => giftConfig(async () => {
  for (const options of [{ reserveError: { message: 'rg_beat_pass_unavailable' } }, { fulfillmentError: true }]) {
    const f = fixture(options);
    const response = await f.route.POST(request(body));
    assert.equal(response.status, options.reserveError ? 409 : 503);
    assert.ok(!f.calls.some(call => call.name === 'stripe_session' || call.name === 'rg_consume_beat_pass'));
  }
}));

test('normal checkout rejects a misrouted Beat Pass before cart, database or Stripe operations', async () => {
  const f = fixture();
  const stripeRoute = loadSource('app/api/checkout/route.ts', f.replacements);
  const response = await stripeRoute.POST(request(body, ''));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /canje RG Beat Pass/);
  assert.deepEqual(f.calls, []);
});

test('normal payment retains the authoritative $29 Stripe price', async () => {
  const f = fixture();
  const stripeRoute = loadSource('app/api/checkout/route.ts', f.replacements);
  const response = await stripeRoute.POST(request({ ...body, paymentMethod: 'stripe', recipientMode: 'self' }, ''));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).totalAmount, 29);
  const session = f.calls.find(call => call.name === 'stripe_session');
  assert.equal(session.params.line_items[0].price_data.unit_amount, 2900);
  assert.ok(!f.calls.some(call => call.name === 'rg_reserve_next_beat_pass'));
});

test('the existing fulfillment pipeline consumes a gift pass only after Gift V1 succeeds', async () => {
  for (const outcome of ['fulfilled', 'payment_reversed', 'failure']) {
    const calls = [];
    const intent = { id: 'intent', recipient_mode: 'gift', recipient_kind: 'email', recipient_email: body.recipientEmail, buyer_email: user.email, state: 'awaiting_payment', attempt_count: 0,
      snapshot: { kind: 'beat_pass_redemption', paymentMethod: 'rg_beat_pass', totalAmountCents: 0, currency: 'usd', items: [{ ...line, unitPrice: 0 }] } };
    const db = {
      async rpc(name) { calls.push(name); return { data: name === 'rg_resolve_commerce_payer_customer' ? 'customer' : true, error: null }; },
      from(table) {
        let update = false;
        const q = { select() { return q; }, eq() { return q; }, not() { return q; }, update() { update = true; return q; },
          async maybeSingle() { return { data: table === 'commerce_checkout_intents' ? update ? { id: intent.id } : intent : null, error: null }; } };
        return q;
      },
    };
    const pipeline = loadSource('lib/commerce/fulfillment.ts', {
      '@/lib/commerce/admin-client': { createCommerceAdminClient: () => db },
      './gift-fulfillment': { fulfillPaidGiftCheckout: async ({ cart, intent: frozen }) => {
        calls.push('Gift V1 fulfillment');
        assert.equal(cart.totalAmount, 0);
        assert.equal(frozen.recipient_email, body.recipientEmail);
        if (outcome === 'failure') throw Error('Mandatory gift failure');
        return { status: outcome, orderId: 'order' };
      } },
    });
    const session = { id: 'rgpass:intent', payment_status: 'paid', amount_total: 0, currency: 'usd', payment_intent: null, customer: null, customer_details: { email: user.email }, metadata: { type: 'rg_beat_pass', commerceIntentId: 'intent' } };
    if (outcome === 'failure') await assert.rejects(pipeline.fulfillStripeCheckoutSession(session), /Mandatory gift failure/);
    else assert.equal((await pipeline.fulfillStripeCheckoutSession(session)).status, outcome);
    assert.equal(calls.includes('rg_consume_beat_pass'), outcome === 'fulfilled');
    if (outcome === 'fulfilled') assert.ok(calls.indexOf('rg_consume_beat_pass') > calls.indexOf('Gift V1 fulfillment'));
  }
});
