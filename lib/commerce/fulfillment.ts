import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutItemPayload } from "@/types/commerce";
import { LicenseTier, Beat } from "@/types";
import { generateLicenseContract } from "./contracts";
import type Stripe from "stripe";

export interface AuthoritativeLineItem {
  beatId: string;
  beatTitle: string;
  licenseTypeId: string;
  licenseTier: LicenseTier;
  licenseName: string;
  unitPrice: number;
}

export interface AuthoritativeCartResult {
  items: AuthoritativeLineItem[];
  totalAmount: number;
  currency: string;
}

/**
 * Validates cart items against Supabase and returns authoritative pricing.
 * ZERO browser trust: client prices are ignored completely.
 */
export async function resolveAuthoritativeCart(
  payloadItems: CheckoutItemPayload[]
): Promise<AuthoritativeCartResult> {
  if (!payloadItems || !Array.isArray(payloadItems) || payloadItems.length === 0) {
    throw new Error("Cart is empty or invalid.");
  }

  const supabase = createAdminClient();

  // 1. Fetch license types (excluding standalone stems)
  const { data: licenseTypes, error: ltError } = await supabase
    .from("license_types")
    .select("id, slug, name, price, active")
    .eq("active", true)
    .neq("slug", "stems");

  if (ltError || !licenseTypes || licenseTypes.length === 0) {
    throw new Error(`Failed to load authoritative license types: ${ltError?.message || "None found"}`);
  }

  const licenseMap = new Map<string, { id: string; name: string; price: number }>();
  licenseTypes.forEach((lt) => {
    licenseMap.set(lt.slug, { id: lt.id, name: lt.name, price: Number(lt.price) });
  });

  // 2. Fetch beats
  const uniqueBeatIds = Array.from(new Set(payloadItems.map((i) => i.beatId)));
  const { data: beats, error: beatsError } = await supabase
    .from("beats")
    .select(`
      id,
      title,
      published,
      beat_licenses (
        license_type_id,
        price_override,
        active,
        license_types (slug, price)
      )
    `)
    .in("id", uniqueBeatIds);

  if (beatsError) {
    throw new Error(`Failed to verify beats: ${beatsError.message}`);
  }

  const beatsMap = new Map<string, any>();
  (beats || []).forEach((b) => beatsMap.set(b.id, b));

  const items: AuthoritativeLineItem[] = [];
  let totalAmount = 0;

  for (const item of payloadItems) {
    const beat = beatsMap.get(item.beatId);
    if (!beat) {
      throw new Error(`Beat with ID '${item.beatId}' was not found in catalog.`);
    }
    if (!beat.published) {
      throw new Error(`Beat '${beat.title}' is not currently available for purchase.`);
    }

    const licenseConfig = licenseMap.get(item.licenseTier);
    if (!licenseConfig) {
      throw new Error(`License tier '${item.licenseTier}' is invalid or inactive.`);
    }

    // Check for beat-specific price override or inactive status
    let finalPrice = licenseConfig.price;
    const beatLicense = (beat.beat_licenses || []).find(
      (bl: any) => bl.license_type_id === licenseConfig.id
    );

    if (beatLicense) {
      if (beatLicense.active === false) {
        throw new Error(`The '${item.licenseTier}' license is not offered for beat '${beat.title}'.`);
      }
      if (beatLicense.price_override !== null && beatLicense.price_override !== undefined) {
        finalPrice = Number(beatLicense.price_override);
      }
    }

    // Custom exclusive offers are user-entered final prices. Standard purchases
    // use the configured license or beat-specific override without UI-only discounts.
    if (item.licenseTier === "exclusive") {
      if (item.customPrice && !isNaN(Number(item.customPrice))) {
        finalPrice = Math.max(200, Math.round(Number(item.customPrice) * 100) / 100);
      } else {
        finalPrice = Math.max(200, finalPrice);
      }
    }

    items.push({
      beatId: beat.id,
      beatTitle: beat.title,
      licenseTypeId: licenseConfig.id,
      licenseTier: item.licenseTier,
      licenseName: licenseConfig.name,
      unitPrice: finalPrice,
    });

    totalAmount += finalPrice;
  }

  return {
    items,
    totalAmount: Math.round(totalAmount * 100) / 100,
    currency: "usd",
  };
}

/**
 * Extends or activates 30 days of full studio access for a customer.
 * If the customer already has an active period, it accumulates 30 days onto the existing expiration date.
 */
export async function grantStudioCommerceAccess(supabase: any, sourceId: string, customerId: string, days = 30) {
  const grant = await supabase.rpc("rg_grant_commerce_studio_access", {
    p_source_type: "order", p_source_id: sourceId, p_customer_id: customerId, p_days: days,
  });
  if (grant.error || typeof grant.data !== "string") throw new Error("STUDIO_ENTITLEMENT_GRANT_FAILED");
  return grant.data;
}

/** Atomic legacy/admin grant; purchase fulfillment uses the source-keyed variant above. */
export async function grantStudioAccess(supabase: any, customerId: string, days = 30): Promise<string> {
  const grant = await supabase.rpc("rg_extend_studio_access", {
    p_customer_id: customerId, p_days: days,
  });
  if (grant.error || typeof grant.data !== "string") throw new Error("STUDIO_ENTITLEMENT_GRANT_FAILED");
  return grant.data;
}

/**
 * Idempotently fulfills a completed Stripe Checkout Session.
 */
export async function fulfillStripeCheckoutSession(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const sessionId = session.id;
  if (session.payment_status !== "paid") throw new Error("STRIPE_PAYMENT_NOT_VERIFIED");

  // 1. Idempotency Check: see if an order already exists
  const { data: existingOrder, error: checkError } = await supabase
    .from("orders")
    .select("id, status, payment_status")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  if (checkError) throw new Error("ORDER_IDEMPOTENCY_LOOKUP_FAILED");
  if (existingOrder && existingOrder.payment_status === "refunded") throw new Error("PAYMENT_ALREADY_REFUNDED");

  const intentId = session.metadata?.commerceIntentId;
  const isStudioPass = session.metadata?.type === "studio_pass";
  if (!intentId && !isStudioPass) {
    if (existingOrder?.status === "completed") {
      const [{ count: itemCount }, { count: purchaseCount }] = await Promise.all([
        supabase.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", existingOrder.id),
        supabase.from("purchases").select("id", { count: "exact", head: true }).eq("order_id", existingOrder.id),
      ]);
      if (itemCount && itemCount === purchaseCount) return { status: "already_fulfilled", orderId: existingOrder.id };
    }
    throw new Error("LEGACY_CHECKOUT_WITHOUT_FROZEN_SNAPSHOT_NEEDS_REVIEW");
  }
  let intent: any = null;
  let authoritativeCart: AuthoritativeCartResult | null = null;
  if (intentId) {
    const { data, error } = await (supabase as any).from("commerce_checkout_intents")
      .select("id,recipient_mode,snapshot,state,buyer_email,buyer_auth_user_id,stripe_checkout_session_id,attempt_count")
      .eq("id", intentId).maybeSingle();
    if (error || !data) throw new Error("CHECKOUT_INTENT_NOT_FOUND");
    intent = data;
    if (["refunded", "disputed"].includes(intent.state)) {
      if (existingOrder) {
        await (supabase as any).rpc("rg_revoke_commerce_order", { p_order_id: existingOrder.id, p_reason: intent.state === "refunded" ? "refund" : "dispute" });
      }
      return { status: "payment_reversed", orderId: existingOrder?.id || sessionId };
    }
    if (intent.state === "needs_review") throw new Error("PAYMENT_REQUIRES_MANUAL_REVIEW");
    if (intent.recipient_mode !== "self") throw new Error("GIFT_FULFILLMENT_REQUIRES_GIFT_HANDLER");
    const snapshot = intent.snapshot as { kind?: string; serviceId?: string; items?: AuthoritativeLineItem[]; totalAmountCents?: number; currency?: string };
    if (!Number.isInteger(snapshot?.totalAmountCents)
      || snapshot.currency?.toLowerCase() !== (session.currency || "usd").toLowerCase()
      || session.amount_total !== snapshot.totalAmountCents) throw new Error("PAYMENT_SNAPSHOT_MISMATCH");
    if (isStudioPass) {
      if (snapshot.kind !== "service" || snapshot.serviceId !== "studio_pro") throw new Error("SERVICE_SNAPSHOT_MISMATCH");
    } else {
      if (!Array.isArray(snapshot?.items) || snapshot.items.length === 0) throw new Error("PURCHASE_SNAPSHOT_MISSING_ITEMS");
      authoritativeCart = { items: snapshot.items, totalAmount: snapshot.totalAmountCents / 100, currency: snapshot.currency };
    }
    const verifiedIntent = await (supabase as any).from("commerce_checkout_intents")
      .update({ state: "fulfilling", attempt_count: Number(intent.attempt_count || 0) + 1,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        verified_paid_at: new Date().toISOString(), payment_amount_cents: session.amount_total, payment_currency: session.currency })
      .eq("id", intent.id).not("state", "in", "(refunded,disputed,needs_review)").select("id").maybeSingle();
    if (verifiedIntent.error || !verifiedIntent.data) throw new Error("CHECKOUT_INTENT_PAYMENT_STATE_FAILED");
  }

  const customerEmail = (session.customer_details?.email || intent?.buyer_email || session.metadata?.customerEmail || "").trim().toLowerCase();
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("VERIFIED_PAYER_EMAIL_UNAVAILABLE");
  const customerName = session.customer_details?.name || (session.metadata?.customerName as string) || "RGODBEAT Customer";
  const stripeCustomerId = (typeof session.customer === "string" ? session.customer : session.customer?.id) || null;
  const paymentIntentId = (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) || null;

  // Resolve the payer by normalized verified Stripe email under a database lock, preserving any guest row.
  const { data: resolvedCustomerId, error: customerResolveError } = await (supabase as any).rpc("rg_resolve_commerce_payer_customer", {
    p_email: customerEmail, p_name: customerName, p_stripe_customer_id: stripeCustomerId,
  });
  if (customerResolveError || typeof resolvedCustomerId !== "string") throw new Error("CUSTOMER_IDENTITY_RESOLUTION_FAILED");
  const customerId: string = resolvedCustomerId;

  // Handle standalone Studio Pass purchase
  if (isStudioPass) {
    let orderId: string;
    if (existingOrder) {
      if (!intentId && existingOrder.status === "completed") return { status: "already_fulfilled", orderId: existingOrder.id, customerId, type: "studio_pass" };
      orderId = existingOrder.id;
      const { error: orderUpdateError } = await supabase
        .from("orders")
        .update({
          status: "processing",
          payment_status: "paid",
          stripe_payment_intent_id: paymentIntentId,
          subtotal_amount: 10,
          total_amount: 10,
          metadata: session.metadata || {},
        })
        .eq("id", orderId);
      if (orderUpdateError) throw new Error("STUDIO_PASS_ORDER_UPDATE_FAILED");
    } else {
      const { data: newOrder, error: orderInsertError } = await supabase
        .from("orders")
        .insert({
          customer_id: customerId,
          stripe_checkout_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
          status: "processing",
          payment_status: "paid",
          currency: session.currency || "usd",
          subtotal_amount: 10,
          total_amount: 10,
          metadata: session.metadata || {},
        })
        .select("id")
        .single();
      if (orderInsertError || !newOrder) throw new Error("STUDIO_PASS_ORDER_CREATE_FAILED");
      orderId = newOrder.id;
    }

    const newExpiry = await grantStudioCommerceAccess(supabase, orderId, customerId, 30);
    if (intentId) {
      const intentCompletion = await (supabase as any).from("commerce_checkout_intents").update({
        state: "fulfilled", stripe_payment_intent_id: paymentIntentId, verified_paid_at: new Date().toISOString(),
        fulfilled_at: new Date().toISOString(), payment_amount_cents: session.amount_total, payment_currency: session.currency,
      }).eq("id", intentId).not("state", "in", "(refunded,disputed,needs_review)").select("id").maybeSingle();
      if (intentCompletion.error) throw new Error("CHECKOUT_INTENT_COMPLETION_FAILED");
      if (!intentCompletion.data) {
        const { data: currentIntent } = await (supabase as any).from("commerce_checkout_intents").select("state").eq("id", intentId).maybeSingle();
        if (currentIntent?.state === "refunded" || currentIntent?.state === "disputed") {
          await (supabase as any).rpc("rg_revoke_commerce_order", { p_order_id: orderId, p_reason: currentIntent.state === "refunded" ? "refund" : "dispute" });
          return { status: "payment_reversed", orderId };
        }
        throw new Error("CHECKOUT_INTENT_COMPLETION_FAILED");
      }
    }
    const { error: completeError } = await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
    if (completeError) throw new Error("STUDIO_PASS_COMPLETION_FAILED");
    console.log(`[Fulfillment] Studio pass (30 days) activated for ${customerEmail} until ${newExpiry}`);
    return { status: "fulfilled", orderId, customerId, type: "studio_pass" };
  }

  if (!authoritativeCart) throw new Error("FROZEN_PURCHASE_SNAPSHOT_UNAVAILABLE");

  // 4. Create or Update Order
  let orderId: string;
  if (existingOrder) {
    orderId = existingOrder.id;
    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        status: "processing",
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntentId,
        subtotal_amount: authoritativeCart.totalAmount,
        total_amount: authoritativeCart.totalAmount,
        metadata: session.metadata || {},
      })
      .eq("id", orderId);
    if (orderUpdateError) throw new Error("ORDER_PROCESSING_STATE_FAILED");
  } else {
    const { data: newOrder, error: orderInsertError } = await supabase
      .from("orders")
      .insert({
        customer_id: customerId,
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        status: "processing",
        payment_status: "paid",
        currency: session.currency || "usd",
        subtotal_amount: authoritativeCart.totalAmount,
        total_amount: authoritativeCart.totalAmount,
        metadata: session.metadata || {},
      })
      .select("id")
      .single();

    if (orderInsertError || !newOrder) {
      throw new Error(`Failed to create order record: ${orderInsertError?.message}`);
    }
    orderId = newOrder.id;
  }

  // 5. Create Order Items & Purchases / Entitlements
  const { CONTRACT_VERSIONS } = await import("./contracts");

  for (const item of authoritativeCart.items) {
    const contractVersion =
      item.licenseTier === "exclusive"
        ? CONTRACT_VERSIONS.EXCLUSIVE
        : CONTRACT_VERSIONS.NON_EXCLUSIVE;

    // Upsert Order Item
    const { data: orderItem, error: oiError } = await supabase
      .from("order_items")
      .upsert(
        {
          order_id: orderId,
          beat_id: item.beatId,
          license_type_id: item.licenseTypeId,
          unit_price: item.unitPrice,
          currency: "usd",
        },
        { onConflict: "order_id, beat_id, license_type_id" }
      )
      .select("id")
      .single();

    if (oiError || !orderItem) throw new Error(`ORDER_ITEM_FULFILLMENT_FAILED:${oiError?.code || "missing_row"}`);

    const { data: priorPurchase, error: priorPurchaseError } = await (supabase as any).from("purchases")
      .select("id,license_id,status").eq("order_item_id", orderItem.id).maybeSingle();
    if (priorPurchaseError) throw new Error("PURCHASE_IDEMPOTENCY_LOOKUP_FAILED");
    const { data: allocatedLicenseId, error: licenseIdError } = priorPurchase?.license_id
      ? { data: priorPurchase.license_id, error: null }
      : await (supabase as any).rpc("rg_allocate_commerce_license_id", { p_tier: item.licenseTier });
    if (licenseIdError || typeof allocatedLicenseId !== "string") throw new Error("LICENSE_ID_ALLOCATION_FAILED");
    const licenseId = allocatedLicenseId;

    // Generate Legal Contract Agreement from Master Template
    const contractText = generateLicenseContract({
      orderId,
      customerName,
      customerEmail,
      beatTitle: item.beatTitle,
      beatId: item.beatId,
      licenseTier: item.licenseTier,
      amountPaid: item.unitPrice,
      currency: "USD",
      licenseId,
      version: contractVersion,
    });

    // Upsert Purchase Entitlement
    const basePurchaseRow: any = {
      order_id: orderId,
      order_item_id: orderItem.id,
      customer_id: customerId,
      beat_id: item.beatId,
      license_type_id: item.licenseTypeId,
      license_tier: item.licenseTier,
      contract_text: contractText,
      status: "active",
    };

    // Attempt upsert with dedicated license_id and contract_version columns
    const { data: fulfilledPurchase, error: purchaseError } = await (supabase as any)
      .from("purchases")
      .upsert(
        {
          ...basePurchaseRow,
          license_id: licenseId,
          contract_version: contractVersion,
        },
        { onConflict: "order_id, beat_id, license_type_id" }
      ).select("id").single();
    if (purchaseError || !fulfilledPurchase) throw new Error(`PURCHASE_ENTITLEMENT_FAILED:${purchaseError?.code || "missing_row"}`);

    // If Exclusive Rights purchased: retire beat from active store catalog!
    if (item.licenseTier === "exclusive") {
      const { error: inventoryError } = await (supabase as any).from("beat_exclusive_inventory").upsert({
        beat_id: item.beatId,
        order_item_id: orderItem.id,
        order_id: orderId,
        purchase_id: fulfilledPurchase.id,
        state: "held",
        source: "verified_payment",
      }, { onConflict: "beat_id", ignoreDuplicates: true });
      if (inventoryError) {
        await supabase.from("purchases").update({ status: "revoked" }).eq("order_item_id", orderItem.id);
        throw new Error("EXCLUSIVE_INVENTORY_CONFLICT");
      }
      const { data: reserved, error: reservationCheckError } = await (supabase as any).from("beat_exclusive_inventory")
        .select("order_item_id").eq("beat_id", item.beatId).maybeSingle();
      if (reservationCheckError || reserved?.order_item_id !== orderItem.id) {
        await supabase.from("purchases").update({ status: "revoked" }).eq("order_item_id", orderItem.id);
        throw new Error("EXCLUSIVE_INVENTORY_CONFLICT");
      }
      const { error: inventoryLinkError } = await (supabase as any).from("beat_exclusive_inventory").update({ purchase_id: fulfilledPurchase.id }).eq("beat_id", item.beatId);
      if (inventoryLinkError) throw new Error("EXCLUSIVE_INVENTORY_LINK_FAILED");
      const { error: retireError } = await supabase
        .from("beats")
        .update({
          published: false,
          ranking_status: "archived",
          current_rank: null,
        })
        .eq("id", item.beatId);
      if (retireError) throw new Error("EXCLUSIVE_BEAT_RETIREMENT_FAILED");
      console.log(`[Fulfillment] Beat '${item.beatTitle}' (${item.beatId}) retired from store catalog following exclusive purchase.`);
    }
  }

  // Grant 30 days of studio access for beat purchase
  await grantStudioCommerceAccess(supabase, orderId, customerId, 30);
  const intentCompletion = await (supabase as any).from("commerce_checkout_intents")
    .update({ state: "fulfilled", stripe_payment_intent_id: paymentIntentId, verified_paid_at: new Date().toISOString(), fulfilled_at: new Date().toISOString(), payment_amount_cents: session.amount_total, payment_currency: session.currency })
    .eq("id", intentId).not("state", "in", "(refunded,disputed,needs_review)").select("id").maybeSingle();
  if (intentCompletion.error) throw new Error("CHECKOUT_INTENT_COMPLETION_FAILED");
  if (!intentCompletion.data) {
    const { data: currentIntent } = await (supabase as any).from("commerce_checkout_intents").select("state").eq("id", intentId).maybeSingle();
    if (currentIntent?.state === "refunded" || currentIntent?.state === "disputed") {
      const { error: revokeError } = await (supabase as any).rpc("rg_revoke_commerce_order", {
        p_order_id: orderId, p_reason: currentIntent.state === "refunded" ? "refund" : "dispute",
      });
      if (revokeError) throw new Error("REVERSED_ORDER_CLEANUP_FAILED");
      return { status: "payment_reversed", orderId };
    }
    throw new Error("CHECKOUT_INTENT_COMPLETION_FAILED");
  }
  const { error: completionError } = await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
  if (completionError) throw new Error("ORDER_COMPLETION_FAILED");

  console.log(`[Fulfillment] Successfully fulfilled order ${orderId} for customer ${customerEmail} (Granted 30 days Studio Access)`);
  return { status: "fulfilled", orderId, customerId };
}
