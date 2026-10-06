import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { hasVerifiedEmail, linkVerifiedCommerceCustomer } from "@/lib/commerce/authorization";
import { encryptTransactionalSecret } from "@/lib/commerce/email";

export const dynamic = "force-dynamic";
const sameOrigin = (request: NextRequest) => !request.headers.get("origin") || request.headers.get("origin") === request.nextUrl.origin;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: NextRequest, context: { params: Promise<{ giftId: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ error: "Inicia sesión para administrar tus regalos." }, { status: 401 });
  const { giftId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(giftId)) return NextResponse.json({ error: "Regalo no disponible." }, { status: 404 });
  const admin = createCommerceAdminClient();
  const customerId = await linkVerifiedCommerceCustomer(admin, user);
  if (!customerId) return NextResponse.json({ error: "No se pudo validar tu cuenta." }, { status: 409 });
  const { data: gift, error: giftError } = await admin.from("beat_gifts")
    .select("id,intent_id,order_id,order_item_id,recipient_email,status,payment_status,purchase_id")
    .eq("id", giftId).maybeSingle();
  if (giftError || !gift) return NextResponse.json({ error: "Regalo no disponible." }, { status: 404 });
  const { data: order } = await admin.from("orders").select("id,customer_id,status,payment_status")
    .eq("id", gift.order_id).maybeSingle();
  if (!order || order.customer_id !== customerId || order.status !== "completed" || order.payment_status !== "paid") {
    return NextResponse.json({ error: "Regalo no disponible." }, { status: 404 });
  }
  if (!gift.recipient_email || gift.purchase_id || !["paid_pending_recipient", "ready_to_claim"].includes(gift.status) || gift.payment_status !== "paid") {
    return NextResponse.json({ error: "Este regalo ya no necesita un enlace nuevo." }, { status: 409 });
  }
  const rate = await admin.rpc("rg_consume_commerce_rate_limit", {
    p_scope: "gift_resend", p_key_hash: hash(`${user.id}:${gift.id}`), p_limit: 5, p_window_seconds: 86400,
  });
  if (rate.error) return NextResponse.json({ error: "No se pudo procesar el reenvío." }, { status: 503 });
  if (!rate.data) return NextResponse.json({ error: "Alcanzaste el límite de reenvíos por hoy." }, { status: 429 });
  const [{ data: item }, { data: intent }] = await Promise.all([
    admin.from("order_items").select("unit_price,beat_id,license_type_id,beats(title,cover_path),license_types(name,slug)").eq("id", gift.order_item_id).maybeSingle(),
    admin.from("commerce_checkout_intents").select("snapshot").eq("id", gift.intent_id).maybeSingle(),
  ]);
  const beat = Array.isArray(item?.beats) ? item.beats[0] : item?.beats;
  const license = Array.isArray(item?.license_types) ? item.license_types[0] : item?.license_types;
  const origin = intent?.snapshot?.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL;
  if (!item || !beat || !license || !origin) return NextResponse.json({ error: "No se pudo preparar el reenvío." }, { status: 503 });
  const token = randomBytes(32).toString("base64url");
  const link = new URL("/gifts/claim", origin);
  link.searchParams.set("token", token);
  const { error } = await admin.rpc("rg_prepare_gift_claim_email", {
    p_gift_id: gift.id, p_token_hash: hash(token), p_expiry: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    p_encrypted_secret: encryptTransactionalSecret(link.toString()),
    p_payload: { beatTitle: beat.title, coverPath: beat.cover_path || null, licenseName: license.name, licenseTier: license.slug },
  });
  if (error) {
    const limited = error.message.includes("rate_limited") || error.message.includes("daily_limit");
    return NextResponse.json({ error: limited ? "Espera un momento antes de volver a reenviar." : "No se pudo preparar el reenvío." }, { status: limited ? 429 : 503 });
  }
  return NextResponse.json({ queued: true }, { headers: { "Cache-Control": "no-store" } });
}
