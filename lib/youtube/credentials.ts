import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { youtubeConfig } from "@/lib/youtube/config";

function keyBytes() {
  const { encryptionKey, validKey } = youtubeConfig();
  if (!encryptionKey || !validKey) throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.");
  return Buffer.from(encryptionKey, "hex");
}

export function encryptYouTubeToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptYouTubeToken(value: string): string {
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !ciphertext || iv.length !== 12 || tag.length !== 16) throw new Error("Stored YouTube credential is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function signOAuthState(value: string): string {
  return createHmac("sha256", keyBytes()).update(value).digest("base64url");
}

export function verifyOAuthState(value: string, signature: string): boolean {
  const expected = Buffer.from(signOAuthState(value));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
