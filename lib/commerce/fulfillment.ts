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

    // Special: Exclusive rights custom offer support (Minimum $200 USD)
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
 * Idempotently fulfills a completed Stripe Checkout Session.
 */
export async function fulfillStripeCheckoutSession(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const sessionId = session.id;

  // 1. Idempotency Check: see if an order already exists
  const { data: existingOrder, error: checkError } = await supabase
    .from("orders")
    .select("id, status, payment_status")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  if (existingOrder && existingOrder.status === "completed") {
    console.log(`[Fulfillment] Order for session ${sessionId} is already fulfilled. Skipping to avoid duplicate.`);
    return { status: "already_fulfilled", orderId: existingOrder.id };
  }

  const customerEmail = session.customer_details?.email || (session.metadata?.customerEmail as string) || "customer@rgodbeat.com";
  const customerName = session.customer_details?.name || (session.metadata?.customerName as string) || "RGODBEAT Customer";
  const stripeCustomerId = (typeof session.customer === "string" ? session.customer : session.customer?.id) || null;
  const paymentIntentId = (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) || null;

  // 2. Resolve or Create Customer
  let customerId: string;
  const { data: customerRecord, error: custError } = await supabase
    .from("customers")
    .select("id")
    .eq("email", customerEmail)
    .maybeSingle();

  if (customerRecord) {
    customerId = customerRecord.id;
    if (stripeCustomerId) {
      await supabase
        .from("customers")
        .update({ stripe_customer_id: stripeCustomerId, name: customerName })
        .eq("id", customerId);
    }
  } else {
    const { data: newCustomer, error: createCustError } = await supabase
      .from("customers")
      .insert({
        email: customerEmail,
        name: customerName,
        stripe_customer_id: stripeCustomerId,
      })
      .select("id")
      .single();

    if (createCustError || !newCustomer) {
      throw new Error(`Failed to create customer record: ${createCustError?.message}`);
    }
    customerId = newCustomer.id;
  }

  // 3. Parse Items from Metadata or Line Items
  let lineItemsPayload: CheckoutItemPayload[] = [];
  try {
    if (session.metadata?.itemsJson) {
      lineItemsPayload = JSON.parse(session.metadata.itemsJson);
    }
  } catch (err) {
    console.error("[Fulfillment] Failed to parse itemsJson from session metadata:", err);
  }

  const authoritativeCart = await resolveAuthoritativeCart(lineItemsPayload);

  // 4. Create or Update Order
  let orderId: string;
  if (existingOrder) {
    orderId = existingOrder.id;
    await supabase
      .from("orders")
      .update({
        status: "completed",
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntentId,
        subtotal_amount: authoritativeCart.totalAmount,
        total_amount: authoritativeCart.totalAmount,
        metadata: session.metadata || {},
      })
      .eq("id", orderId);
  } else {
    const { data: newOrder, error: orderInsertError } = await supabase
      .from("orders")
      .insert({
        customer_id: customerId,
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        status: "completed",
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
  const { formatLicenseId, CONTRACT_VERSIONS } = await import("./contracts");
  const { count: existingPurchaseCount } = await supabase
    .from("purchases")
    .select("*", { count: "exact", head: true });
  const currentYear = new Date().getFullYear();
  let itemIndex = 0;

  for (const item of authoritativeCart.items) {
    itemIndex++;
    const seq = (existingPurchaseCount || 0) + itemIndex;
    const licenseId = formatLicenseId(item.licenseTier, currentYear, seq);
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

    if (oiError || !orderItem) {
      console.error(`[Fulfillment] Error creating order item for beat ${item.beatId}:`, oiError?.message);
      continue;
    }

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
    const { error: purchaseError } = await supabase
      .from("purchases")
      .upsert(
        {
          ...basePurchaseRow,
          license_id: licenseId,
          contract_version: contractVersion,
        },
        { onConflict: "order_id, beat_id, license_type_id" }
      );

    // Resilient fallback if migration hasn't been run yet on remote Supabase
    if (purchaseError) {
      if (purchaseError.code === "42703") {
        await supabase
          .from("purchases")
          .upsert(basePurchaseRow, { onConflict: "order_id, beat_id, license_type_id" });
      } else {
        console.error(`[Fulfillment] Error creating purchase entitlement for beat ${item.beatId}:`, purchaseError.message);
      }
    }

    // If Exclusive Rights purchased: retire beat from active store catalog!
    if (item.licenseTier === "exclusive") {
      await supabase
        .from("beats")
        .update({
          published: false,
          ranking_status: "archived",
          current_rank: null,
        })
        .eq("id", item.beatId);
      console.log(`[Fulfillment] Beat '${item.beatTitle}' (${item.beatId}) retired from store catalog following exclusive purchase.`);
    }
  }

  console.log(`[Fulfillment] Successfully fulfilled order ${orderId} for customer ${customerEmail}`);
  return { status: "fulfilled", orderId, customerId };
}
