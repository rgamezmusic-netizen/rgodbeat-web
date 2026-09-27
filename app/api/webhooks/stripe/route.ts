import { NextRequest, NextResponse } from "next/server";
import { getStripe, getStripeWebhookSecret, stripeWebhookSecret, isStripeConfigured } from "@/lib/stripe/server";
import { fulfillStripeCheckoutSession } from "@/lib/commerce/fulfillment";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/webhooks/stripe",
    configured: isStripeConfigured(),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header." },
        { status: 400 }
      );
    }

    const secret = getStripeWebhookSecret();
    if (!isStripeConfigured() || !secret) {
      console.error("[Stripe Webhook Error]: Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY in environment variables.");
      return NextResponse.json(
        { error: "Stripe webhook secret is not configured in environment variables." },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    let event: Stripe.Event;

    // Cryptographic signature verification
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: any) {
      console.error("[Webhook Signature Verification Failed]:", err.message);
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${err.message}` },
        { status: 400 }
      );
    }

    console.log(`[Stripe Webhook] Received valid event: ${event.type} (${event.id})`);

    // Handle supported events
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Verify payment status
        if (session.payment_status === "paid") {
          try {
            await fulfillStripeCheckoutSession(session);
            console.log(`[Stripe Webhook] Successfully fulfilled checkout session ${session.id}`);
          } catch (fulfillmentErr: any) {
            console.error(`[Stripe Webhook] Fulfillment error on session ${session.id}:`, fulfillmentErr);
            // We acknowledge the event to avoid infinite Stripe retry storm if it was an edge case/malformed payload
          }
        } else {
          console.log(`[Stripe Webhook] Checkout session ${session.id} not marked paid (status: ${session.payment_status}).`);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Stripe Webhook] payment_intent.succeeded: ${paymentIntent.id}`);
        try {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: paymentIntent.id,
            limit: 1,
          });
          if (sessions.data.length > 0) {
            const session = sessions.data[0];
            if (session.payment_status === "paid") {
              try {
                await fulfillStripeCheckoutSession(session);
              } catch (fulfillmentErr: any) {
                console.error(`[Stripe Webhook] Fulfillment error on payment_intent ${paymentIntent.id}:`, fulfillmentErr);
              }
            }
          }
        } catch (piErr) {
          console.error("[Stripe Webhook] payment_intent handler error:", piErr);
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Stripe Webhook] Checkout session expired: ${session.id}`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type acknowledged: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[Stripe Webhook Route Error]:", err);
    return NextResponse.json(
      { error: err.message || "Webhook processing error" },
      { status: 500 }
    );
  }
}
