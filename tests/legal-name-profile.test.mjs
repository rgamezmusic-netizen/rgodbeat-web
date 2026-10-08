import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { loadSource } from './helpers/rg-fixtures.mjs';

const names = loadSource('lib/account/legal-name.ts');
const identity = loadSource('lib/commerce/contract-identity.ts');
const contracts = loadSource('lib/commerce/contracts.ts');

test('legal name preserves accents and is distinct from artist metadata', () => {
  assert.equal(names.normalizeLegalName('  José   María Gámez  '), 'José María Gámez');
  assert.equal(names.getLegalName({ user_metadata: { full_name: 'Chinox' } }), null);
  for (const value of ['', 'A', '123', '<script>', 'José\nGamez', 'Name\u202eHidden', 'A'.repeat(121), 42]) {
    assert.equal(names.normalizeLegalName(value), null);
  }
});

function profile({ user = { id: 'own-user', user_metadata: { full_name: 'Stage Name' } }, saveError = null } = {}) {
  const updates = [];
  const route = loadSource('app/api/account/profile/route.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user }, error: null }),
      updateUser: async input => { updates.push(input); return { error: saveError }; },
    } }) },
  });
  const request = (body, origin = 'https://rgodbeat.test') => new NextRequest('https://rgodbeat.test/api/account/profile', {
    method: 'PATCH', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { route, updates, request };
}

test('saving a legal name uses own authenticated session and never writes artist name or another user ID', async () => {
  const f = profile();
  const response = await f.route.PATCH(f.request({ legalName: '  Rafael   Gamez ', userId: 'someone-else', full_name: 'Overwrite' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { legalName: 'Rafael Gamez' });
  assert.deepEqual(f.updates, [{ data: { legal_name: 'Rafael Gamez' } }]);
});

test('profile rejects missing session, cross-origin and invalid input; save errors never report success', async () => {
  const anonymous = profile({ user: null });
  assert.equal((await anonymous.route.PATCH(anonymous.request({ legalName: 'Valid Name' }))).status, 401);
  assert.equal(anonymous.updates.length, 0);
  const f = profile();
  assert.equal((await f.route.PATCH(f.request({ legalName: 'Valid Name' }, 'https://evil.test'))).status, 403);
  assert.equal((await f.route.PATCH(f.request({ legalName: 'Name\nInjected' }))).status, 400);
  assert.equal(f.updates.length, 0);
  const failing = profile({ saveError: { message: 'unavailable' } });
  assert.equal((await failing.route.PATCH(failing.request({ legalName: 'Valid Name' }))).status, 503);
});

test('contract identity uses only verified matching recipient; guest and historical names stay compatible', async () => {
  const lookups = [];
  const admin = { auth: { admin: { getUserById: async id => {
    lookups.push(id);
    return { data: { user: { id, email: 'recipient@example.test', email_confirmed_at: '2026-01-01', user_metadata: { full_name: 'Stage Name', legal_name: 'Recipient Legal Name' } } }, error: null };
  } } } };
  assert.equal(await identity.resolveContractCustomerName(admin, { authUserId: 'recipient', email: 'RECIPIENT@example.test', fallbackName: 'Stage' }), 'Recipient Legal Name');
  assert.deepEqual(lookups, ['recipient']);
  assert.equal(await identity.resolveContractCustomerName(admin, { authUserId: 'wrong-account', email: 'payer@example.test', fallbackName: 'Payer' }), 'Payer');
  assert.equal(await identity.resolveContractCustomerName(admin, { email: 'guest@example.test', fallbackName: 'Guest Legal Name' }), 'Guest Legal Name');
  assert.equal(await identity.resolveContractCustomerName({ auth: { admin: { getUserById: async () => ({ data: {}, error: { status: 404 } }) } } }, { authUserId: 'deleted-payer', email: 'payer@example.test', fallbackName: 'Historical Payer' }), 'Historical Payer');
  await assert.rejects(identity.resolveContractCustomerName({ auth: { admin: { getUserById: async () => ({ data: {}, error: {} }) } } }, { authUserId: 'recipient', email: 'recipient@example.test' }), /CONTRACT_IDENTITY_UNAVAILABLE/);
});

const contractParams = { orderId: 'order', customerName: 'José Gámez', customerEmail: 'recipient@example.test',
  purchaserName: 'Payer Legal Name', isGift: true, beatTitle: 'Beat', beatId: 'beat', licenseTier: 'mp3', amountPaid: 0,
  purchaseDate: '2026-10-07T00:00:00Z', licenseId: 'RG-MP3-2026-000001' };

test('MP3 and Exclusive contracts identify RAFAEL GAMEZ and gift recipient legal name, retaining artist credit', async () => {
  for (const tier of ['mp3', 'exclusive']) {
    const text = contracts.generateLicenseContract({ ...contractParams, licenseTier: tier });
    assert.match(text, /RAFAEL GAMEZ \(RGODBEAT\)/);
    assert.match(text, /LICENSEE: José Gámez \(recipient@example.test\)/);
    assert.match(text, /PURCHASER \(PAYER\): Payer Legal Name/);
    assert.match(text, /Prod(uced)?\.?( by)? RGODBEAT|Produced by RGODBEAT/);
    assert.doesNotMatch(text, /\{\{LICENSOR_NAME\}\}/);
    const pdf = await contracts.generateContractPdfBuffer({ ...contractParams, licenseTier: tier });
    assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');
  }
});

test('template substitution treats customer-supplied content literally without recursive placeholder expansion', () => {
  const text = contracts.generateLicenseContract({ ...contractParams, customerName: '$& {{BEAT_NAME}}' });
  assert.ok(text.includes('$& {{BEAT_NAME}}'));
});

test('Email Gift V1 claim stores recipient legal identity without changing recipient authorization or payment', async () => {
  const user = { id: 'recipient', email: 'recipient@example.test', email_confirmed_at: '2026-01-01', user_metadata: { legal_name: 'Recipient Legal Name', full_name: 'Stage' } };
  const gift = { id: 'gift', recipient_kind: 'email', recipient_email: user.email, status: 'ready_to_claim', payment_status: 'paid',
    order_id: 'order', order_item_id: 'line', orders: { status: 'completed', payment_status: 'paid', currency: 'USD', customers: { name: 'Payer Legal Name' } },
    order_items: { unit_price: 29, beat_id: 'beat', beats: { title: 'Beat' }, license_types: { slug: 'mp3' } } };
  const calls = [];
  const admin = { from: table => { let selection=''; const q = { select: value => { selection=value; return q; }, eq: () => q,
    maybeSingle: async () => ({ error: null, data: table === 'gift_claim_tokens' ? { gift_id: 'gift', expires_at: '2099-01-01' }
      : selection === 'market_pass_id' ? { market_pass_id: null } : gift }) }; return q; },
    rpc: async (name, args) => { calls.push({name,args}); return { error: null, data: name === 'rg_allocate_commerce_license_id' ? 'RG-MP3-2026-000001' : [{ purchase_id: 'purchase', license_tier: 'mp3' }] }; } };
  const route = loadSource('app/api/gifts/claim/route.ts', {
    '@/lib/auth/server': { getCurrentUser: async () => user },
    '@/lib/commerce/admin-client': { createCommerceAdminClient: () => admin },
    '@/lib/commerce/authorization': { hasVerifiedEmail: () => true, guestPurchaseTokenHash: () => 'hash', linkVerifiedCommerceCustomer: async () => 'recipient-customer' },
  });
  const response = await route.POST(new NextRequest('https://rgodbeat.test/api/gifts/claim', { method:'POST',
    headers:{origin:'https://rgodbeat.test','Content-Type':'application/json'},body:JSON.stringify({token:'A'.repeat(43)}) }));
  assert.equal(response.status,200);
  const claim = calls.find(call=>call.name==='rg_claim_beat_gift').args;
  assert.equal(claim.p_user_id,'recipient');assert.equal(claim.p_customer_id,'recipient-customer');
  assert.match(claim.p_contract_text,/LICENSEE: Recipient Legal Name/);
  assert.match(claim.p_contract_text,/PURCHASER \(PAYER\): Payer Legal Name/);
});

test('download resolves licensee and payer separately for both PDF and text, without rewriting original purchase', async () => {
  const calls = [];
  const purchase = { id: 'purchase', order_id: 'order', order_item_id: 'line', customer_id: 'recipient-customer',
    beat_id: 'beat', license_tier: 'mp3', created_at: contractParams.purchaseDate, contract_text: 'Historical original',
    beats: { title: 'Beat' }, customers: { name: 'Stage', email: 'recipient@example.test', auth_user_id: 'recipient' },
    orders: { customer_id: 'payer-customer', total_amount: 0, currency: 'USD', customers: { name: 'Payer Stage', email: 'payer@example.test', auth_user_id: 'payer' } } };
  const admin = { auth: { admin: { getUserById: async id => ({ data: { user: { id, email: `${id}@example.test`, email_confirmed_at: '2026-01-01', user_metadata: { legal_name: `${id === 'recipient' ? 'Recipient' : 'Payer'} Legal Name` } } }, error: null }) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { unit_price: 0 } }) }) }) }) };
  const route = loadSource('app/api/download/[purchaseId]/route.ts', {
    '@/lib/auth/server': { getCurrentUser: async () => ({ id: 'downloading-admin' }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/commerce/authorization': { getAuthorizedPurchase: async () => purchase },
    '@/lib/commerce/contracts': { extractLicenseMetadata: () => ({ licenseId: 'license', contractVersion: 'NE-v1.0' }),
      generateLicenseContract: params => { calls.push(params); return `${params.customerName}|${params.purchaserName}`; },
      generateContractPdfBuffer: async params => { calls.push(params); return new Uint8Array([37, 80, 68, 70]); } },
  });
  for (const format of ['txt', 'pdf']) {
    const response = await route.GET(new NextRequest(`https://rgodbeat.test/api/download/purchase?fileType=contract&format=${format}`), { params: Promise.resolve({ purchaseId: 'purchase' }) });
    assert.equal(response.status, 200);
    if (format === 'txt') assert.equal(await response.text(), 'Recipient Legal Name|Payer Legal Name');
  }
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.equal(call.customerName, 'Recipient Legal Name'); assert.equal(call.purchaserName, 'Payer Legal Name'); assert.equal(call.isGift, true); }
  assert.equal(purchase.contract_text, 'Historical original');
});
