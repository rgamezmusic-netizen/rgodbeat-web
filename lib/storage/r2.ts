import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 Storage Client (S3-compatible)
 * 10 GB Free Storage / Month with zero egress/bandwidth costs.
 */

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
export const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim() || "rgodbeat-masters";
export const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim() || "";

export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey);
}

let s3ClientInstance: S3Client | null = null;

function resolveR2Endpoint(rawId: string): string {
  let ep = rawId.trim();
  if (!ep.startsWith("http://") && !ep.startsWith("https://")) {
    ep = `https://${ep}`;
  }
  if (!ep.includes(".r2.cloudflarestorage.com")) {
    ep = `${ep}.r2.cloudflarestorage.com`;
  }
  return ep.replace(/\/+$/, "");
}

export function getR2Client(): S3Client | null {
  if (!isR2Configured()) {
    return null;
  }

  if (!s3ClientInstance) {
    const endpoint = resolveR2Endpoint(accountId!);
    s3ClientInstance = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }

  return s3ClientInstance;
}

/**
 * Uploads a file buffer directly to Cloudflare R2.
 */
export async function uploadToR2(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  bucket?: string;
}): Promise<{ success: boolean; key: string; error?: string }> {
  const client = getR2Client();
  if (!client) {
    return {
      success: false,
      key: params.key,
      error: "Cloudflare R2 is not configured in .env.local",
    };
  }

  try {
    const bucket = params.bucket || R2_BUCKET_NAME;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    });

    await client.send(command);
    return { success: true, key: params.key };
  } catch (err: any) {
    console.error("[R2 Storage] Upload error:", err);
    return { success: false, key: params.key, error: err?.message || "Upload failed" };
  }
}

/**
 * Generates a time-limited cryptographically signed URL for authorized file downloads.
 */
export async function getR2SignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600,
  bucket?: string
): Promise<string | null> {
  const client = getR2Client();
  if (!client) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: bucket || R2_BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    console.error("[R2 Storage] Error generating signed URL:", err);
    return null;
  }
}

/**
 * Checks if an object exists in Cloudflare R2.
 */
export async function doesR2ObjectExist(key: string, bucket?: string): Promise<boolean> {
  const client = getR2Client();
  if (!client) return false;

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket || R2_BUCKET_NAME,
      Key: key,
    });
    await client.send(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes an object from Cloudflare R2.
 */
export async function deleteFromR2(key: string, bucket?: string): Promise<boolean> {
  const client = getR2Client();
  if (!client) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket || R2_BUCKET_NAME,
      Key: key,
    });
    await client.send(command);
    return true;
  } catch (err) {
    console.error("[R2 Storage] Error deleting object:", err);
    return false;
  }
}
