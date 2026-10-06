import { NextRequest, NextResponse } from "next/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { guestPurchaseTokenHash } from "@/lib/commerce/authorization";

export const dynamic = "force-dynamic";
const sameOrigin = (request: NextRequest) => !request.headers.get("origin") || request.headers.get("origin") === request.nextUrl.origin;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  const body = await request.json().catch(() => null) as { token?: unknown; contextId?: unknown } | null;
  const supabase = createCommerceAdminClient();
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
