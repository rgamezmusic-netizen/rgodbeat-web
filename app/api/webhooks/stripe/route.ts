import { NextRequest, NextResponse } from "next/server";
import { getStripe, getStripeWebhookSecret, stripeWebhookSecret, isStripeConfigured } from "@/lib/stripe/server";
import { fulfillStripeCheckoutSession } from "@/lib/commerce/fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";
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
  let verifiedEventId: string | null = null;
  let verifiedLeaseToken: string | null = null;
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
    verifiedEventId = event.id;

    const supabase = createAdminClient() as any;
    const object = event.data.object as any;
    const stripeObjectId = typeof object.id === "string" ? object.id : null;
    const { data: claimed, error: claimError } = await supabase.rpc("rg_claim_stripe_event", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_object_id: stripeObjectId,
    });
    if (claimError) throw new Error("STRIPE_EVENT_LEDGER_UNAVAILABLE");
    if (!claimed) return NextResponse.json({ received: true, duplicate: true });
    verifiedLeaseToken = claimed;

    console.log(`[Stripe Webhook] Processing verified event: ${event.type} (${event.id})`);

    // Handle supported events
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Verify payment status
        if (session.payment_status === "paid") {
          await fulfillStripeCheckoutSession(session);
          console.log(`[Stripe Webhook] Successfully fulfilled checkout session ${session.id}`);
        } else {
          console.log(`[Stripe Webhook] Checkout session ${session.id} not marked paid (status: ${session.payment_status}).`);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Stripe Webhook] payment_intent.succeeded: ${paymentIntent.id}`);
          const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent.id, limit: 2 });
          if (sessions.data.length === 1 && sessions.data[0].payment_status === "paid") {
            await fulfillStripeCheckoutSession(sessions.data[0]);
          }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Stripe Webhook] Checkout session expired: ${session.id}`);
        const intentUpdate = supabase.from("commerce_checkout_intents").update({ state: "expired" }).eq("state", "awaiting_payment");
        const { error } = session.metadata?.commerceIntentId
          ? await intentUpdate.eq("id", session.metadata.commerceIntentId)
          : await intentUpdate.eq("stripe_checkout_session_id", session.id);
        if (error) throw new Error("CHECKOUT_EXPIRATION_RECORD_FAILED");
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        if (charge.amount_refunded < charge.amount) {
          const { data: order } = paymentIntent
            ? await supabase.from("orders").select("id").eq("stripe_payment_intent_id", paymentIntent).maybeSingle()
            : { data: null };
          const { error: reviewError } = await supabase.from("commerce_manual_reviews").upsert({
            event_id: event.id, order_id: order?.id || null, reason: "partial_refund_item_mapping",
          }, { onConflict: "event_id", ignoreDuplicates: true });
          if (reviewError) throw new Error("PARTIAL_REFUND_REVIEW_RECORD_FAILED");
        } else if (paymentIntent) {
          const { data: order, error: orderError } = await supabase.from("orders").select("id").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
          if (orderError) throw new Error("REFUNDED_ORDER_LOOKUP_FAILED");
          if (order) {
            const { error: revokeError } = await supabase.rpc("rg_revoke_commerce_order", { p_order_id: order.id, p_reason: "refund" });
            if (revokeError) throw new Error("REFUND_ORDER_REVOCATION_FAILED");
          } else {
            const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 2 });
            if (sessions.data.length > 1) throw new Error("REFUND_SESSION_MAPPING_AMBIGUOUS");
            const intentId = sessions.data[0]?.metadata?.commerceIntentId;
            const intentUpdate = supabase.from("commerce_checkout_intents").update({ state: "refunded", stripe_payment_intent_id: paymentIntent });
            const { error: intentError } = intentId
              ? await intentUpdate.eq("id", intentId)
              : await intentUpdate.eq("stripe_payment_intent_id", paymentIntent);
            if (intentError) throw new Error("REFUND_INTENT_UPDATE_FAILED");
            const { error: reviewError } = await supabase.from("commerce_manual_reviews").upsert({
              event_id: event.id, reason: "refund_dispute_review",
            }, { onConflict: "event_id", ignoreDuplicates: true });
            if (reviewError) throw new Error("REFUND_REVIEW_RECORD_FAILED");
          }
        } else {
          const { error: reviewError } = await supabase.from("commerce_manual_reviews").upsert({
            event_id: event.id, reason: "refund_dispute_review",
          }, { onConflict: "event_id", ignoreDuplicates: true });
          if (reviewError) throw new Error("REFUND_REVIEW_RECORD_FAILED");
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const charge = typeof dispute.charge === "string" ? await stripe.charges.retrieve(dispute.charge) : dispute.charge;
        const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        if (!paymentIntent) throw new Error("DISPUTE_PAYMENT_INTENT_UNRESOLVED");
        const { data: order, error } = await supabase.from("orders").select("id").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
        if (error) throw new Error("DISPUTE_ORDER_LOOKUP_FAILED");
        if (order) {
          const { error: revokeError } = await supabase.rpc("rg_revoke_commerce_order", { p_order_id: order.id, p_reason: "dispute" });
          if (revokeError) throw new Error("DISPUTE_ORDER_REVOCATION_FAILED");
        } else {
          const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 2 });
          if (sessions.data.length > 1) throw new Error("DISPUTE_SESSION_MAPPING_AMBIGUOUS");
          const intentId = sessions.data[0]?.metadata?.commerceIntentId;
          const intentUpdate = supabase.from("commerce_checkout_intents").update({ state: "disputed", stripe_payment_intent_id: paymentIntent });
          const { error: intentError } = intentId
            ? await intentUpdate.eq("id", intentId)
            : await intentUpdate.eq("stripe_payment_intent_id", paymentIntent);
          if (intentError) throw new Error("DISPUTE_INTENT_UPDATE_FAILED");
        }
        const { error: reviewError } = await supabase.from("commerce_manual_reviews").upsert({ event_id: event.id, order_id: order?.id || null, reason: "refund_dispute_review" }, { onConflict: "event_id", ignoreDuplicates: true });
        if (reviewError) throw new Error("DISPUTE_REVIEW_RECORD_FAILED");
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type acknowledged: ${event.type}`);
    }

    const { error: finishError } = await supabase.rpc("rg_finish_stripe_event", {
      p_event_id: event.id, p_lease_token: verifiedLeaseToken, p_success: true, p_error_code: null,
    });
    if (finishError) throw new Error("STRIPE_EVENT_COMPLETION_UNRECORDED");
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[Stripe Webhook Route Error]:", err);
    // Fail the ledger lease so Stripe's retry can repair the incomplete work.
    if (verifiedEventId) await (createAdminClient() as any).rpc("rg_finish_stripe_event", {
      p_event_id: verifiedEventId, p_lease_token: verifiedLeaseToken, p_success: false, p_error_code: "stripe_event_processing_failed",
    }).catch(() => undefined);
    return NextResponse.json(
      { error: err.message || "Webhook processing error" },
      { status: 500 }
    );
  }
}
