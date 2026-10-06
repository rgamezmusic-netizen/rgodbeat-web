import { NextRequest, NextResponse } from "next/server";
import { resolveAuthoritativeCart } from "@/lib/commerce/fulfillment";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { CheckoutPayload, CheckoutResponse } from "@/types/commerce";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutPayload;
    const { items, customerEmail, customerName } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty. Please select at least one beat license." },
        { status: 400 }
      );
    }

    // 1. Authoritative Server-Side Price Calculation (Zero Browser Trust)
    const authoritativeCart = await resolveAuthoritativeCart(items);
    const uniqueLines = new Set(authoritativeCart.items.map((item) => `${item.beatId}:${item.licenseTypeId}`));
    if (uniqueLines.size !== authoritativeCart.items.length) {
      return NextResponse.json({ error: "No repitas la misma licencia para un beat." }, { status: 400 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({
        error: "STRIPE_SECRET_KEY is not configured in .env.local. Please provide your Stripe Test Mode secret key.",
        isConfigurationError: true,
        totalAmount: authoritativeCart.totalAmount,
      }, { status: 503 });
    }

    const user = await getCurrentUser();
    const payerEmail = user?.email || customerEmail || undefined;
    const payerName = user?.user_metadata?.full_name || customerName || payerEmail?.split("@")[0] || "";
    const admin = createAdminClient() as any;
    const { data: intent, error: intentError } = await admin.from("commerce_checkout_intents").insert({
      buyer_auth_user_id: user?.id || null,
      buyer_email: payerEmail || null,
      recipient_mode: "self",
      snapshot: {
        version: 1,
        items: authoritativeCart.items,
        totalAmountCents: Math.round(authoritativeCart.totalAmount * 100),
        currency: authoritativeCart.currency,
      },
      snapshot_version: 1,
    }).select("id").single();
    if (intentError || !intent) throw new Error("CHECKOUT_INTENT_COULD_NOT_BE_SAVED");

    const origin = req.nextUrl.origin || "http://localhost:3000";

    const stripe = getStripe();

    // 3. Prepare Stripe Line Items
    const line_items = authoritativeCart.items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: `${item.beatTitle} — ${item.licenseName}`,
          description: `Commercial license for beat '${item.beatTitle}' (${item.licenseTier.toUpperCase()})`,
          metadata: {
            beatId: item.beatId,
            licenseTier: item.licenseTier,
          },
        },
        unit_amount: Math.round(item.unitPrice * 100), // In cents
      },
      quantity: 1,
    }));

    // 4. Create Stripe Checkout Session (Supports Embedded in drawer or Redirect)
    const isEmbedded = body.embedded !== false;

    const sessionParams: any = {
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      customer_email: payerEmail || undefined,
      client_reference_id: intent.id,
      metadata: {
        commerceIntentId: intent.id,
        customerEmail: payerEmail || "",
        customerName: payerName,
        totalAmount: authoritativeCart.totalAmount.toString(),
        termsAccepted: "true",
        termsAcceptedAt: new Date().toISOString(),
        contractVersion: "NE-v1.0",
        governingLaw: "State of Texas, United States",
        jurisdiction: "Travis County, Texas, United States",
      },
    };

    if (isEmbedded) {
      sessionParams.ui_mode = "embedded";
      sessionParams.redirect_on_completion = "never";
    } else {
      sessionParams.success_url = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      sessionParams.cancel_url = `${origin}/checkout/cancel`;
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: `commerce-intent:${intent.id}` });
    } catch (stripeError) {
      await admin.from("commerce_checkout_intents").update({ state: "failed", last_error_code: "stripe_session_creation_failed" }).eq("id", intent.id);
      throw stripeError;
    }
    const { error: sessionLinkError } = await admin.from("commerce_checkout_intents").update({ stripe_checkout_session_id: session.id }).eq("id", intent.id);
    if (sessionLinkError) throw new Error("CHECKOUT_SESSION_LINK_PENDING_WEBHOOK_RECOVERY");

    const responseData: CheckoutResponse = {
      sessionId: session.id,
      url: session.url,
      clientSecret: session.client_secret,
      totalAmount: authoritativeCart.totalAmount,
    };

    return NextResponse.json(responseData, { status: 200 });
  } catch (err: any) {
    console.error("[Checkout API Error]:", err);
    return NextResponse.json(
      { error: err.message || "An error occurred while creating checkout session." },
      { status: 400 }
    );
  }
}
