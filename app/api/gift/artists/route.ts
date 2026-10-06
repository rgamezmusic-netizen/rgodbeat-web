import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 60);
  if (query.length < 2) return NextResponse.json({ artists: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip") || "unknown";
  const keyHash = createHash("sha256").update(`gift-artist-search:v1:${ip}`).digest("hex");
  const supabase = createCommerceAdminClient();
  const { data: allowed, error: rateError } = await supabase.rpc("rg_consume_commerce_rate_limit", {
    p_scope: "gift_artist_search", p_key_hash: keyHash, p_limit: 30, p_window_seconds: 60,
  });
  if (rateError) return NextResponse.json({ error: "Búsqueda no disponible." }, { status: 503 });
  if (!allowed) return NextResponse.json({ error: "Espera un momento antes de volver a buscar." }, { status: 429 });
  const { data, error } = await supabase.rpc("rg_search_gift_artists", { p_query: query });
  if (error) return NextResponse.json({ error: "No se pudo consultar RG Artists." }, { status: 503 });
  return NextResponse.json({ artists: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}
