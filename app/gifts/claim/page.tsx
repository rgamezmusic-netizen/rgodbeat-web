import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/server";
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
  let alreadyClaimed = false;
  let claimedPurchaseId: string | null = null;
  let claimedBenefitKind: string | null = null;
  if (!gift) {
    const user = await getCurrentUser();
    if (user) {
      if (!hash && contextId) {
        const { data: context } = await admin.from("gift_claim_contexts").select("claim_token_hash")
          .eq("id", contextId).maybeSingle();
        hash = context?.claim_token_hash ?? null;
      }
      if (hash) {
        const { data: tokenRow } = await admin.from("gift_claim_tokens").select("gift_id")
          .eq("token_hash", hash).maybeSingle();
        if (tokenRow) {
          const { data: claimedGift } = await admin.from("beat_gifts").select("status,recipient_user_id,purchase_id,market_pass_id")
            .eq("id", tokenRow.gift_id).maybeSingle();
          if (claimedGift?.status === "claimed" && claimedGift.recipient_user_id === user.id) {
            alreadyClaimed = true;
            claimedPurchaseId = claimedGift.purchase_id;
            if (claimedGift.market_pass_id) {
              const { data: pass } = await admin.from("rg_beat_passes").select("product_key,product_version")
                .eq("id", claimedGift.market_pass_id).maybeSingle();
              if (pass) {
                const { data: product } = await admin.from("rg_market_products").select("benefit_kind")
                  .eq("product_key", pass.product_key).eq("version", pass.product_version).maybeSingle();
                claimedBenefitKind = product?.benefit_kind ?? null;
              }
            }
          }
        }
      }
    }
  }
  return <GiftClaimClient token={token} contextId={gift ? contextId : null} alreadyClaimed={alreadyClaimed}
    claimedPurchaseId={claimedPurchaseId} claimedBenefitKind={claimedBenefitKind} gift={gift ? {
    beatTitle: gift.beat_title,
    coverUrl: gift.cover_path && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rgodbeat-public/${encodeURI(gift.cover_path)}` : null,
    licenseTier: gift.license_tier,
    licenseName: gift.license_name,
  } : null} />;
}
