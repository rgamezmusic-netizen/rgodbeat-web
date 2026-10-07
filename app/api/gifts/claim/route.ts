import { NextRequest, NextResponse } from "next/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { getCurrentUser } from "@/lib/auth/server";
import { hasVerifiedEmail, guestPurchaseTokenHash, linkVerifiedCommerceCustomer } from "@/lib/commerce/authorization";
import { generateLicenseContract } from "@/lib/commerce/contracts";

export const dynamic = "force-dynamic";
const sameOrigin = (request: NextRequest) => !request.headers.get("origin") || request.headers.get("origin") === request.nextUrl.origin;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ error: "Inicia sesión con el correo verificado del destinatario." }, { status: 401 });
  const body = await request.json().catch(() => null) as { token?: unknown; contextId?: unknown } | null;
  const admin = createCommerceAdminClient();
  let claimHash: string | null = null;
  if (typeof body?.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    claimHash = guestPurchaseTokenHash(body.token);
  } else if (typeof body?.contextId === "string" && /^[0-9a-f-]{36}$/i.test(body.contextId)) {
    const { data, error } = await admin.rpc("rg_resolve_gift_claim_context", { p_context_id: body.contextId });
    if (!error && Array.isArray(data) && data.length === 1) claimHash = data[0].claim_token_hash;
  }
  if (!claimHash) return NextResponse.json({ error: "Este regalo ya no puede reclamarse. Solicita un enlace nuevo al comprador." }, { status: 410 });

  const { data: tokenRow, error: tokenError } = await admin.from("gift_claim_tokens")
    .select("gift_id,used_at,revoked_at,expires_at").eq("token_hash", claimHash).maybeSingle();
  if (tokenError || !tokenRow) return NextResponse.json({ error: "Este regalo ya no puede reclamarse. Solicita un enlace nuevo al comprador." }, { status: 410 });
  const { data: gift, error: giftError } = await admin.from("beat_gifts").select(`
    id,recipient_kind,recipient_email,recipient_artist_id,recipient_user_id,status,payment_status,purchase_id,intent_id,
    order_id,order_item_id,orders!inner(status,payment_status,total_amount,currency,customers(name)),
    order_items!inner(unit_price,beat_id,license_type_id,beats(title),license_types(slug))
  `).eq("id", tokenRow.gift_id).maybeSingle();
  const order = gift && (Array.isArray(gift.orders) ? gift.orders[0] : gift.orders);
  if (giftError || !gift) {
    return NextResponse.json({ error: "Este regalo no está disponible para esta cuenta." }, { status: 403 });
  }
  // Production may not have the later RG Market gift columns yet. Read the
  // optional link separately so a standard Gift V1 beat license still claims.
  const { data: marketLink, error: marketLinkError } = await admin.from("beat_gifts")
    .select("market_pass_id").eq("id", gift.id).maybeSingle();
  let marketPassId: string | null = null;
  if (!marketLinkError) {
    marketPassId = marketLink?.market_pass_id ?? null;
  } else if (marketLinkError.code !== "42703" && marketLinkError.code !== "PGRST204") {
    return NextResponse.json({ error: "No pudimos validar el beneficio del regalo." }, { status: 503 });
  }
  // A double submit or a reopened email link must report an existing claim,
  // never attempt to grant the same license/pass again.
  if (gift.status === "claimed") {
    if (gift.recipient_user_id !== user.id) return NextResponse.json({ error: "Este regalo ya fue reclamado desde otra cuenta." }, { status: 403 });
    if (marketPassId) {
      const { data: pass } = await admin.from("rg_beat_passes").select("product_key,product_version")
        .eq("id", marketPassId).maybeSingle();
      if (!pass) return NextResponse.json({ error: "El regalo figura reclamado, pero no pudimos localizar el pase en tu wallet." }, { status: 409 });
      const { data: product } = await admin.from("rg_market_products").select("benefit_kind")
        .eq("product_key", pass.product_key).eq("version", pass.product_version).maybeSingle();
      return NextResponse.json({ claimed: true, benefitKind: product?.benefit_kind === "studio" ? "studio" : "rg_pass" },
        { headers: { "Cache-Control": "no-store" } });
    }
    if (!gift.purchase_id) return NextResponse.json({ error: "El regalo figura reclamado, pero no encontramos su licencia." }, { status: 409 });
    return NextResponse.json({ claimed: true, purchaseId: gift.purchase_id }, { headers: { "Cache-Control": "no-store" } });
  }
  if (tokenRow.used_at || tokenRow.revoked_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "El enlace venció o ya se utilizó. Si el regalo sigue pendiente, pide al comprador que lo reenvíe." }, { status: 410 });
  }
  if (gift.status !== "ready_to_claim") {
    return NextResponse.json({ error: "El regalo todavía no está listo para reclamarse. Espera a que termine la confirmación del pago." }, { status: 409 });
  }
  if (gift.payment_status !== "paid" || order?.status !== "completed" || order?.payment_status !== "paid") {
    return NextResponse.json({ error: "El pago del regalo todavía se está confirmando. Vuelve a intentarlo en un momento." }, { status: 409 });
  }
  // Email gifts are bound to the verified email address. The Auth UUID can
  // change if the account was recreated or relinked while keeping that email.
  if (gift.recipient_kind === "email"
    && gift.recipient_email?.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "Este regalo fue enviado a otro correo. Inicia sesión con el correo verificado del destinatario." }, { status: 403 });
  }
  if (gift.recipient_kind === "artist") {
    const { data: artist } = await admin.from("rg_artists").select("id,user_id,status")
      .eq("id", gift.recipient_artist_id).maybeSingle();
    if (!artist || artist.status !== "active" || artist.user_id !== user.id) {
      return NextResponse.json({ error: "Este regalo no está disponible para esta cuenta." }, { status: 403 });
    }
  } else if (gift.recipient_kind !== "email") {
    return NextResponse.json({ error: "El destinatario del regalo no es válido." }, { status: 403 });
  }

  const customerId = await linkVerifiedCommerceCustomer(admin, user);
  if (!customerId) return NextResponse.json({ error: "No pudimos validar la cuenta para completar el regalo." }, { status: 409 });
  if (marketPassId) {
    const claim = await admin.rpc('rg_claim_beat_gift', { p_token_hash: claimHash, p_user_id: user.id, p_customer_id: customerId,
      p_license_id: null, p_contract_text: null });
    if (claim.error || !Array.isArray(claim.data) || claim.data.length !== 1) {
      const databaseMessage = claim.error?.message || "";
      const message = databaseMessage.includes("gift_not_claimable_for_account")
        ? "No se pudo validar el destinatario. Inicia sesión con el correo verificado al que enviaron el regalo."
        : databaseMessage.includes("gift_token_invalid_expired_or_used")
          ? "El enlace venció o ya se utilizó. Si el regalo sigue pendiente, pide que lo reenvíen."
          : "El regalo cambió de estado o ya fue reclamado. Actualiza la página.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ claimed: true, benefitKind: claim.data[0].license_tier,
      studioAccessUntil: claim.data[0].studio_access_until }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const line = Array.isArray(gift.order_items) ? gift.order_items[0] : gift.order_items;
  const beat = Array.isArray(line?.beats) ? line.beats[0] : line?.beats;
  const license = Array.isArray(line?.license_types) ? line.license_types[0] : line?.license_types;
  const orderCustomer = Array.isArray(order?.customers) ? order.customers[0] : order?.customers;
  if (!line || !beat || !license) return NextResponse.json({ error: "No pudimos cargar los datos de la licencia." }, { status: 409 });
  const allocated = await admin.rpc("rg_allocate_commerce_license_id", { p_tier: license.slug });
  if (allocated.error || typeof allocated.data !== "string") return NextResponse.json({ error: "No pudimos preparar la licencia." }, { status: 503 });
  const recipientName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email.split("@")[0];
  const contractVersion = license.slug === "exclusive" ? "EX-v1.0" : "NE-v1.0";
  const contract = generateLicenseContract({
    orderId: gift.order_id, customerName: recipientName, customerEmail: user.email,
    purchaserName: orderCustomer?.name || "RGODBEAT Customer", isGift: true,
    beatTitle: beat.title, beatId: line.beat_id, licenseTier: license.slug,
    amountPaid: Number(line.unit_price), currency: order.currency || "USD",
    licenseId: allocated.data, version: contractVersion,
  });
  const { data: result, error: claimError } = await admin.rpc("rg_claim_beat_gift", {
    p_token_hash: claimHash, p_user_id: user.id, p_customer_id: customerId,
    p_license_id: allocated.data, p_contract_text: contract,
  });
  if (claimError || !Array.isArray(result) || result.length !== 1) {
    const databaseMessage = claimError?.message || "";
    const message = databaseMessage.includes("gift_not_claimable_for_account")
      ? "No se pudo validar el destinatario. Inicia sesión con el correo verificado al que enviaron el regalo."
      : databaseMessage.includes("gift_token_invalid_expired_or_used")
        ? "El enlace venció o ya se utilizó. Si el regalo sigue pendiente, pide que lo reenvíen."
        : databaseMessage.includes("gift_payment_not_verified_or_reversed")
          ? "El pago del regalo aún no está confirmado o fue revertido."
          : "El regalo cambió de estado o ya fue reclamado. Actualiza esta página.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return NextResponse.json({ claimed: true, purchaseId: result[0].purchase_id, beatTitle: beat.title, licenseTier: result[0].license_tier }, { headers: { "Cache-Control": "no-store" } });
}
