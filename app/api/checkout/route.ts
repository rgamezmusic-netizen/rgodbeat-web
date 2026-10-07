import { NextRequest, NextResponse } from "next/server";
import { resolveAuthoritativeCart } from "@/lib/commerce/fulfillment";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { CheckoutPayload, CheckoutResponse } from "@/types/commerce";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { canCheckoutRecipientMode } from "@/lib/commerce/gift-feature";
import { getCurrentUser } from "@/lib/auth/server";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutPayload;
    const { items, customerEmail, customerName } = body;
    const recipientMode = body.recipientMode ?? "self";
    if (recipientMode !== "self" && recipientMode !== "gift") {
      return NextResponse.json({ error: "El destinatario de la compra no es válido." }, { status: 400 });
    }
    if (!canCheckoutRecipientMode(recipientMode)) {
      return NextResponse.json({ error: "Los regalos no están disponibles por el momento." }, { status: 503 });
    }

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
    const admin = createCommerceAdminClient();
    let recipientKind: "artist" | "email" | null = null;
    let recipientArtistId: string | null = null;
    let recipientArtistSlug: string | null = null;
    let recipientEmail: string | null = null;
    let artistPublicSnapshot: { stageName: string; slug: string } | null = null;
    if (recipientMode === "gift") {
      const emailKey = Buffer.from(process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY || "", "base64");
      if (emailKey.length !== 32) {
        return NextResponse.json({ error: "Los regalos no están disponibles hasta configurar el cifrado seguro del correo." }, { status: 503 });
      }
      recipientKind = body.recipientKind ?? null;
      if (recipientKind === "email") {
        recipientEmail = (body.recipientEmail || "").trim().toLowerCase();
        if (recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
          return NextResponse.json({ error: "Escribe un correo válido para recibir el regalo." }, { status: 400 });
        }
      } else if (recipientKind === "artist") {
        recipientArtistSlug = (body.recipientArtistSlug || "").trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipientArtistSlug)) {
          return NextResponse.json({ error: "Selecciona un RG Artist activo." }, { status: 400 });
        }
        const { data: resolvedArtists, error: artistError } = await admin.rpc("rg_resolve_gift_artist", { p_slug: recipientArtistSlug });
        const resolvedArtist = Array.isArray(resolvedArtists) ? resolvedArtists[0] : null;
        if (artistError || !resolvedArtist?.artist_id || !resolvedArtist?.user_id || !resolvedArtist?.recipient_email) {
          return NextResponse.json({ error: "Ese RG Artist ya no puede recibir este regalo." }, { status: 400 });
        }
        recipientArtistId = resolvedArtist.artist_id;
        const { data: publicArtist, error: publicArtistError } = await admin.from("rg_artists")
          .select("stage_name,slug,status").eq("id", recipientArtistId).maybeSingle();
        if (publicArtistError || !publicArtist || publicArtist.status !== "active" || publicArtist.slug !== recipientArtistSlug) {
          return NextResponse.json({ error: "Ese RG Artist ya no puede recibir este regalo." }, { status: 400 });
        }
        artistPublicSnapshot = { stageName: publicArtist.stage_name, slug: publicArtist.slug };
      } else {
        return NextResponse.json({ error: "Elige RG Artist o correo electrónico." }, { status: 400 });
      }
    }
    const { data: intent, error: intentError } = await admin.from("commerce_checkout_intents").insert({
      buyer_auth_user_id: user?.id || null,
      buyer_email: payerEmail || null,
      recipient_mode: recipientMode,
      recipient_kind: recipientKind,
      recipient_email: recipientEmail,
      recipient_artist_id: recipientArtistId,
      recipient_artist_slug: recipientArtistSlug,
      snapshot: {
        version: 1,
        siteOrigin: process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin,
        recipient: recipientMode === "self" ? { mode: "self" } : recipientKind === "artist"
          ? { mode: "gift", kind: "artist", artist: artistPublicSnapshot }
          : { mode: "gift", kind: "email", recipientEmail },
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

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
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
  } catch (err: unknown) {
    console.error("[Checkout API Error]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An error occurred while creating checkout session." },
      { status: 400 }
    );
  }
}
