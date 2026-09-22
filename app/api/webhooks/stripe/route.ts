import { NextRequest, NextResponse } from "next/server";
import { getStripe, getStripeWebhookSecret, stripeWebhookSecret, isStripeConfigured } from "@/lib/stripe/server";
import { fulfillStripeCheckoutSession } from "@/lib/commerce/fulfillment";
import type Stripe from "stripe";

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
      return NextResponse.json(
        { error: "Stripe webhook secret is not configured in .env.local." },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    let event: Stripe.Event;

    // Cryptographic signature verification
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: any) {
      console.error("[Webhook Signature Error]:", err.message);
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${err.message}` },
        { status: 400 }
      );
    }

    // Handle supported events
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Verify payment status
        if (session.payment_status === "paid") {
          await fulfillStripeCheckoutSession(session);
        } else {
          console.log(`[Webhook] Checkout session ${session.id} not marked paid (status: ${session.payment_status}).`);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Webhook] payment_intent.succeeded: ${paymentIntent.id}`);
        try {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: paymentIntent.id,
            limit: 1,
          });
          if (sessions.data.length > 0) {
            const session = sessions.data[0];
            if (session.payment_status === "paid") {
              await fulfillStripeCheckoutSession(session);
            }
          }
        } catch (piErr) {
          console.error("[Webhook payment_intent handler error]:", piErr);
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Webhook] Checkout session expired: ${session.id}`);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[Webhook Route Error]:", err);
    return NextResponse.json(
      { error: err.message || "Webhook processing error" },
      { status: 500 }
    );
  }
}
