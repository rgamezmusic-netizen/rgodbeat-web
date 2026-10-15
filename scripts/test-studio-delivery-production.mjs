import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { loadSource } from '../tests/helpers/rg-fixtures.mjs';

// Run explicitly inside Vercel's production build environment. Never export credentials.
const id = process.env.STUDIO_DELIVERY_PRODUCTION_TEST_ID || '';
const model = loadSource('lib/studio/deliveries/model.ts');
assert(model.DELIVERY_UUID.test(id), 'Set a unique STUDIO_DELIVERY_PRODUCTION_TEST_ID to authorize this real delivery/email test.');
const storage = loadSource('lib/studio/deliveries/storage.ts');
const notification = loadSource('lib/studio/deliveries/notification.ts');
const { audioBufferToWav } = loadSource('lib/studio/audio/wavEncoder.ts');
assert(notification.deliveryEmailConfigured(), 'Production delivery email must be configured.');
assert.equal(notification.deliveryRecipient().toLowerCase(), 'rgodbeat@gmail.com', 'The test must go only to the authorized recipient.');
const sender = process.env.RESEND_FROM_EMAIL?.trim();
assert.equal(sender, 'RGodbeat Gifts <gifts@mail.rgodbeat.com>', 'Verify the requested sender name without changing the sending address.');

const sampleRate = 48000, durationSeconds = 2;
const samples = Float32Array.from({ length: sampleRate * durationSeconds }, (_, frame) =>
  0.02 * Math.sin(2 * Math.PI * 261.625565 * frame / sampleRate));
const blob = audioBufferToWav({ numberOfChannels: 1, sampleRate, length: samples.length, getChannelData: () => samples }, 32);
const bytes = Buffer.from(await blob.arrayBuffer());
let stored = await storage.readDelivery(id);
if (!stored) {
  const input = model.parseDeliveryInput({ artistName: 'RGODBEAT — prueba técnica', title: 'Verificación real de recepción y correo',
    message: 'PRUEBA TÉCNICA: este archivo contiene únicamente un tono sintético de dos segundos. Verifica la subida real, los datos del proyecto y el aviso a RGODBEAT. No contiene una grabación de artista.',
    project: { beatTitle: 'Audio sintético de verificación', bpm: 120, key: 'C', scale: 'Cromática', durationSeconds },
    files: [{ id: randomUUID(), trackId: 'technical-verification', name: 'Tono sintético de prueba', filename: 'PRUEBA_TECNICA_RAW_120BPM_C_Cromatica.wav',
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sampleRate, channels: 1, durationSeconds,
      tuning: { rootKey: 'C', scaleMode: 'chromatic' } }] });
  await storage.writeDelivery({ ...input, id, ownerId: 'system:production-verification', contactEmail: notification.deliveryRecipient(),
    createdAt: new Date().toISOString(), receivedAt: null, notification: 'pending', notifiedAt: null }, null);
  stored = await storage.readDelivery(id);
}
assert.equal(stored.delivery.ownerId, 'system:production-verification');
const file = stored.delivery.files[0];
assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
if (!await storage.deliveryFileReady(id, file)) {
  for (let offset = 0; offset < bytes.length; offset += model.DELIVERY_CHUNK_BYTES) {
    await storage.stageDeliveryChunk(id, file, offset / model.DELIVERY_CHUNK_BYTES, bytes.subarray(offset, offset + model.DELIVERY_CHUNK_BYTES));
  }
  await storage.finishDeliveryFile(id, file);
}
assert(await storage.deliveryFileReady(id, file), 'The real WAV must be confirmed in R2.');
if (!stored.delivery.receivedAt) {
  await storage.writeDelivery({ ...stored.delivery, receivedAt: new Date().toISOString() }, stored.etag);
  stored = await storage.readDelivery(id);
}
await storage.indexDelivery(stored.delivery);
const status = await notification.notifyDelivery(id);
const confirmed = await storage.readDelivery(id);
console.log('STUDIO_PRODUCTION_CHECK ' + JSON.stringify({ id, sender, wavConfirmed: true, notification: status,
  reason: confirmed.delivery.notificationError || null, bpm: 120, key: 'C', scale: 'Cromática' }));
assert.equal(status, 'sent', 'The real email must be accepted by Resend before promoting the deployment.');

// A send-only API key can confirm acceptance but may not inspect delivery events.
if (confirmed.delivery.notificationMessageId) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(confirmed.delivery.notificationMessageId)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) { console.log('STUDIO_EMAIL_EVENT read_permission_unavailable'); break; }
    const email = await response.json();
    const event = ['sent', 'delivered', 'delivery_delayed', 'bounced', 'failed', 'opened', 'clicked'].includes(email.last_event) ? email.last_event : 'unknown';
    console.log('STUDIO_EMAIL_EVENT ' + event);
    if (['delivered', 'opened', 'clicked'].includes(event)) break;
    assert(!['bounced', 'failed'].includes(event), 'The test email was rejected after acceptance.');
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
