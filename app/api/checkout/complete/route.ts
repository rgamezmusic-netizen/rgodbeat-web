import { NextRequest, NextResponse } from "next/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { fulfillStripeCheckoutSession } from "@/lib/commerce/fulfillment";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { guestPurchaseCookieName, guestPurchaseTokenHash, issueGuestPurchaseAccess } from "@/lib/commerce/authorization";
import { getCurrentUser } from "@/lib/auth/server";

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

    const supabase = createCommerceAdminClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        customer_id,
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

    const { data: gifts, error: giftError } = await supabase.from("beat_gifts")
      .select("id,status").eq("order_id", order.id);
    if (giftError) throw new Error("Could not load gift delivery status");
    const isGiftOrder = Array.isArray(gifts) && gifts.length > 0;
    const purchaseRows = (order.purchases as unknown as Array<{ id: string; license_tier: string; beats: { title: string } | null }> | null) || [];
    const purchases = isGiftOrder ? [] : purchaseRows;
    const giftStatus = isGiftOrder
      ? gifts.every((gift: { status: string }) => gift.status === "claimed") ? "claimed"
        : gifts.some((gift: { status: string }) => gift.status === "refunded") ? "refunded"
          : gifts.some((gift: { status: string }) => gift.status === "revoked") ? "revoked" : "ready_to_claim"
      : null;
    const response = NextResponse.json({
      orderId: order.id,
      totalAmount: Number(order.total_amount),
      currency: order.currency,
      giftStatus,
      purchases: purchases.map((purchase) => ({
        id: purchase.id,
        licenseTier: purchase.license_tier,
        beatTitle: purchase.beats?.title || "Beat",
      })),
    });
    const user = await getCurrentUser();
    if (!user && purchases.length > 0 && !isGiftOrder) {
      const cookieName = guestPurchaseCookieName(order.id);
      const currentToken = req.cookies.get(cookieName)?.value;
      let currentTokenValid = false;
      if (currentToken) {
        const { data: existingGrant } = await supabase.from("purchase_guest_access_tokens").select("id")
          .eq("order_id", order.id).eq("customer_id", order.customer_id)
          .eq("token_hash", guestPurchaseTokenHash(currentToken)).is("revoked_at", null)
          .gt("expires_at", new Date().toISOString()).maybeSingle();
        currentTokenValid = Boolean(existingGrant);
      }
      if (!currentTokenValid) {
        const grant = await issueGuestPurchaseAccess(supabase, order.id, order.customer_id);
        response.cookies.set(grant.name, grant.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          expires: new Date(grant.expiresAt),
        });
      }
    }
    return response;
  } catch (error) {
    console.error("[Checkout Completion Error]:", error);
    return NextResponse.json(
      { error: "No pudimos verificar el estado de tu compra. Inténtalo de nuevo en unos momentos antes de volver a pagar." },
      { status: 500 }
    );
  }
}
