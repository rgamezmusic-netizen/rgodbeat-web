import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadSource } from './helpers/rg-fixtures.mjs';
const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const model = loadSource('lib/studio/deliveries/model.ts');
const { audioBufferToWav } = loadSource('lib/studio/audio/wavEncoder.ts');

async function fixture(frames = 4800) {
  const samples = new Float32Array(frames).fill(0.125);
  const blob = audioBufferToWav({ numberOfChannels: 1, sampleRate: 48000, length: frames, getChannelData: () => samples }, 32);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const file = { id: randomUUID(), trackId: 'lead1', name: 'Lead 1', filename: '01_Lead_1_RAW_143BPM_Fs_Menor.wav',
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sampleRate: 48000, channels: 1,
    durationSeconds: frames / 48000, tuning: { rootKey: 'F#', scaleMode: 'minor' } };
  const input = { artistName: 'Artista de prueba', title: 'Tema de prueba', message: 'Voces para mezcla',
    project: { beatTitle: 'Beat de prueba', bpm: 143, key: 'F#', scale: 'Menor Natural', durationSeconds: frames / 48000 }, files: [file] };
  return { id: randomUUID(), input, file, bytes };
}
function fakeR2() {
  const objects = new Map(), uploads = new Map(), operations = [];
  let version = 0, failIndex = false;
  const missing = () => Object.assign(new Error('missing'), { name: 'NoSuchKey' });
  const conflict = () => Object.assign(new Error('conflict'), { $metadata: { httpStatusCode: 412 } });
  const client = { async send(command) {
    const name = command.constructor.name, input = command.input;
    operations.push({ name, ...input });
    if (name === 'PutObjectCommand') {
      const previous = objects.get(input.Key);
      if (input.IfNoneMatch && previous || input.IfMatch && previous?.etag !== input.IfMatch) throw conflict();
      if (failIndex && input.Key.startsWith('studio/delivery-inbox/')) { failIndex = false; throw new Error('Index temporarily unavailable'); }
      const etag = `etag-${++version}`;
      objects.set(input.Key, { bytes: Buffer.from(input.Body), etag, metadata: input.Metadata });
      return { ETag: etag };
    }
    if (name === 'GetObjectCommand' || name === 'HeadObjectCommand') {
      const value = objects.get(input.Key); if (!value) throw missing();
      return { ETag: value.etag, ContentLength: value.bytes.length, Metadata: value.metadata,
        Body: { transformToString: async () => value.bytes.toString(), transformToByteArray: async () => new Uint8Array(value.bytes) } };
    }
    if (name === 'CreateMultipartUploadCommand') {
      const UploadId = randomUUID(); uploads.set(UploadId, { key: input.Key, metadata: input.Metadata, parts: [] }); return { UploadId };
    }
    if (name === 'UploadPartCommand') {
      uploads.get(input.UploadId).parts[input.PartNumber - 1] = Buffer.from(input.Body); return { ETag: `part-${input.PartNumber}` };
    }
    if (name === 'CompleteMultipartUploadCommand') {
      const upload = uploads.get(input.UploadId);
      assert(upload.parts.slice(0, -1).every(part => part.length >= 5 * 1024 * 1024), 'nonfinal R2 multipart segments must be at least 5 MiB');
      const etag = `etag-${++version}`;
      objects.set(input.Key, { bytes: Buffer.concat(upload.parts), etag, metadata: upload.metadata });
      uploads.delete(input.UploadId); return { ETag: etag };
    }
    if (name === 'AbortMultipartUploadCommand') { uploads.delete(input.UploadId); return {}; }
    if (name === 'DeleteObjectsCommand') { for (const item of input.Delete.Objects) objects.delete(item.Key); return {}; }
    if (name === 'ListObjectsV2Command') {
      const keys = [...objects.keys()].filter(key => key.startsWith(input.Prefix)).sort();
      return { Contents: keys.slice(0, input.MaxKeys).map(Key => ({ Key })), IsTruncated: false };
    }
    throw new Error(`Unexpected command ${name}`);
  } };
  return { objects, uploads, operations, client, failNextIndex() { failIndex = true; } };
}
function environment() {
  const r2 = fakeR2();
  let user = { id: randomUUID(), email: 'artist@example.invalid' }, accessUntil = '2099-01-01T00:00:00Z', notifications = 0;
  const dependencies = {
    '@/lib/storage/r2': { getR2Client: () => r2.client, R2_BUCKET_NAME: 'private-fixture', isR2Configured: () => true },
    '@/lib/auth/server': { getCurrentUser: async () => user },
    '@/lib/auth/admin': { isSiteAdmin: identity => identity?.app_metadata?.role === 'admin' },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { studio_access_until: accessUntil }, error: null }) }) }) }) }) },
    '@/lib/studio/deliveries/notification': { deliveryEmailConfigured: () => false, notifyDelivery: async () => { notifications++; return 'pending'; } },
  };
  const root = loadSource('app/api/studio/deliveries/route.ts', dependencies);
  const upload = loadSource('app/api/studio/deliveries/[id]/route.ts', dependencies);
  const download = loadSource('app/api/admin/studio-deliveries/[id]/download/route.ts', dependencies);
  const storage = loadSource('lib/studio/deliveries/storage.ts', dependencies);
  const request = (url, method, body, headers = {}) => new NextRequest(`https://studio.invalid${url}`, { method,
    headers: { origin: 'https://studio.invalid', ...headers }, ...(body === undefined ? {} : { body: typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body }) });
  const context = id => ({ params: Promise.resolve({ id }) });
  return { r2, root, upload, download, storage, request, context, get notifications() { return notifications; },
    get user() { return user; }, set user(value) { user = value; }, set accessUntil(value) { accessUntil = value; } };
}

test('delivery keeps current tempo, tone, scale, duration and per-track tuning without accepting identity overrides', async () => {
  const { input } = await fixture();
  const parsed = model.parseDeliveryInput({ ...input, ownerId: 'attacker', contactEmail: 'attacker@example.invalid', receivedAt: 'fake' });
  assert.deepEqual(parsed, input);
  const readme = model.deliveryReadme({ ...parsed, id: randomUUID(), contactEmail: 'artist@example.invalid' });
  assert.match(readme, /143 BPM/); assert.match(readme, /F#/); assert.match(readme, /Menor Natural/);
  assert.match(readme, /00:00.000/); assert.match(readme, /minor \(no aplicada al RAW\)/);
});
test('malformed, duplicate, oversized and unaligned tracks are rejected', async () => {
  const { input } = await fixture();
  for (const change of [
    { project: { ...input.project, bpm: NaN } }, { files: [] }, { files: [input.files[0], input.files[0]] },
    { files: [{ ...input.files[0], filename: '../private.wav' }] },
    { files: [{ ...input.files[0], bytes: model.MAX_DELIVERY_FILE_BYTES + 1 }] },
    { files: [{ ...input.files[0], durationSeconds: 2 }] },
  ]) assert.throws(() => model.parseDeliveryInput({ ...input, ...change }));
});
test('real float WAV headers match their declared sample rate and duration; tampering is rejected', async () => {
  const { file, bytes } = await fixture();
  model.validateDeliveryWav(bytes, file);
  assert.throws(() => model.validateDeliveryWav(bytes, { ...file, sampleRate: 44100 }), /WAV/);
  const damaged = Buffer.from(bytes); damaged.writeUInt16LE(24, 34);
  assert.throws(() => model.validateDeliveryWav(damaged, file), /WAV/);
});
test('anonymous users, expired or invalid passes and cross-origin requests cannot create delivery intents', async () => {
  const env = environment(), data = await fixture();
  env.user = null;
  assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id: data.id, ...data.input }))).status, 401);
  env.user = { id: randomUUID(), email: 'artist@example.invalid' };
  for (const expiry of ['2000-01-01', 'invalid']) {
    env.accessUntil = expiry;
    assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id: data.id, ...data.input }))).status, 403);
  }
  env.accessUntil = '2099-01-01';
  assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id: data.id, ...data.input }, { origin: 'https://attacker.invalid' }))).status, 403);
  assert.equal(env.r2.objects.size, 0);
});
test('creation is idempotent; contact comes from verified account; changed snapshots cannot overwrite it', async () => {
  const env = environment(), data = await fixture();
  const body = { id: data.id, ...data.input, ownerId: 'attacker', contactEmail: 'attacker@example.invalid' };
  assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', body))).status, 201);
  assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', body))).status, 200);
  const stored = (await env.storage.readDelivery(data.id)).delivery;
  assert.equal(stored.ownerId, env.user.id); assert.equal(stored.contactEmail, env.user.email);
  assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', { ...body, title: 'Changed' }))).status, 409);
});
test('a different artist cannot upload, confirm or download another artist’s delivery', async () => {
  const env = environment(), { id, input, file, bytes } = await fixture();
  await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id, ...input }));
  env.user = { id: randomUUID(), email: 'other@example.invalid' };
  const base = `/api/studio/deliveries/${id}`;
  assert.equal((await env.upload.PUT(env.request(`${base}?file=${file.id}&index=0`, 'PUT', bytes), env.context(id))).status, 404);
  assert.equal((await env.upload.POST(env.request(base, 'POST'), env.context(id))).status, 404);
  assert.equal((await env.download.GET(env.request(`/api/admin/studio-deliveries/${id}/download?file=info`, 'GET'), env.context(id))).status, 403);
});
test('missing chunks and modified audio cannot appear in the inbox or send mail', async () => {
  const env = environment(), { id, input, file, bytes } = await fixture();
  await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id, ...input }));
  const base = `/api/studio/deliveries/${id}`;
  assert.equal((await env.upload.POST(env.request(`${base}?file=${file.id}`, 'POST'), env.context(id))).status, 409);
  const damaged = Buffer.from(bytes); damaged[100] ^= 1;
  assert.equal((await env.upload.PUT(env.request(`${base}?file=${file.id}&index=0`, 'PUT', damaged), env.context(id))).status, 200);
  assert.equal((await env.upload.POST(env.request(`${base}?file=${file.id}`, 'POST'), env.context(id))).status, 422);
  assert.equal((await env.upload.POST(env.request(base, 'POST'), env.context(id))).status, 409);
  assert.equal((await env.storage.listDeliveries()).deliveries.length, 0); assert.equal(env.notifications, 0); assert.equal(env.r2.uploads.size, 0);
});
test('multipart WAV is verified byte for byte; receipt survives index failure and retry; metadata requires admin', async () => {
  const env = environment(), { id, input, file, bytes } = await fixture(1_600_000);
  await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id, ...input }));
  const base = `/api/studio/deliveries/${id}`;
  for (let offset = 0; offset < bytes.length; offset += model.DELIVERY_CHUNK_BYTES) {
    assert.equal((await env.upload.PUT(env.request(`${base}?file=${file.id}&index=${offset / model.DELIVERY_CHUNK_BYTES}`, 'PUT', bytes.subarray(offset, offset + model.DELIVERY_CHUNK_BYTES)), env.context(id))).status, 200);
  }
  assert.equal((await env.upload.POST(env.request(`${base}?file=${file.id}`, 'POST'), env.context(id))).status, 200);
  assert.deepEqual(env.r2.objects.get(env.storage.deliveryFileKey(id, file.id)).bytes, bytes);
  env.r2.failNextIndex();
  assert.equal((await env.upload.POST(env.request(base, 'POST'), env.context(id))).status, 503);
  assert((await env.storage.readDelivery(id)).delivery.receivedAt);
  const receipt = await env.upload.POST(env.request(base, 'POST'), env.context(id));
  assert.equal(receipt.status, 200); assert.equal((await receipt.json()).notification, 'pending');
  assert.equal((await env.storage.listDeliveries()).deliveries.length, 1);
  assert.equal((await env.upload.PUT(env.request(`${base}?file=${file.id}&index=0`, 'PUT', bytes), env.context(id))).status, 409);
  env.user = { id: randomUUID(), email: 'admin@example.invalid', app_metadata: { role: 'admin' } };
  const info = await env.download.GET(env.request(`/api/admin/studio-deliveries/${id}/download?file=info`, 'GET'), env.context(id));
  assert.equal(info.status, 200); assert.match(await info.text(), /143 BPM/); assert.equal(info.headers.get('cache-control'), 'no-store');
  assert.equal([...env.r2.objects.keys()].filter(key => key.includes('/pending/')).length, 0);
});
test('new-intent daily quota is persistent and does not affect existing delivery retries', async () => {
  const env = environment();
  const first = await fixture();
  for (let index = 0; index < 10; index++) {
    const data = index === 0 ? first : await fixture();
    assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id: data.id, ...data.input }))).status, 201);
  }
  const extra = await fixture();
  assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id: extra.id, ...extra.input }))).status, 429);
  assert.equal((await env.root.POST(env.request('/api/studio/deliveries', 'POST', { id: first.id, ...first.input }))).status, 200);
});
test('notification stays pending without configuration; confirmed mail is escaped, private and idempotent', async () => {
  const env = environment(), data = await fixture();
  const delivery = { ...data.input, artistName: '<script>bad</script>', id: data.id, ownerId: env.user.id, contactEmail: env.user.email,
    createdAt: new Date().toISOString(), receivedAt: new Date().toISOString(), notification: 'pending', notifiedAt: null };
  await env.storage.writeDelivery(delivery, null);
  const notifier = loadSource('lib/studio/deliveries/notification.ts', {
    '@/lib/storage/r2': { getR2Client: () => env.r2.client, R2_BUCKET_NAME: 'private-fixture' },
  });
  const names = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RG_STUDIO_DELIVERY_EMAIL', 'NEXT_PUBLIC_SITE_URL'];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]])), originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    delete process.env.RESEND_API_KEY; delete process.env.RESEND_FROM_EMAIL;
    assert.equal(await notifier.notifyDelivery(data.id), 'pending');
    process.env.RESEND_API_KEY = 'test-only'; process.env.RESEND_FROM_EMAIL = 'sender@example.invalid';
    process.env.RG_STUDIO_DELIVERY_EMAIL = 'recipient@example.invalid'; process.env.NEXT_PUBLIC_SITE_URL = 'https://studio.invalid';
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'fixture rejection' }), { status: 403 });
    assert.equal(await notifier.notifyDelivery(data.id), 'pending');
    const failed = (await env.storage.readDelivery(data.id)).delivery;
    assert.equal(failed.notificationError, 'resend_http_403');
    assert.equal(failed.notificationLeaseUntil, null);
    globalThis.fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      assert.deepEqual(body.to, ['recipient@example.invalid']); assert.match(body.text, /143 BPM/);
      assert.match(body.text, /\/admin\/studio-deliveries\?delivery=/); assert(!body.html.includes('<script>'));
      assert.equal(init.headers['Idempotency-Key'], `studio-delivery-${data.id}`);
      return new Response(JSON.stringify({ id: 'test-provider-confirmation' }), { status: 200 });
    };
    assert.equal(await notifier.notifyDelivery(data.id), 'sent'); assert.equal(await notifier.notifyDelivery(data.id), 'sent'); assert.equal(calls, 1);
    const sent = (await env.storage.readDelivery(data.id)).delivery;
    assert.equal(sent.notificationMessageId, 'test-provider-confirmation');
    assert.equal(sent.notificationError, null);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; }
  }
});
