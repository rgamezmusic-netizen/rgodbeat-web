import { NextRequest, NextResponse } from "next/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { getCurrentUser } from "@/lib/auth/server";
import { guestPurchaseTokenHash, hasVerifiedEmail } from "@/lib/commerce/authorization";

export const dynamic = "force-dynamic";
const sameOrigin = (request: NextRequest) => !request.headers.get("origin") || request.headers.get("origin") === request.nextUrl.origin;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  const body = await request.json().catch(() => null) as { token?: unknown; contextId?: unknown; giftId?: unknown } | null;
  const supabase = createCommerceAdminClient();
  if (typeof body?.giftId === "string" && /^[0-9a-f-]{36}$/i.test(body.giftId)) {
    const user = await getCurrentUser();
    if (!hasVerifiedEmail(user)) return NextResponse.json({ error: "Inicia sesión con el correo verificado del destinatario." }, { status: 401 });
    const email = user.email.trim().toLowerCase();
    const { data: gift, error: giftError } = await supabase.from("beat_gifts").select(`
      id,recipient_kind,recipient_email,recipient_user_id,recipient_artist_id,status,payment_status,
      orders!inner(status,payment_status)
    `).eq("id", body.giftId).maybeSingle();
    const order = gift && (Array.isArray(gift.orders) ? gift.orders[0] : gift.orders);
    if (giftError || !gift || gift.status !== "ready_to_claim" || gift.payment_status !== "paid"
      || order?.status !== "completed" || order?.payment_status !== "paid") {
      return NextResponse.json({ error: "Este regalo todavía no está listo para reclamar." }, { status: 409 });
    }
    if (gift.recipient_kind === "email" && gift.recipient_email?.trim().toLowerCase() !== email) {
      return NextResponse.json({ error: "Este regalo fue enviado a otro correo." }, { status: 403 });
    }
    if (gift.recipient_kind === "artist") {
      const { data: artist } = await supabase.from("rg_artists").select("id,user_id,status")
        .eq("id", gift.recipient_artist_id).maybeSingle();
      if (!artist || artist.status !== "active" || artist.user_id !== user.id) {
        return NextResponse.json({ error: "Este regalo corresponde a otra cuenta de RG Artist." }, { status: 403 });
      }
    } else if (gift.recipient_kind !== "email") {
      return NextResponse.json({ error: "El destinatario del regalo no es válido." }, { status: 403 });
    }
    const { data: token, error: tokenError } = await supabase.from("gift_claim_tokens").select("token_hash")
      .eq("gift_id", gift.id).is("used_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      .order("generation", { ascending: false }).limit(1).maybeSingle();
    if (tokenError || !token) return NextResponse.json({ error: "El enlace de este regalo venció. Pide al comprador que lo reenvíe." }, { status: 410 });
    const { data, error } = await supabase.rpc("rg_create_gift_claim_context", { p_token_hash: token.token_hash });
    if (error || !Array.isArray(data) || data.length !== 1 || !data[0]?.context_id) {
      return NextResponse.json({ error: "No se pudo preparar la reclamación. Vuelve a intentarlo." }, { status: 409 });
    }
    return NextResponse.json({ contextId: data[0].context_id }, { headers: { "Cache-Control": "no-store" } });
  }
  if (typeof body?.contextId === "string" && /^[0-9a-f-]{36}$/i.test(body.contextId)) {
    const { data, error } = await supabase.rpc("rg_resolve_gift_claim_context", { p_context_id: body.contextId });
    if (!error && Array.isArray(data) && data.length === 1) return NextResponse.json({ contextId: body.contextId }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "El enlace del regalo ya no está disponible." }, { status: 410 });
  }
  if (typeof body?.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    return NextResponse.json({ error: "El enlace del regalo ya no está disponible." }, { status: 400 });
  }
  const tokenHash = guestPurchaseTokenHash(body.token);
  const { data, error } = await supabase.rpc("rg_create_gift_claim_context", { p_token_hash: tokenHash });
  if (error || !Array.isArray(data) || data.length !== 1 || !data[0]?.context_id) {
    return NextResponse.json({ error: "El enlace del regalo ya no está disponible." }, { status: 410 });
  }
  return NextResponse.json({ contextId: data[0].context_id }, { headers: { "Cache-Control": "no-store" } });
}
