import React from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

interface SuccessPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const { session_id } = await searchParams;

  if (!session_id) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-16">
        <div className="max-w-md w-full bg-[#0e0e13] border border-white/[0.08] p-8 rounded-2xl space-y-4">
          <h1 className="text-xl font-extrabold text-white">Missing Session</h1>
          <p className="text-sm text-zinc-400">No checkout session identifier was provided.</p>
          <Button href="/beats" variant="primary" size="md">
            Return to Store
          </Button>
        </div>
      </div>
    );
  }

  const supabase = createAdminClient();

  // Retrieve order by stripe_checkout_session_id
  let { data: order } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      payment_status,
      total_amount,
      currency,
      created_at,
      customers (
        name,
        email
      ),
      purchases (
        id,
        license_tier,
        status,
        contract_text,
        beats (
          id,
          title,
          slug,
          cover_path
        ),
        license_types (
          name
        )
      )
    `)
    .eq("stripe_checkout_session_id", session_id)
    .maybeSingle();

  // Resilient Fallback: If webhook was delayed or filtered in CLI, verify directly with Stripe
  if (!order && session_id && session_id.startsWith("cs_")) {
    try {
      const { getStripe, isStripeConfigured } = await import("@/lib/stripe/server");
      if (isStripeConfigured()) {
        const stripe = getStripe();
        const stripeSession = await stripe.checkout.sessions.retrieve(session_id);
        if (stripeSession && stripeSession.payment_status === "paid") {
          const { fulfillStripeCheckoutSession } = await import("@/lib/commerce/fulfillment");
          await fulfillStripeCheckoutSession(stripeSession);

          // Re-fetch order
          const { data: refetched } = await supabase
            .from("orders")
            .select(`
              id,
              status,
              payment_status,
              total_amount,
              currency,
              created_at,
              customers (
                name,
                email
              ),
              purchases (
                id,
                license_tier,
                status,
                contract_text,
                beats (
                  id,
                  title,
                  slug,
                  cover_path
                ),
                license_types (
                  name
                )
              )
            `)
            .eq("stripe_checkout_session_id", session_id)
            .maybeSingle();

          order = refetched;
        }
      }
    } catch (fallbackErr) {
      console.error("[Success Page Stripe Fallback Error]:", fallbackErr);
    }
  }

  const customer = order?.customers as any;
  const purchases = (order?.purchases as any[]) || [];

  return (
    <div className="min-h-screen bg-[#08080a] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header Confirmation Card */}
        <div className="bg-[#0e0e14] border border-emerald-500/30 rounded-2xl p-8 sm:p-10 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />
          
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-5">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            PAYMENT CONFIRMED
          </h1>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto">
            Thank you for your purchase. Your digital master license and sound assets are ready for immediate download.
          </p>

          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-zinc-400 bg-white/[0.02] border border-white/[0.06] px-4 py-2 rounded-xl">
            {order ? (
              <>
                <span>ORDER: <strong className="text-white">{order.id.slice(0, 8)}...</strong></span>
                <span>•</span>
                <span>TOTAL: <strong className="text-emerald-400">{formatCurrency(order.total_amount)}</strong></span>
                {customer?.email && (
                  <>
                    <span>•</span>
                    <span>DELIVERED TO: <strong className="text-white">{customer.email}</strong></span>
                  </>
                )}
              </>
            ) : (
              <span>SESSION ID: <strong className="text-white">{session_id.slice(0, 16)}...</strong></span>
            )}
          </div>
        </div>

        {/* Purchased Entitlements List */}
        <div className="bg-[#0e0e14] border border-white/[0.08] rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
            <h2 className="text-lg font-bold tracking-wider text-white uppercase">
              YOUR DOWNLOADABLE ASSETS
            </h2>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {purchases.length} {purchases.length === 1 ? "LICENSE" : "LICENSES"}
            </span>
          </div>

          {purchases.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-zinc-400">
                Fulfillment is finalizing in the background via Stripe Webhook.
              </p>
              <p className="text-xs text-zinc-500 font-mono">
                Refresh this page in a few moments if your assets do not appear immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {purchases.map((purchase) => {
                const beat = purchase.beats;
                const tier = purchase.license_tier;

                return (
                  <div
                    key={purchase.id}
                    className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-base">
                          {beat?.title || "Beat Master"}
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {tier}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        License: {purchase.license_types?.name || tier.toUpperCase()} • Status: Active Entitlement
                      </p>
                    </div>

                    {/* Download Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
                      {/* MP3 Download */}
                      <a
                        href={`/api/download/${purchase.id}?fileType=mp3`}
                        className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-zinc-200 transition-colors cursor-pointer"
                        download
                      >
                        ↓ MP3 AUDIO
                      </a>

                      {/* WAV Download (If WAV, Stems, Unlimited, or Exclusive) */}
                      {tier !== "mp3" && (
                        <a
                          href={`/api/download/${purchase.id}?fileType=wav`}
                          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-mono text-white font-semibold transition-colors cursor-pointer"
                          download
                        >
                          ↓ MASTER WAV
                        </a>
                      )}

                      {/* Stems Download */}
                      {(tier === "stems" || tier === "unlimited" || tier === "exclusive") && (
                        <a
                          href={`/api/download/${purchase.id}?fileType=stems`}
                          className="px-3 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-xs font-mono text-purple-200 transition-colors cursor-pointer"
                          download
                        >
                          ↓ STEMS ZIP
                        </a>
                      )}

                      {/* License Contract */}
                      <a
                        href={`/api/download/${purchase.id}?fileType=contract`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 transition-colors cursor-pointer"
                      >
                        CONTRACT ↗
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Back Link */}
        <div className="text-center pt-4">
          <Link
            href="/beats"
            className="text-xs font-mono text-zinc-400 hover:text-white transition-colors uppercase tracking-wider"
          >
            ← CONTINUE BROWSING STORE
          </Link>
        </div>
      </div>
    </div>
  );
}
