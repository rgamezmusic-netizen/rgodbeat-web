import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillStripeCheckoutSession } from "@/lib/commerce/fulfillment";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

    if (!sessionId.startsWith("cs_") || sessionId.length > 255) {
      return NextResponse.json({ error: "La sesión de pago no es válida." }, { status: 400 });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "El servicio de pagos no está disponible." }, { status: 503 });
    }

    const stripeSession = await getStripe().checkout.sessions.retrieve(sessionId);
    if (stripeSession.payment_status !== "paid") {
      return NextResponse.json(
        { pending: true, message: "Stripe todavía está confirmando el pago." },
        { status: 202 }
      );
    }

    await fulfillStripeCheckoutSession(stripeSession);

    const supabase = createAdminClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        status,
        payment_status,
        total_amount,
        currency,
        purchases (
          id,
          license_tier,
          beats (title)
        )
      `)
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not load completed order: ${error.message}`);
    }

    if (!order || order.status !== "completed" || order.payment_status !== "paid") {
      return NextResponse.json(
        { pending: true, message: "Estamos terminando de preparar tu compra." },
        { status: 202 }
      );
    }

    const purchases = (order.purchases as any[] | null) || [];
    return NextResponse.json({
      orderId: order.id,
      totalAmount: Number(order.total_amount),
      currency: order.currency,
      purchases: purchases.map((purchase) => ({
        id: purchase.id,
        licenseTier: purchase.license_tier,
        beatTitle: purchase.beats?.title || "Beat",
      })),
    });
  } catch (error) {
    console.error("[Checkout Completion Error]:", error);
    return NextResponse.json(
      { error: "No pudimos verificar el estado de tu compra. Inténtalo de nuevo en unos momentos antes de volver a pagar." },
      { status: 500 }
    );
  }
}
