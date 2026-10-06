import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { serviceId } = await req.json();
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: "Debes iniciar sesión para comprar." }, { status: 401 });
    }
    
    const customerEmail = user.email;
    const customerName = user.user_metadata?.full_name || user.email?.split('@')[0];

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const stripe = getStripe();
    const origin = req.nextUrl.origin || "http://localhost:3000";

    let price = 0;
    let name = "";
    let type = "";

    if (serviceId === "studio_pro") {
      price = 10;
      name = "RGODBEAT Studio Pro (30 Días) - 50% OFF";
      type = "studio_pass";
    } else if (serviceId === "the_park") {
      price = 199;
      name = "The Park - 50% OFF";
      type = "the_park";
    } else {
      return NextResponse.json({ error: "Invalid service ID" }, { status: 400 });
    }

    const admin = createAdminClient() as any;
    const { data: intent, error: intentError } = await admin.from("commerce_checkout_intents").insert({
      buyer_auth_user_id: user.id,
      buyer_email: customerEmail,
      recipient_mode: "self",
      snapshot: { version: 1, kind: "service", serviceId, name, totalAmountCents: price * 100, currency: "usd" },
      snapshot_version: 1,
    }).select("id").single();
    if (intentError || !intent) throw new Error("CHECKOUT_INTENT_COULD_NOT_BE_SAVED");

    const sessionParams: any = {
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name,
            },
            unit_amount: price * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: customerEmail || undefined,
      metadata: {
        type,
        commerceIntentId: intent.id,
        customerEmail: customerEmail || "",
        customerName: customerName || "",
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/beats`,
    };

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: `commerce-intent:${intent.id}` });
    } catch (stripeError) {
      await admin.from("commerce_checkout_intents").update({ state: "failed", last_error_code: "stripe_session_creation_failed" }).eq("id", intent.id);
      throw stripeError;
    }
    const { error: sessionLinkError } = await admin.from("commerce_checkout_intents").update({ stripe_checkout_session_id: session.id }).eq("id", intent.id);
    if (sessionLinkError) throw new Error("CHECKOUT_SESSION_LINK_PENDING_WEBHOOK_RECOVERY");

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("[Checkout Service API Error]:", err);
    return NextResponse.json(
      { error: err.message || "An error occurred while creating checkout session." },
      { status: 400 }
    );
  }
}
