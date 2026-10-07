import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateLicenseContract } from "./contracts";
import { encryptTransactionalSecret, enqueueTransactionalEmail, processQueuedGiftEmailImmediately } from "./email";
import type { AuthoritativeCartResult } from "./fulfillment";

type GiftIntent = {
  id: string;
  recipient_kind: "artist" | "email";
  recipient_email: string | null;
  recipient_artist_id: string | null;
  recipient_artist_slug: string | null;
  buyer_email: string | null;
  state: string;
  attempt_count: number;
  snapshot: { siteOrigin?: string };
};

export interface GiftFulfillmentInput {
  supabase: SupabaseClient;
  intent: GiftIntent;
  session: {
    id: string;
    payment_intent: string | { id: string } | null;
    amount_total: number | null;
    currency: string | null;
    customer: string | { id: string } | null;
    customer_details: { email?: string | null; name?: string | null } | null;
    metadata: Record<string, string> | null;
  };
  existingOrder: { id: string; status: string; payment_status: string } | null;
  payer: { customerId: string; email: string; name: string };
  cart: AuthoritativeCartResult;
  now?: () => Date;
};

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const message = (error: unknown) => error instanceof Error ? error.message : "GIFT_FULFILLMENT_FAILED";

async function failOnError<T extends { error: unknown }>(result: T, code: string): Promise<T> {
  if (result.error) throw new Error(code);
  return result;
}

/** Verified-payment gift fulfillment. Each step is idempotently repairable before order completion. */
export async function fulfillPaidGiftCheckout(input: GiftFulfillmentInput) {
  const { supabase, intent, session, payer, cart } = input;
  const now = input.now || (() => new Date());
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  let orderId = input.existingOrder?.id;
  if (orderId) {
    const guardedOrder = await supabase.from("orders").update({
      status: "processing", payment_status: "paid", stripe_payment_intent_id: paymentIntentId,
      subtotal_amount: cart.totalAmount, total_amount: cart.totalAmount, metadata: session.metadata || {},
    }).eq("id", orderId).not("payment_status", "in", "(refunded,disputed)").select("id").maybeSingle();
    if (guardedOrder.error || !guardedOrder.data) throw new Error("GIFT_ORDER_PROCESSING_STATE_FAILED");
  } else {
    const { data, error } = await supabase.from("orders").insert({
      customer_id: payer.customerId, stripe_checkout_session_id: session.id, stripe_payment_intent_id: paymentIntentId,
      status: "processing", payment_status: "paid", currency: session.currency || cart.currency,
      subtotal_amount: cart.totalAmount, total_amount: cart.totalAmount, metadata: session.metadata || {},
    }).select("id").single();
    if (error || !data) throw new Error("GIFT_ORDER_CREATE_FAILED");
    orderId = data.id;
  }
  if (!orderId) throw new Error("GIFT_ORDER_ID_MISSING");

  const isArtistGift = intent.recipient_kind === "artist";
  let recipientCustomerId: string | null = null;
  let recipientName = "";
  let recipientEmail = intent.recipient_email || "";
  let recipientUserId: string | null = null;
  if (isArtistGift) {
    const resolved = await supabase.rpc("rg_resolve_gift_artist", { p_slug: intent.recipient_artist_slug || "" });
    const row = Array.isArray(resolved.data) ? resolved.data[0] : null;
    if (resolved.error || !row || row.artist_id !== intent.recipient_artist_id) throw new Error("GIFT_ARTIST_NO_LONGER_ELIGIBLE");
    recipientEmail = row.recipient_email;
    recipientName = row.recipient_name;
    recipientUserId = row.user_id;
    const linked = await supabase.rpc("rg_commerce_link_verified_customer", { p_user_id: row.user_id });
    if (!linked.error && typeof linked.data === "string") recipientCustomerId = linked.data;
  }
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new Error("GIFT_RECIPIENT_EMAIL_UNRESOLVED");
  let directArtistGift = isArtistGift && Boolean(recipientCustomerId);

  for (const item of cart.items) {
    const { data: orderItem, error: itemError } = await supabase.from("order_items").upsert({
      order_id: orderId, beat_id: item.beatId, license_type_id: item.licenseTypeId,
      unit_price: item.unitPrice, currency: cart.currency,
    }, { onConflict: "order_id,beat_id,license_type_id" }).select("id").single();
    if (itemError || !orderItem) throw new Error("GIFT_ORDER_ITEM_FULFILLMENT_FAILED");

    const { data: existingGift, error: giftError } = await supabase.from("beat_gifts").select("id,status,purchase_id")
      .eq("order_item_id", orderItem.id).maybeSingle();
    if (giftError) throw new Error("GIFT_IDEMPOTENCY_LOOKUP_FAILED");
    let gift = existingGift;
    if (!gift) {
      const { data, error } = await supabase.from("beat_gifts").insert({
        intent_id: intent.id, order_id: orderId, order_item_id: orderItem.id,
        recipient_kind: intent.recipient_kind, recipient_email: recipientEmail,
        recipient_user_id: recipientUserId, recipient_artist_id: intent.recipient_artist_id,
        recipient_artist_slug: intent.recipient_artist_slug, status: "paid_pending_recipient", payment_status: "paid",
      }).select("id,status,purchase_id").single();
      if (error || !data) throw new Error("GIFT_RECORD_CREATE_FAILED");
      gift = data;
    }

    if (item.licenseTier === "exclusive") {
      const { error: reserveError } = await supabase.from("beat_exclusive_inventory").upsert({
        beat_id: item.beatId, order_item_id: orderItem.id, order_id: orderId,
        purchase_id: gift.purchase_id || null, state: "held", source: "verified_payment",
      }, { onConflict: "beat_id", ignoreDuplicates: true });
      if (reserveError) throw new Error("EXCLUSIVE_INVENTORY_REVIEW_REQUIRED");
      const { data: reserved, error: checkError } = await supabase.from("beat_exclusive_inventory")
        .select("order_item_id,state").eq("beat_id", item.beatId).maybeSingle();
      if (checkError || !reserved || reserved.order_item_id !== orderItem.id || reserved.state !== "held") {
        await supabase.from("commerce_manual_reviews").upsert({ reason: "exclusive_conflict", order_id: orderId }, { onConflict: "event_id", ignoreDuplicates: true });
        await supabase.from("commerce_checkout_intents").update({ state: "needs_review", last_error_code: "exclusive_conflict" }).eq("id", intent.id);
        await supabase.from("orders").update({ status: "failed" }).eq("id", orderId);
        return { status: "needs_review", orderId };
      }
      await failOnError(await supabase.from("beats").update({ published: false, ranking_status: "archived", current_rank: null }).eq("id", item.beatId), "EXCLUSIVE_BEAT_RETIREMENT_FAILED");
    }

    if (directArtistGift) {
      let purchaseId = gift.purchase_id as string | null;
      if (!purchaseId) {
        const allocated = await supabase.rpc("rg_allocate_commerce_license_id", { p_tier: item.licenseTier });
        if (allocated.error || typeof allocated.data !== "string") throw new Error("LICENSE_ID_ALLOCATION_FAILED");
        const version = item.licenseTier === "exclusive" ? "EX-v1.0" : "NE-v1.0";
        const contract = generateLicenseContract({
          orderId, customerName: recipientName, customerEmail: recipientEmail,
          purchaserName: payer.name, isGift: true, beatTitle: item.beatTitle, beatId: item.beatId,
          licenseTier: item.licenseTier, amountPaid: item.unitPrice, currency: "USD",
          licenseId: allocated.data, version,
        });
        const { data: purchase, error } = await supabase.from("purchases").upsert({
          order_id: orderId, order_item_id: orderItem.id, customer_id: recipientCustomerId,
          beat_id: item.beatId, license_type_id: item.licenseTypeId, license_tier: item.licenseTier,
          contract_text: contract, status: "active", license_id: allocated.data, contract_version: version,
        }, { onConflict: "order_id,beat_id,license_type_id" }).select("id").single();
        if (error || !purchase) throw new Error("GIFT_LICENSE_ASSIGNMENT_FAILED");
        purchaseId = purchase.id;
      }
      await failOnError(await supabase.from("beat_gifts").update({ status: "claimed", purchase_id: purchaseId, recipient_user_id: recipientUserId, claimed_at: now().toISOString() }).eq("id", gift.id), "GIFT_STATUS_UPDATE_FAILED");
      if (item.licenseTier === "exclusive") await failOnError(await supabase.from("beat_exclusive_inventory").update({ purchase_id: purchaseId }).eq("beat_id", item.beatId).eq("order_item_id", orderItem.id), "EXCLUSIVE_INVENTORY_LINK_FAILED");
      await enqueueTransactionalEmail(supabase, {
        sourceType: "beat_gift", sourceId: gift.id, messageType: "gift_received", recipientEmail,
        payload: { beatTitle: item.beatTitle, licenseName: item.licenseName, coverPath: null },
      });
      gift = { ...gift, status: "claimed", purchase_id: purchaseId };
    } else {
      directArtistGift = false;
      if (!gift.purchase_id) {
        const [{ data: activeTokens }, { data: mailJob }] = await Promise.all([
          supabase.from("gift_claim_tokens").select("id").eq("gift_id", gift.id).is("used_at", null).is("revoked_at", null)
            .gt("expires_at", now().toISOString()).limit(1),
          supabase.from("transactional_email_jobs").select("id,status").eq("source_type", "beat_gift")
            .eq("source_id", gift.id).eq("message_type", "gift_claim").maybeSingle(),
        ]);
        if (!(activeTokens?.length && mailJob && mailJob.status !== "failed" && mailJob.status !== "cancelled")) {
          const token = randomBytes(32).toString("base64url");
          const origin = intent.snapshot.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL;
          if (!origin) throw new Error("GIFT_CLAIM_ORIGIN_NOT_CONFIGURED");
          const claimUrl = new URL("/gifts/claim", origin);
          claimUrl.searchParams.set("token", token);
          const { data: beat } = await supabase.from("beats").select("cover_path").eq("id", item.beatId).maybeSingle();
          const { error } = await supabase.rpc("rg_prepare_gift_claim_email", {
            p_gift_id: gift.id, p_token_hash: tokenHash(token),
            p_expiry: new Date(now().getTime() + 72 * 60 * 60 * 1000).toISOString(),
            p_encrypted_secret: encryptTransactionalSecret(claimUrl.toString()),
            p_payload: { beatTitle: item.beatTitle, coverPath: beat?.cover_path || null, licenseName: item.licenseName, licenseTier: item.licenseTier },
          });
          if (error) throw new Error(error.message.includes("rate_limit") ? "GIFT_RESEND_RATE_LIMITED" : "GIFT_EMAIL_QUEUE_FAILED");
          await processQueuedGiftEmailImmediately(supabase);
        }
      }
    }
  }

  if (directArtistGift && recipientCustomerId) {
    const studio = await supabase.rpc("rg_grant_commerce_studio_access", {
      p_source_type: "gift", p_source_id: intent.id, p_customer_id: recipientCustomerId, p_days: 30,
    });
    if (studio.error) throw new Error("GIFT_STUDIO_ENTITLEMENT_FAILED");
  }
  await enqueueTransactionalEmail(supabase, {
    sourceType: "commerce_receipt", sourceId: orderId, messageType: "gift_purchase_receipt",
    recipientEmail: payer.email,
    payload: {
      beatTitle: cart.items.map((item) => item.beatTitle).join(", ").slice(0, 500),
      licenseName: cart.items.map((item) => item.licenseName).join(", ").slice(0, 500),
      amount: cart.totalAmount, currency: cart.currency,
    },
  });
  const { data: completedIntent, error: intentError } = await supabase.from("commerce_checkout_intents").update({
    state: "fulfilled", stripe_payment_intent_id: paymentIntentId, verified_paid_at: now().toISOString(),
    fulfilled_at: now().toISOString(), payment_amount_cents: session.amount_total, payment_currency: session.currency,
  }).eq("id", intent.id).not("state", "in", "(refunded,disputed,needs_review)").select("id").maybeSingle();
  if (intentError) throw new Error("GIFT_INTENT_COMPLETION_FAILED");
  if (!completedIntent) {
    const { data: currentIntent } = await supabase.from("commerce_checkout_intents").select("state").eq("id", intent.id).maybeSingle();
    if (currentIntent?.state === "refunded" || currentIntent?.state === "disputed") {
      await supabase.rpc("rg_revoke_commerce_order", { p_order_id: orderId, p_reason: currentIntent.state === "refunded" ? "refund" : "dispute" });
      throw new Error("GIFT_PAYMENT_REVERSED_DURING_FULFILLMENT");
    }
    throw new Error("GIFT_INTENT_COMPLETION_FAILED");
  }
  const { data: completedOrder, error: orderError } = await supabase.from("orders").update({ status: "completed" })
    .eq("id", orderId).eq("payment_status", "paid").select("id").maybeSingle();
  if (orderError || !completedOrder) throw new Error("GIFT_ORDER_COMPLETION_FAILED");
  return { status: "fulfilled", orderId, giftStatus: directArtistGift ? "claimed" : "ready_to_claim" };
}

export function giftErrorCode(error: unknown): string { return message(error); }
