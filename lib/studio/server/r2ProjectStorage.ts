import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getR2Client, R2_BUCKET_NAME, deleteFromR2 } from '@/lib/storage/r2';
import { ProjectConflict, type ProjectStorage } from './projectRepository';
import { decodeProjectManifest } from './projectManifest';

export const r2ProjectStorage: ProjectStorage = {
  async read(key) {
    const client = getR2Client();
    if (!client) throw new Error('El respaldo de cuenta no está configurado.');
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }), { abortSignal: AbortSignal.timeout(20000) });
      if (!result.Body || !result.ETag) throw new Error('Respuesta de almacenamiento incompleta.');
      return { body: Buffer.from(await result.Body.transformToByteArray()), etag: result.ETag };
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return { body: null, etag: null };
      throw error;
    }
  },
  async put(key, body, contentType, expected) {
    const client = getR2Client();
    if (!client) throw new Error('El respaldo de cuenta no está configurado.');
    try {
      const result = await client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType,
        ...(expected === undefined ? {} : expected === null ? { IfNoneMatch: '*' } : { IfMatch: expected }),
      }), { abortSignal: AbortSignal.timeout(120000) });
      if (!result.ETag) throw new Error('No se recibió confirmación del respaldo.');
      return result.ETag;
    } catch (error) {
      if ([409, 412].includes((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0)) {
        throw new ProjectConflict('El proyecto cambió en otra sesión. Tu copia local se conserva.');
      }
      throw error;
    }
  },
  remove: deleteFromR2,
  async hasStaged(key, hash) {
    const client = getR2Client();
    if (!client) return false;
    try {
      const object = await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
      return object.Metadata?.sha256 === hash && Boolean(object.ContentLength);
    } catch { return false; }
  },
  async collect(prefix) {
    const client = getR2Client();
    if (!client) return false;
    // Recover abandoned uploads from terminated requests. The grace period excludes in-flight writes.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let token: string | undefined;
    let success = true;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: prefix, ContinuationToken: token }));
      const [stored, previousStored] = await Promise.all([
        r2ProjectStorage.read(`${prefix}project.json`),
        r2ProjectStorage.read(`${prefix}previous-project.json`),
      ]);
      const decoded = [stored, previousStored].map(result => decodeProjectManifest(result.body));
      // Retain unindexed audio while either manifest is damaged; never guess what
      // may still be recoverable from it during automatic garbage collection.
      if (decoded.some(result => result.damaged)) return false;
      const projects = decoded.map(result => result.project ?? {});
      const live = new Set<string>(projects.flatMap(project => [project.beat?.customBeatKey,
        ...(project.tracks ?? []).flatMap((track: { clips?: { storageKey?: string }[] }) => (track.clips ?? []).map((clip: { storageKey?: string }) => clip.storageKey))]).filter((key): key is string => Boolean(key)));
      for (const object of page.Contents ?? []) {
        if (!object.Key || object.Key === `${prefix}project.json` || object.Key === `${prefix}previous-project.json` || live.has(object.Key)) continue;
        if (object.LastModified && object.LastModified.getTime() < cutoff) {
          success = await deleteFromR2(object.Key) && success;
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return success;
  },
};
