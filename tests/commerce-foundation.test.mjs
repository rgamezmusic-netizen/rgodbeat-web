import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadSource } from './helpers/rg-fixtures.mjs';

const authorization = loadSource(resolve('lib/commerce/authorization.ts'), {
  '@/lib/auth/admin': { isSiteAdmin: () => false },
});
const fulfillment = loadSource(resolve('lib/commerce/fulfillment.ts'), {
  'server-only': {},
  '@/lib/supabase/admin': { createAdminClient: () => ({}) },
  '@/types/commerce': {},
  '@/types': {},
  './contracts': {},
});
const contracts = loadSource(resolve('lib/commerce/contracts.ts'));
const email = loadSource(resolve('lib/commerce/email.ts'));
const giftFeature = loadSource(resolve('lib/commerce/gift-feature.ts'));

const purchase = (patch = {}) => ({
  id: 'purchase-1', order_id: 'order-1', order_item_id: 'item-1', customer_id: 'licensee-customer',
  beat_id: 'beat-1', license_tier: 'wav', status: 'active', contract_text: 'contract', license_id: 'RG-WAV-2026-000001',
  contract_version: 'NE-v1.0', created_at: '2026-10-01T00:00:00Z', beats: { title: 'Beat' },
  customers: { email: 'recipient@example.test', name: 'Recipient', auth_user_id: 'recipient-user' },
  orders: { id: 'order-1', customer_id: 'payer-customer', status: 'completed', payment_status: 'paid', total_amount: 20, currency: 'usd', customers: { email: 'payer@example.test', name: 'Payer' } },
  ...patch,
});

function fakeSupabase({ row = purchase(), linkedCustomer = null, tokenGrant = null, rpcResult = null } = {}) {
  const calls = [];
  const client = {
    calls,
    rpc: async (name, args) => {
      calls.push({ kind: 'rpc', name, args });
      if (name === 'rg_commerce_link_verified_customer') return { data: linkedCustomer, error: null };
      if (name === 'rg_rotate_purchase_guest_access') return { data: rpcResult || '2030-01-01T00:00:00Z', error: null };
      return { data: null, error: { code: 'unexpected_rpc' } };
    },
    from: (table) => {
      const state = { table, filters: [], updated: false };
      const builder = {
        select() { return this; },
        update() { state.updated = true; return this; },
        eq(key, value) { state.filters.push([key, value]); return this; },
        is(key, value) { state.filters.push([key, value]); return this; },
        gt(key, value) { state.filters.push([key, 'gt', value]); return this; },
        maybeSingle: async () => {
          calls.push({ kind: 'query', ...state });
          return table === 'purchases' ? { data: row, error: null } : { data: tokenGrant, error: null };
        },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
  return client;
}

test('paid download/contract access follows the license holder, not the payer', async () => {
  const supabase = fakeSupabase({ linkedCustomer: 'licensee-customer' });
  const result = await authorization.getAuthorizedPurchase(supabase, 'purchase-1', {
    user: { id: 'recipient-user', email: 'recipient@example.test', email_confirmed_at: '2026-10-01T00:00:00Z' },
  });
  assert.equal(result.customer_id, 'licensee-customer');
  assert.equal(result.orders.customer_id, 'payer-customer');

  const payerClient = fakeSupabase({ linkedCustomer: 'payer-customer' });
  assert.equal(await authorization.getAuthorizedPurchase(payerClient, 'purchase-1', {
    user: { id: 'payer-user', email: 'payer@example.test', email_confirmed_at: '2026-10-01T00:00:00Z' },
  }), null);
});

test('gift checkout defaults off while self checkout stays available', () => {
  const previous = process.env.RG_GIFTS_ENABLED;
  delete process.env.RG_GIFTS_ENABLED;
  assert.equal(giftFeature.isGiftCheckoutEnabled(), false);
  assert.equal(giftFeature.canCheckoutRecipientMode('self'), true);
  assert.equal(giftFeature.canCheckoutRecipientMode('gift'), false);
  process.env.RG_GIFTS_ENABLED = 'true';
  assert.equal(giftFeature.canCheckoutRecipientMode('gift'), true);
  process.env.RG_GIFTS_ENABLED = 'TRUE';
  assert.equal(giftFeature.canCheckoutRecipientMode('gift'), false);
  if (previous === undefined) delete process.env.RG_GIFTS_ENABLED;
  else process.env.RG_GIFTS_ENABLED = previous;
});

test('revoked/refunded or unpaid entitlements fail closed before account or guest authorization', async () => {
  const revoked = fakeSupabase({ row: purchase({ status: 'revoked' }), linkedCustomer: 'licensee-customer' });
  assert.equal(await authorization.getAuthorizedPurchase(revoked, 'purchase-1', {
    user: { id: 'recipient-user', email: 'recipient@example.test', email_confirmed_at: '2026-10-01T00:00:00Z' },
  }), null);
  const refunded = fakeSupabase({ row: purchase({ orders: { ...purchase().orders, payment_status: 'refunded' } }), tokenGrant: { id: 'token-1' } });
  assert.equal(await authorization.getAuthorizedPurchase(refunded, 'purchase-1', { guestToken: () => 'A'.repeat(43) }), null);
});

test('guest credentials are high entropy, order scoped and only their hash is sent to storage', async () => {
  const supabase = fakeSupabase();
  const issued = await authorization.issueGuestPurchaseAccess(supabase, 'order-1', 'payer-customer');
  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.name, authorization.guestPurchaseCookieName('order-1'));
  const call = supabase.calls.find((entry) => entry.name === 'rg_rotate_purchase_guest_access');
  assert.equal(call.args.p_order_id, 'order-1');
  assert.equal(call.args.p_customer_id, 'payer-customer');
  assert.equal(call.args.p_token_hash, authorization.guestPurchaseTokenHash(issued.token));
  assert.notEqual(call.args.p_token_hash, issued.token);
});

test('guest protected access checks purchase, customer, token hash, revocation and expiry scope', async () => {
  const token = 'Q'.repeat(43);
  const valid = fakeSupabase({ tokenGrant: { id: 'guest-grant-1' } });
  const authorized = await authorization.getAuthorizedPurchase(valid, 'purchase-1', {
    guestToken: (orderId) => { assert.equal(orderId, 'order-1'); return token; },
  });
  assert.equal(authorized.id, 'purchase-1');
  const grantQuery = valid.calls.find((entry) => entry.table === 'purchase_guest_access_tokens');
  assert.deepEqual(grantQuery.filters.slice(0, 4), [
    ['order_id', 'order-1'], ['customer_id', 'licensee-customer'],
    ['token_hash', authorization.guestPurchaseTokenHash(token)], ['revoked_at', null],
  ]);
  assert.deepEqual(grantQuery.filters[4].slice(0, 2), ['expires_at', 'gt']);
  assert.ok(Date.parse(grantQuery.filters[4][2]) > Date.now() - 5_000);

  const invalid = fakeSupabase({ tokenGrant: null });
  assert.equal(await authorization.getAuthorizedPurchase(invalid, 'purchase-1', { guestToken: () => 'Z'.repeat(43) }), null);
  assert.equal(await authorization.getAuthorizedPurchase(fakeSupabase(), 'purchase-1', { guestToken: () => 'short' }), null);
  // The live database filter is strictly expires_at > now; a missing match covers expired credentials.
  const expired = fakeSupabase({ tokenGrant: null });
  assert.equal(await authorization.getAuthorizedPurchase(expired, 'purchase-1', { guestToken: () => token }), null);
});

test('gift contract text names payer and recipient in separate roles', () => {
  const text = contracts.generateLicenseContract({
    orderId: 'order-1', customerName: 'Recipient', customerEmail: 'recipient@example.test',
    purchaserName: 'Payer', isGift: true, beatTitle: 'Beat', beatId: 'beat-1',
    licenseTier: 'wav', amountPaid: 20, licenseId: 'RG-WAV-2026-000001',
  });
  assert.match(text, /PURCHASER \(PAYER\): Payer/);
  assert.match(text, /LICENSEE: Recipient \(recipient@example\.test\)/);
  assert.doesNotMatch(text, /payer@example\.test/);
});

test('commerce Studio grants are keyed to successful order/gift source and errors are mandatory', async () => {
  const calls = [];
  const supabase = { rpc: async (name, args) => { calls.push({ name, args }); return { data: '2030-01-01T00:00:00Z', error: null }; } };
  await fulfillment.grantStudioCommerceAccess(supabase, 'order-1', 'customer-1', 30);
  assert.deepEqual(calls[0], { name: 'rg_grant_commerce_studio_access', args: {
    p_source_type: 'order', p_source_id: 'order-1', p_customer_id: 'customer-1', p_days: 30,
  } });
  await assert.rejects(() => fulfillment.grantStudioCommerceAccess({ rpc: async () => ({ data: null, error: { code: 'unavailable' } }) }, 'order-1', 'customer-1'), /STUDIO_ENTITLEMENT_GRANT_FAILED/);
});

test('transactional gift queue rejects plaintext claim credentials and needs a dedicated encryption key', async () => {
  const previous = process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  delete process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  assert.throws(() => email.encryptTransactionalSecret('one-time-claim-token'), /KEY_NOT_CONFIGURED/);
  process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const encrypted = email.encryptTransactionalSecret('one-time-claim-token');
  assert.match(encrypted, /^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/);
  assert.ok(!encrypted.includes('one-time-claim-token'));
  assert.equal(email.decryptTransactionalSecret(encrypted), 'one-time-claim-token');
  const tampered = encrypted.split(':');
  tampered[3] = (tampered[3][0] === 'A' ? 'B' : 'A') + tampered[3].slice(1);
  assert.throws(() => email.decryptTransactionalSecret(tampered.join(':')), /Unsupported state|auth/);
  if (previous === undefined) delete process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  else process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY = previous;
});

test('transactional email worker delivers a claim message through an injected test provider', async () => {
  const previous = process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  const link = 'https://rgodbeat.test/gifts/claim?token=' + 'A'.repeat(43);
  const encrypted = email.encryptTransactionalSecret(link);
  const calls = [];
  const supabase = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'rg_claim_transactional_email_job') return { data: [{ job_id: 'job-1', lease_token: 'lease-1', attempt: 1,
      message_type: 'gift_claim', recipient_email: 'recipient@example.test', encrypted_secret: encrypted,
      payload: { beatTitle: 'Aura Latina', licenseName: 'Standard MP3' } }], error: null };
    return { data: null, error: null };
  } };
  let delivered;
  const result = await email.processNextGiftEmail(supabase, { send: async (message) => { delivered = message; return { providerMessageId: 'mock-1' }; } });
  assert.deepEqual(result, { status: 'sent' });
  assert.match(delivered.text, /Aura Latina/);
  assert.ok(delivered.text.includes(link));
  assert.equal(calls.at(-1).name, 'rg_finish_transactional_email_job');
  assert.equal(calls.at(-1).args.p_status, 'sent');
  assert.equal(calls.at(-1).args.p_provider_message_id, 'mock-1');
  if (previous === undefined) delete process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  else process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY = previous;
});

test('transactional email worker records temporary retry and permanent provider failure states', async () => {
  const previous = process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');
  const encrypted = email.encryptTransactionalSecret('https://rgodbeat.test/gifts/claim?token=' + 'B'.repeat(43));
  const makeClient = (attempt) => {
    const calls = [];
    return { calls, rpc: async (name, args) => {
      calls.push({ name, args });
      return name === 'rg_claim_transactional_email_job'
        ? { data: [{ job_id: 'job-2', lease_token: 'lease-2', attempt, message_type: 'gift_claim', recipient_email: 'recipient@example.test', encrypted_secret: encrypted, payload: {} }], error: null }
        : { data: null, error: null };
    } };
  };
  const instant = new Date('2026-10-06T12:00:00.000Z');
  const retryClient = makeClient(1);
  assert.deepEqual(await email.processNextGiftEmail(retryClient, { send: async () => { throw new email.TransactionalEmailDeliveryError('temporary outage', true); } }, () => instant), { status: 'retry' });
  assert.equal(retryClient.calls.at(-1).args.p_status, 'retry');
  assert.equal(retryClient.calls.at(-1).args.p_next_attempt_at, '2026-10-06T12:00:30.000Z');
  const failedClient = makeClient(1);
  assert.deepEqual(await email.processNextGiftEmail(failedClient, { send: async () => { throw new email.TransactionalEmailDeliveryError('permanent rejection', false); } }, () => instant), { status: 'failed' });
  assert.equal(failedClient.calls.at(-1).args.p_status, 'failed');
  if (previous === undefined) delete process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  else process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY = previous;
});
