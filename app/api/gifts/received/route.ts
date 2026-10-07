import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { hasVerifiedEmail } from "@/lib/commerce/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ gifts: [] }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const admin = createCommerceAdminClient();
  const select = `id,recipient_kind,status,created_at,recipient_email,recipient_user_id,
    orders!inner(status,payment_status),
    order_items!inner(beat_id,license_type_id,beats(title),license_types(name,slug))`;
  const email = user.email.trim().toLowerCase();
  const [emailGifts, artistGifts] = await Promise.all([
    admin.from("beat_gifts").select(select).eq("recipient_email", email).in("status", ["paid_pending_recipient", "ready_to_claim"])
      .order("created_at", { ascending: false }).limit(500),
    admin.from("beat_gifts").select(select).eq("recipient_user_id", user.id).in("status", ["paid_pending_recipient", "ready_to_claim"])
      .order("created_at", { ascending: false }).limit(500),
  ]);
  if (emailGifts.error || artistGifts.error) return NextResponse.json({ error: "No se pudieron cargar tus regalos recibidos." }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const rows = new Map<string, (typeof emailGifts.data)[number]>();
  for (const row of [...(emailGifts.data ?? []), ...(artistGifts.data ?? [])]) rows.set(row.id, row);
  const readyIds = [...rows.values()].filter(row => row.status === "ready_to_claim").map(row => row.id);
  const claimableIds = new Set<string>();
  if (readyIds.length) {
    const tokens = await admin.from("gift_claim_tokens").select("gift_id").in("gift_id", readyIds)
      .is("used_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString());
    if (tokens.error || !tokens.data) return NextResponse.json({ error: "No se pudo consultar el enlace de tus regalos." }, { status: 503 },);
    for (const token of tokens.data) claimableIds.add(token.gift_id);
  }
  const gifts = [...rows.values()].flatMap(row => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (order?.status !== "completed" || order?.payment_status !== "paid") return [];
    const item = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    const beat = Array.isArray(item?.beats) ? item.beats[0] : item?.beats;
    const license = Array.isArray(item?.license_types) ? item.license_types[0] : item?.license_types;
    return [{ giftId: row.id, title: beat?.title || "Regalo RG", license: license?.name || "Pase RG",
      licenseTier: license?.slug || "rg_pass", status: row.status, createdAt: row.created_at,
      canClaim: claimableIds.has(row.id) }];
  });
  return NextResponse.json({ gifts }, { headers: { "Cache-Control": "private, no-store" } });
}
