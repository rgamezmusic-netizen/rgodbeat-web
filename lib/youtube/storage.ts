import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function getYouTubeR2Bucket() {
  return process.env.CLOUDFLARE_R2_YOUTUBE_BUCKET_NAME?.trim() || "";
}

let clientInstance: S3Client | null = null;
export function getYouTubeR2Client() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_YOUTUBE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_YOUTUBE_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !getYouTubeR2Bucket()) return null;
  if (!clientInstance) {
    const endpoint = accountId.startsWith("http") ? accountId : `https://${accountId}.r2.cloudflarestorage.com`;
    clientInstance = new S3Client({ endpoint, region: "auto", credentials: { accessKeyId, secretAccessKey } });
  }
  return clientInstance;
}

export function isYouTubeR2Configured() {
  return Boolean(getYouTubeR2Client());
}

export async function readYouTubeR2(key: string): Promise<Buffer | null> {
  const client = getYouTubeR2Client();
  const bucket = getYouTubeR2Bucket();
  if (!client || !bucket) throw new Error("Private YouTube R2 bucket is not configured.");
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) return null;
    return Buffer.from(await result.Body.transformToByteArray());
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function headYouTubeR2(key: string): Promise<number | null> {
  const client = getYouTubeR2Client();
  const bucket = getYouTubeR2Bucket();
  if (!client || !bucket) throw new Error("Private YouTube R2 bucket is not configured.");
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return result.ContentLength ?? null;
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function putYouTubeR2(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  const client = getYouTubeR2Client();
  const bucket = getYouTubeR2Bucket();
  if (!client || !bucket) throw new Error("Private YouTube R2 bucket is not configured.");
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function clearYouTubeR2(prefix: string): Promise<boolean> {
  const client = getYouTubeR2Client();
  const bucket = getYouTubeR2Bucket();
  if (!client || !bucket) return false;
  let token: string | undefined;
  try {
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const objects = (page.Contents || []).flatMap((object) => object.Key ? [{ Key: object.Key }] : []);
      if (objects.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return true;
  } catch {
    return false;
  }
}

/** Writes, reads, and removes a tiny private object to verify the YouTube bucket permissions. */
export async function verifyYouTubeR2Connection(): Promise<void> {
  const bucket = getYouTubeR2Bucket();
  if (bucket !== "rgodbeat-youtube-temp") throw new Error("bucketMismatch");
  const key = `youtube/connection-check/${randomUUID()}/check.txt`;
  const expected = Buffer.from(`RGODBEAT R2 check ${randomUUID()}`);
  let uploaded = false;
  let cleanupOk = false;
  try {
    await putYouTubeR2(key, expected, "text/plain");
    uploaded = true;
    const length = await headYouTubeR2(key);
    if (length !== expected.length) throw new Error("objectCheckFailed");
    const actual = await readYouTubeR2(key);
    if (!actual?.equals(expected)) throw new Error("objectCheckFailed");
  } finally {
    cleanupOk = await clearYouTubeR2(key.slice(0, key.lastIndexOf("/") + 1));
  }
  if (!uploaded || !cleanupOk) throw new Error("cleanupFailed");
}
