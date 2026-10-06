import type { Metadata } from "next";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { guestPurchaseTokenHash } from "@/lib/commerce/authorization";
import GiftClaimClient from "./GiftClaimClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reclamar regalo | RGODBEAT", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function GiftClaimPage({ searchParams }: { searchParams: Promise<{ token?: string; context?: string }> }) {
  const params = await searchParams;
  const admin = createCommerceAdminClient();
  let token = typeof params.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(params.token) ? params.token : null;
  const contextId = typeof params.context === "string" && /^[0-9a-f-]{36}$/i.test(params.context) ? params.context : null;
  let hash = token ? guestPurchaseTokenHash(token) : null;
  if (contextId) {
    const resolved = await admin.rpc("rg_resolve_gift_claim_context", { p_context_id: contextId });
    hash = !resolved.error && Array.isArray(resolved.data) && resolved.data.length === 1 ? resolved.data[0].claim_token_hash : null;
    token = null;
  }
  const preview = hash ? await admin.rpc("rg_get_gift_claim_preview", { p_token_hash: hash }) : { data: null, error: true };
  const gift = !preview.error && Array.isArray(preview.data) && preview.data.length === 1 ? preview.data[0] : null;
  return <GiftClaimClient token={token} contextId={gift ? contextId : null} gift={gift ? {
    beatTitle: gift.beat_title,
    coverUrl: gift.cover_path && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rgodbeat-public/${encodeURI(gift.cover_path)}` : null,
    licenseTier: gift.license_tier,
    licenseName: gift.license_name,
  } : null} />;
}
