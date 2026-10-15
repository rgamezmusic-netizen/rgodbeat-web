import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadSource } from '../tests/helpers/rg-fixtures.mjs';

if (process.env.STUDIO_DELIVERIES_LIVE_TEST !== 'true') throw new Error('Set STUDIO_DELIVERIES_LIVE_TEST=true to run the isolated R2 transport test.');
const storage = loadSource('lib/studio/deliveries/storage.ts');
const { getR2Client, R2_BUCKET_NAME } = loadSource('lib/storage/r2.ts');
const { audioBufferToWav } = loadSource('lib/studio/audio/wavEncoder.ts');
const { DELIVERY_CHUNK_BYTES } = loadSource('lib/studio/deliveries/model.ts');
const client = getR2Client();
assert(client, 'R2 must be configured');
const id = randomUUID(), fileId = randomUUID(), prefix = `studio/deliveries/${id}/`;
const samples = new Float32Array(1_600_000).fill(0.125);
const blob = audioBufferToWav({ numberOfChannels: 1, sampleRate: 48000, length: samples.length, getChannelData: () => samples }, 32);
const bytes = Buffer.from(await blob.arrayBuffer());
const file = { id: fileId, trackId: 'transport-test', name: 'Isolated transport verification', filename: 'transport-verification.wav',
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sampleRate: 48000, channels: 1,
  durationSeconds: samples.length / 48000, tuning: { rootKey: 'C', scaleMode: 'chromatic' } };
try {
  // No inbox record, email, artist project or quota is created by this test.
  for (let offset = 0; offset < bytes.length; offset += DELIVERY_CHUNK_BYTES) {
    await storage.stageDeliveryChunk(id, file, offset / DELIVERY_CHUNK_BYTES, bytes.subarray(offset, offset + DELIVERY_CHUNK_BYTES));
  }
  await storage.finishDeliveryFile(id, file);
  assert(await storage.deliveryFileReady(id, file));
  const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: storage.deliveryFileKey(id, fileId), ResponseContentDisposition: 'attachment; filename="transport-verification.wav"' });
  const result = await client.send(command);
  assert.deepEqual(Buffer.from(await result.Body.transformToByteArray()), bytes);
  const signed = await getSignedUrl(client, command, { expiresIn: 60 });
  const download = await fetch(signed, { signal: AbortSignal.timeout(15000) });
  assert.equal(download.status, 200);
  assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'), file.sha256);
  const unsigned = new URL(signed); unsigned.search = '';
  const anonymous = await fetch(unsigned, { signal: AbortSignal.timeout(15000) });
  assert(anonymous.status >= 400, 'Unsigned S3 access must be rejected');
  console.log('R2 delivery transport passed: 6.4 MB float WAV, multipart assembly, SHA-256, signed download, unsigned access rejected.');
} finally {
  let cursor;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: prefix, ContinuationToken: cursor }));
    const Objects = (page.Contents || []).map(item => ({ Key: item.Key }));
    if (Objects.length) {
      const removed = await client.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET_NAME, Delete: { Objects } }));
      assert(!removed.Errors?.length, 'Isolated test objects must be removed');
    }
    cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (cursor);
  console.log('Isolated R2 test objects removed.');
}
