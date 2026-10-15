import 'server-only';
import { createHash } from 'node:crypto';
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectsCommand,
  GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getR2Client, R2_BUCKET_NAME } from '@/lib/storage/r2';
import { DELIVERY_CHUNK_BYTES, DeliveryError, validateDeliveryWav, type DeliveryFile, type StudioDelivery } from './model';

const ROOT = 'studio/deliveries/';
const INBOX = 'studio/delivery-inbox/';
export const deliveryKey = (id: string) => `${ROOT}${id}/manifest.json`;
export const deliveryFileKey = (id: string, fileId: string) => `${ROOT}${id}/files/${fileId}.wav`;
const partKey = (id: string, fileId: string, index: number) => `${ROOT}${id}/pending/${fileId}/${index}`;
const inboxKey = (delivery: StudioDelivery) => `${INBOX}${String(9_999_999_999_999 - Date.parse(delivery.createdAt)).padStart(13, '0')}-${delivery.id}.json`;
function client() {
  const value = getR2Client();
  if (!value) throw new DeliveryError('El almacenamiento de entregas no está configurado.', 503);
  return value;
}
function missing(error: unknown): boolean {
  return ['NoSuchKey', 'NotFound'].includes((error as { name?: string }).name || '');
}
export async function readDelivery(id: string): Promise<{ delivery: StudioDelivery; etag: string } | null> {
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: deliveryKey(id) }));
    if (!result.Body || !result.ETag) throw new Error('Incomplete manifest');
    return { delivery: JSON.parse(await result.Body.transformToString()) as StudioDelivery, etag: result.ETag };
  } catch (error) { if (missing(error)) return null; throw error; }
}
export async function writeDelivery(delivery: StudioDelivery, etag: string | null): Promise<void> {
  try {
    await client().send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: deliveryKey(delivery.id),
      Body: JSON.stringify(delivery), ContentType: 'application/json',
      ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }));
  } catch (error) {
    if ([409, 412].includes((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode || 0)) {
      throw new DeliveryError('La entrega está siendo actualizada. Reintenta para consultar su estado.', 409);
    }
    throw error;
  }
}

/** Persistent limit shared across server instances; only new delivery intents consume it. */
export async function reserveDeliveryQuota(userId: string): Promise<void> {
  const key = `studio/delivery-limits/${userId}/${new Date().toISOString().slice(0, 10)}.json`;
  for (let attempt = 0; attempt < 5; attempt++) {
    let count = 0, etag: string | undefined;
    try {
      const current = await client().send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
      etag = current.ETag;
      count = JSON.parse(await current.Body!.transformToString()).count;
      if (!etag || !Number.isInteger(count) || count < 0) throw new Error('Invalid quota');
    } catch (error) { if (!missing(error)) throw error; }
    if (count >= 10) throw new DeliveryError('Llegaste al límite de 10 entregas por día. Puedes reintentar una entrega ya iniciada.', 429);
    try {
      await client().send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: JSON.stringify({ count: count + 1 }),
        ContentType: 'application/json', ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }));
      return;
    } catch (error) {
      if (![409, 412].includes((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode || 0)) throw error;
    }
  }
  throw new DeliveryError('No se pudo reservar la entrega. Inténtalo de nuevo.', 409);
}

export async function stageDeliveryChunk(id: string, file: DeliveryFile, index: number, bytes: Buffer): Promise<void> {
  const parts = Math.ceil(file.bytes / DELIVERY_CHUNK_BYTES);
  const expected = Math.min(DELIVERY_CHUNK_BYTES, file.bytes - index * DELIVERY_CHUNK_BYTES);
  if (!Number.isInteger(index) || index < 0 || index >= parts || bytes.length !== expected) throw new DeliveryError('Fragmento de audio inválido.');
  await client().send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: partKey(id, file.id, index), Body: bytes, ContentType: 'application/octet-stream' }));
}
export async function deliveryFileReady(id: string, file: DeliveryFile): Promise<boolean> {
  try {
    const result = await client().send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: deliveryFileKey(id, file.id) }));
    return result.ContentLength === file.bytes && result.Metadata?.sha256 === file.sha256;
  } catch (error) { if (missing(error)) return false; throw error; }
}

/** Assemble in 6 MB groups, avoiding a full multitrack WAV allocation on the server. */
export async function finishDeliveryFile(id: string, file: DeliveryFile): Promise<void> {
  if (await deliveryFileReady(id, file)) return;
  const s3 = client(), key = deliveryFileKey(id, file.id);
  const upload = await s3.send(new CreateMultipartUploadCommand({ Bucket: R2_BUCKET_NAME, Key: key,
    ContentType: 'audio/wav', Metadata: { sha256: file.sha256 } }));
  if (!upload.UploadId) throw new Error('Missing multipart ID');
  const parts = Math.ceil(file.bytes / DELIVERY_CHUNK_BYTES), hash = createHash('sha256');
  const completed: { ETag: string; PartNumber: number }[] = [];
  try {
    for (let start = 0; start < parts; start += 3) {
      const chunks = await Promise.all(Array.from({ length: Math.min(3, parts - start) }, async (_, offset) => {
        const index = start + offset;
        try {
          const part = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: partKey(id, file.id, index) }));
          const bytes = Buffer.from(await part.Body!.transformToByteArray());
          if (bytes.length !== Math.min(DELIVERY_CHUNK_BYTES, file.bytes - index * DELIVERY_CHUNK_BYTES)) throw new DeliveryError('Un fragmento llegó incompleto. Reintenta el envío.', 422);
          return bytes;
        } catch (error) { if (missing(error)) throw new DeliveryError('Falta audio por subir. Reintenta el envío.', 409); throw error; }
      }));
      const bytes = Buffer.concat(chunks);
      if (start === 0) validateDeliveryWav(bytes.subarray(0, 56), file);
      hash.update(bytes);
      const PartNumber = completed.length + 1;
      const result = await s3.send(new UploadPartCommand({ Bucket: R2_BUCKET_NAME, Key: key, UploadId: upload.UploadId, PartNumber, Body: bytes }));
      if (!result.ETag) throw new Error('Unconfirmed part');
      completed.push({ ETag: result.ETag, PartNumber });
    }
    if (hash.digest('hex') !== file.sha256) throw new DeliveryError('La verificación del audio falló. Reintenta el envío.', 422);
    await s3.send(new CompleteMultipartUploadCommand({ Bucket: R2_BUCKET_NAME, Key: key, UploadId: upload.UploadId, MultipartUpload: { Parts: completed } }));
    if (!await deliveryFileReady(id, file)) throw new Error('Unconfirmed WAV');
  } catch (error) {
    await s3.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET_NAME, Key: key, UploadId: upload.UploadId })).catch(() => {});
    throw error;
  }
  // Remove only staging objects belonging to this confirmed file. Never touch user projects.
  await s3.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET_NAME,
    Delete: { Objects: Array.from({ length: parts }, (_, index) => ({ Key: partKey(id, file.id, index) })) } })).catch(() => {});
}

export async function indexDelivery(delivery: StudioDelivery): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: inboxKey(delivery),
    Body: JSON.stringify({ id: delivery.id }), ContentType: 'application/json' }));
}
export async function listDeliveries(cursor?: string): Promise<{ deliveries: StudioDelivery[]; cursor?: string }> {
  const page = await client().send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: INBOX, MaxKeys: 25, ContinuationToken: cursor }));
  const rows = await Promise.all((page.Contents || []).map(async item => {
    const id = item.Key?.slice(-41, -5);
    return id ? (await readDelivery(id))?.delivery : undefined;
  }));
  return { deliveries: rows.filter((row): row is StudioDelivery => Boolean(row?.receivedAt)), cursor: page.IsTruncated ? page.NextContinuationToken : undefined };
}
