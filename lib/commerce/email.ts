import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Database, Json } from "@/types/database";

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface TransactionalEmailProvider {
  send(message: TransactionalEmail): Promise<{ providerMessageId?: string }>;
}

/** Encrypt one-time links before they enter the durable mail queue. */
export function encryptTransactionalSecret(value: string): string {
  const configuredKey = process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  if (!configuredKey) throw new Error("TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_NOT_CONFIGURED");
  const key = Buffer.from(configuredKey, "base64");
  if (key.length !== 32) throw new Error("TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_INVALID");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${nonce.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptTransactionalSecret(envelope: string): string {
  const configuredKey = process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY;
  if (!configuredKey) throw new Error("TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_NOT_CONFIGURED");
  const key = Buffer.from(configuredKey, "base64");
  const [version, nonceText, tagText, ciphertextText] = envelope.split(":");
  if (key.length !== 32 || version !== "v1" || !nonceText || !tagText || !ciphertextText) {
    throw new Error("TRANSACTIONAL_EMAIL_ENCRYPTED_SECRET_INVALID");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonceText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

/** The adapter accepts a provider implementation; the project intentionally configures none yet. */
export function createTransactionalEmailAdapter(provider: TransactionalEmailProvider) {
  return {
    async send(message: TransactionalEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to) || !message.subject.trim()
        || !message.text.trim() || !message.html.trim()) throw new Error("INVALID_TRANSACTIONAL_EMAIL");
      return provider.send(message);
    },
  };
}

/** Durable, idempotent queue insertion only. This does not contact an email provider. */
export async function enqueueTransactionalEmail(
  supabase: SupabaseClient<Database>,
  job: { sourceType: "beat_gift" | "commerce_receipt"; sourceId: string; messageType: string; recipientEmail: string; payload?: Json; encryptedSecret?: string }
) {
  const hasSensitiveKey = (value: Json): boolean => {
    if (Array.isArray(value)) return value.some(hasSensitiveKey);
    if (value && typeof value === "object") return Object.entries(value).some(([key, nested]) =>
      /token|email|uuid|customer.?id|user.?id|order.?id|license.?id|purchase.?id/i.test(key) || hasSensitiveKey(nested ?? null));
    return false;
  };
  if (hasSensitiveKey(job.payload ?? {})) throw new Error("TRANSACTIONAL_EMAIL_PAYLOAD_CONTAINS_PRIVATE_DATA");
  if (job.messageType === "gift_claim" && !/^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/.test(job.encryptedSecret || "")) {
    throw new Error("GIFT_CLAIM_SECRET_MUST_BE_ENCRYPTED");
  }
  const { error } = await (supabase as SupabaseClient<any>).from("transactional_email_jobs").upsert({
    source_type: job.sourceType,
    source_id: job.sourceId,
    message_type: job.messageType,
    recipient_email: job.recipientEmail.trim().toLowerCase(),
    payload: job.payload ?? {},
    encrypted_secret: job.encryptedSecret || null,
  }, { onConflict: "source_type,source_id,message_type", ignoreDuplicates: true });
  if (error) throw new Error("TRANSACTIONAL_EMAIL_QUEUE_UNAVAILABLE");
}
