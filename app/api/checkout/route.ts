import { NextRequest, NextResponse } from "next/server";
import { resolveAuthoritativeCart } from "@/lib/commerce/fulfillment";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { CheckoutPayload, CheckoutResponse } from "@/types/commerce";

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

    const origin = req.nextUrl.origin || "http://localhost:3000";

    // 2. Check if Stripe is configured
    if (!isStripeConfigured()) {
      // In development or when Stripe test key is not yet set, provide helpful message
      return NextResponse.json(
        {
          error: "STRIPE_SECRET_KEY is not configured in .env.local. Please provide your Stripe Test Mode secret key.",
          isConfigurationError: true,
          totalAmount: authoritativeCart.totalAmount,
        },
        { status: 503 }
      );
    }

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
      customer_email: customerEmail || undefined,
      client_reference_id: customerEmail || undefined,
      metadata: {
        customerEmail: customerEmail || "",
        customerName: customerName || "",
        itemsJson: JSON.stringify(items),
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
      sessionParams.return_url = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    } else {
      sessionParams.success_url = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      sessionParams.cancel_url = `${origin}/checkout/cancel`;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

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
