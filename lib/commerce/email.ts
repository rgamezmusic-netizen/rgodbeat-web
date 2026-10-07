import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Json } from "@/types/database";

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable for retries, distinct when a gift claim token is replaced. */
  idempotencyKey?: string;
}

export interface TransactionalEmailProvider {
  send(message: TransactionalEmail): Promise<{ providerMessageId?: string }>;
}

export class TransactionalEmailDeliveryError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); this.name = "TransactionalEmailDeliveryError"; }
}

/** Resend-backed production adapter. It never logs message contents or recipient data. */
export class ResendTransactionalEmailProvider implements TransactionalEmailProvider {
  async send(message: TransactionalEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) throw new TransactionalEmailDeliveryError("resend_not_configured", false);

    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        cache: "no-store",
      });
    } catch {
      throw new TransactionalEmailDeliveryError("resend_network_error", true);
    }

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      throw new TransactionalEmailDeliveryError(`resend_http_${response.status}`, retryable);
    }

    let result: { id?: unknown };
    try {
      result = await response.json() as { id?: unknown };
    } catch {
      throw new TransactionalEmailDeliveryError("resend_invalid_response", true);
    }
    if (typeof result.id !== "string" || !result.id) {
      throw new TransactionalEmailDeliveryError("resend_message_id_missing", true);
    }
    return { providerMessageId: result.id };
  }
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
  supabase: SupabaseClient,
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
  const { error } = await (supabase as unknown as SupabaseClient).from("transactional_email_jobs").upsert({
    source_type: job.sourceType,
    source_id: job.sourceId,
    message_type: job.messageType,
    recipient_email: job.recipientEmail.trim().toLowerCase(),
    payload: job.payload ?? {},
    encrypted_secret: job.encryptedSecret || null,
  }, { onConflict: "source_type,source_id,message_type", ignoreDuplicates: true });
  if (error) throw new Error("TRANSACTIONAL_EMAIL_QUEUE_UNAVAILABLE");
}

/** Processes one leased gift email. The raw claim link exists only in this worker's memory. */
export async function processNextGiftEmail(
  supabase: SupabaseClient,
  provider: TransactionalEmailProvider,
  now: () => Date = () => new Date(),
) {
  const lease = await supabase.rpc("rg_claim_transactional_email_job");
  if (lease.error) throw new Error("TRANSACTIONAL_EMAIL_LEASE_FAILED");
  const job = Array.isArray(lease.data) ? lease.data[0] : null;
  if (!job) return { status: "empty" as const };
  const finish = async (status: "sent" | "retry" | "failed", providerMessageId: string | null, errorCode: string | null, nextAttemptAt: string | null) => {
    const result = await supabase.rpc("rg_finish_transactional_email_job", {
      p_job_id: job.job_id, p_lease_token: job.lease_token, p_status: status,
      p_provider_message_id: providerMessageId, p_error_code: errorCode, p_next_attempt_at: nextAttemptAt,
    });
    if (result.error) throw new Error("TRANSACTIONAL_EMAIL_LEASE_FINISH_FAILED");
  };
  try {
    if (!job.recipient_email || !job.payload || typeof job.payload !== "object") {
      await finish("failed", null, "invalid_email_job", null);
      return { status: "failed" as const };
    }
    const payload = job.payload as Record<string, unknown>;
    const messageType = typeof job.message_type === "string" ? job.message_type : "gift_claim";
    const beatTitle = typeof payload.beatTitle === "string" ? payload.beatTitle : "tu compra";
    const licenseName = typeof payload.licenseName === "string" ? payload.licenseName : "licencia de beat";
    const claimUrl = messageType === "gift_claim" && job.encrypted_secret
      ? decryptTransactionalSecret(job.encrypted_secret) : null;
    if (messageType === "gift_claim" && !claimUrl) throw new Error("GIFT_CLAIM_SECRET_MISSING");
    if (!new Set(["gift_claim", "gift_received", "gift_purchase_receipt"]).has(messageType)) {
      throw new TransactionalEmailDeliveryError("unsupported_message_type", false);
    }
    const artwork = typeof payload.coverPath === "string" && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rgodbeat-public/${encodeURI(payload.coverPath)}` : "";
    const safeTitle = beatTitle.replace(/[<>"&]/g, "");
    const safeLicense = licenseName.replace(/[<>"&]/g, "");
    const safeArtwork = artwork.replace(/"/g, "%22");
    const isBuyerReceipt = messageType === "gift_purchase_receipt";
    const isGiftClaim = messageType === "gift_claim";
    const isUtility = payload.licenseTier === 'studio' || payload.licenseTier === 'rg_pass';
    const heading = isBuyerReceipt ? "Recibo de tu regalo" : isUtility ? 'Recibiste un pase RG' : "Recibiste un beat";
    const description = isBuyerReceipt
      ? "Tu compra fue confirmada. Puedes consultar el estado de entrega de este regalo en tu cuenta RGODBEAT."
      : isUtility ? payload.licenseTier === 'studio'
        ? isGiftClaim ? 'Recibiste 30 días de Studio. Empiezan al reclamar con tu correo verificado.' : 'Los 30 días de Studio ya están activos en tu cuenta.'
        : isGiftClaim ? 'Alguien te envió un pase RG. Reclámalo con tu correo verificado.' : 'Tu pase RG ya está disponible en tu cuenta.'
        : isGiftClaim ? "Alguien te envió una licencia de beat por RGODBEAT." : 'La licencia de regalo ya está disponible en tu cuenta.';
    const amount = typeof payload.amount === "number" && Number.isFinite(payload.amount) ? payload.amount : null;
    const currency = typeof payload.currency === "string" ? payload.currency.toUpperCase() : "USD";
    const total = isBuyerReceipt && amount !== null ? ` Total: ${amount.toFixed(2)} ${currency}.` : "";
    const action = isGiftClaim && claimUrl ? `<p><a href="${claimUrl}">RECLAMAR REGALO</a></p>` : "";
    const result = await provider.send({
      to: job.recipient_email, subject: isBuyerReceipt ? "Recibo de tu regalo en RGODBEAT" : isUtility ? 'Recibiste un pase RG en RGODBEAT' : "Recibiste un beat en RGODBEAT",
      text: `${description} ${safeTitle} · ${safeLicense}.${total}${claimUrl ? ` Reclama tu regalo: ${claimUrl}` : ""}`,
      html: `<main><h1>${heading}</h1>${safeArtwork ? `<img alt="Portada de ${safeTitle}" src="${safeArtwork}" width="240">` : ""}<h2>${safeTitle}</h2><p>${safeLicense}</p><p>${description}</p>${total ? `<p>${total.trim()}</p>` : ""}${action}</main>`,
      idempotencyKey: createHash("sha256")
        .update(`${job.job_id}:${typeof job.encrypted_secret === "string" ? job.encrypted_secret : ""}`)
        .digest("hex"),
    });
    await finish("sent", result.providerMessageId || null, null, null);
    return { status: "sent" as const };
  } catch (error) {
    const attempts = Number(job.attempt || 1);
    const retryable = !(error instanceof TransactionalEmailDeliveryError) || error.retryable;
    const status = retryable && attempts < 8 ? "retry" : "failed";
    const delaySeconds = Math.min(3600, 30 * 2 ** Math.min(attempts - 1, 7));
    await finish(status, null, error instanceof TransactionalEmailDeliveryError && !error.retryable ? "provider_rejected" : "provider_temporary_failure",
      status === "retry" ? new Date(now().getTime() + delaySeconds * 1000).toISOString() : null);
    return { status };
  }
}

/** Best-effort inline delivery after a durable gift job is queued. Queue state remains authoritative. */
export async function processQueuedGiftEmailImmediately(supabase: SupabaseClient) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { status: "queued" as const };
  try {
    return await processNextGiftEmail(supabase, new ResendTransactionalEmailProvider());
  } catch {
    // The job was committed before this call; a failed lease/finish operation is recovered by the fallback worker.
    return { status: "queued" as const };
  }
}
