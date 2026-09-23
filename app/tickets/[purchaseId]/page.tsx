import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency } from "@/lib/utils";
import { PrintTicketButton } from "@/components/tickets/PrintTicketButton";

export const dynamic = "force-dynamic";

interface TicketPageProps {
  params: Promise<{ purchaseId: string }>;
}

export default async function LicenseTicketPage({ params }: TicketPageProps) {
  const { purchaseId } = await params;

  if (!purchaseId) {
    notFound();
  }

  const supabase = createAdminClient();

  // Fetch purchase details with order and beat info
  const { data: purchase, error } = await supabase
    .from("purchases")
    .select(`
      id,
      license_tier,
      contract_text,
      status,
      created_at,
      orders (
        id,
        total_amount,
        currency,
        created_at,
        stripe_payment_intent_id
      ),
      order_items (
        unit_price
      ),
      customers (
        name,
        email
      ),
      beats (
        id,
        title,
        slug,
        bpm,
        musical_key,
        cover_path
      ),
      license_types (
        name,
        slug,
        price
      )
    `)
    .eq("id", purchaseId)
    .maybeSingle();

  if (error || !purchase) {
    notFound();
  }

  const beat = purchase.beats as any;
  const customer = purchase.customers as any;
  const order = purchase.orders as any;
  const orderItem = purchase.order_items as any;
  const licenseType = purchase.license_types as any;

  const tier = purchase.license_tier;
  const isPremium = ["stems", "unlimited", "exclusive"].includes(tier);

  // Determine actual paid amount
  const paidAmount = orderItem?.unit_price || order?.total_amount || licenseType?.price || 0;

  // Concept / Explanation of what they paid for
  let conceptTitle = "Licencia Oficial de Producción Musical";
  let conceptExplanation = "";

  if (tier === "exclusive") {
    conceptTitle = "DERECHOS EXCLUSIVOS (EXCLUSIVE)";
    conceptExplanation =
      "Licencia con derechos exclusivos sobre la obra que incluye MP3, WAV Master de estudio, acceso a stems agrupados bajo solicitud y retiro permanente del catálogo público. Sujeta a los términos del Contrato Oficial de Licencia RGODBEAT.";
  } else if (tier === "unlimited") {
    conceptTitle = "LICENCIA ILIMITADA (UNLIMITED)";
    conceptExplanation =
      "Licencia no exclusiva que incluye MP3, WAV Master y acceso a stems agrupados bajo solicitud. Sujeta a los términos del Contrato Oficial de Licencia RGODBEAT.";
  } else if (tier === "wav") {
    conceptTitle = "LICENCIA PREMIUM WAV";
    conceptExplanation =
      "Licencia no exclusiva que incluye archivo MP3 320 kbps y WAV Master sin comprimir de 24-bit / 48 kHz. Sujeta a los términos del Contrato Oficial de Licencia RGODBEAT.";
  } else {
    conceptTitle = "LICENCIA OFICIAL MP3";
    conceptExplanation =
      "Licencia no exclusiva que incluye archivo de audio MP3 a 320 kbps. Sujeta a los términos del Contrato Oficial de Licencia RGODBEAT.";
  }

  const { extractLicenseMetadata } = await import("@/lib/commerce/contracts");
  const { licenseId, contractVersion } = extractLicenseMetadata(purchase);
  const ticketFolio = licenseId;
  const purchaseDate = new Date(purchase.created_at).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-[#070709] text-white pt-24 pb-20 px-4 sm:px-6 selection:bg-purple-500/30 selection:text-white">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400 print:hidden">
          <Link href="/account" className="hover:text-white transition-colors flex items-center gap-1.5">
            <span>←</span>
            <span>VOLVER A MI CUENTA</span>
          </Link>
          <PrintTicketButton />
        </div>

        {/* Physical-Style Ticket Card */}
        <div
          id="official-ticket-card"
          className="rounded-3xl bg-[#0e0e14] border border-white/[0.12] shadow-2xl p-6 sm:p-9 relative overflow-hidden space-y-7"
        >
          {/* Top Brand Watermark */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Ticket Header */}
          <div className="flex items-start justify-between border-b border-white/[0.08] pb-6 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono tracking-[0.25em] text-purple-400 uppercase font-bold">
                  RGODBEAT OFFICIAL RECEIPT
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white uppercase font-sans">
                {isPremium ? "Ticket de Licencia Premium" : "Comprobante de Licencia"}
              </h1>
              <p className="text-xs font-mono text-zinc-400">
                Folio: <span className="text-white font-bold">{ticketFolio}</span>
              </p>
            </div>

            <div className="text-right shrink-0">
              <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold uppercase tracking-wider block">
                PAGO VERIFICADO
              </span>
              <span className="text-[10px] font-mono text-zinc-500 block mt-1">
                {purchaseDate}
              </span>
            </div>
          </div>

          {/* Beat Information */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
              {beat?.cover_path ? (
                <img
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rgodbeat-public/${beat.cover_path}`}
                  alt={beat.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl">🎵</span>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest block">
                OBRA LICENCIADA
              </span>
              <h2 className="text-base font-bold text-white uppercase tracking-tight">
                {beat?.title || "Beat"}
              </h2>
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                {beat?.bpm && <span>{beat.bpm} BPM</span>}
                {beat?.musical_key && <span>• {beat.musical_key}</span>}
              </div>
            </div>
          </div>

          {/* Amount Paid Highlight */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-950/30 via-white/[0.02] to-transparent border border-purple-500/20 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">
                MONTO PAGADO
              </span>
              <span className="text-xs text-zinc-300 font-mono">
                {tier === "exclusive" ? "Oferta Aceptada y Pagada" : "Tarifa Única de Licencia"}
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white text-right">
              {formatCurrency(paidAmount)} <span className="text-xs text-purple-400 font-normal">USD</span>
            </div>
          </div>

          {/* Why they paid / Concept Breakdown */}
          <div className="space-y-2 border-t border-b border-white/[0.06] py-5">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">
              CONCEPTO Y DERECHOS ADQUIRIDOS
            </span>
            <h3 className="text-sm font-bold text-white uppercase">
              {conceptTitle} ({tier.toUpperCase()})
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {conceptExplanation}
            </p>
          </div>

          {/* Client & Licensor Breakdown */}
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">LICENCIATARIO (CLIENTE)</span>
              <div className="text-white font-semibold truncate">{customer?.name || "Artista"}</div>
              <div className="text-zinc-400 text-[11px] truncate">{customer?.email || "Sin email"}</div>
            </div>

            <div className="space-y-1 text-right">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">PRODUCTOR (LICENCIANTE)</span>
              <div className="text-white font-semibold">RGODBEAT (Rafael Gámez)</div>
              <div className="text-purple-400 text-[11px]">rgodbeat@gmail.com</div>
            </div>
          </div>

          {/* Ticket Security Footer */}
          <div className="pt-4 border-t border-dashed border-white/10 text-center space-y-2">
            <div className="text-[10px] font-mono text-zinc-500">
              🔒 Autenticidad verificada por RGODBEAT 2.0 • Austin, TX • Global Delivery
            </div>
            <div className="text-[9px] font-mono text-zinc-600 truncate">
              Hash de seguridad: {purchase.id}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 print:hidden">
          <a
            href={`/api/download/${purchase.id}?fileType=${["wav", "stems", "unlimited", "exclusive"].includes(tier) ? "wav" : "mp3"}`}
            className="w-full sm:flex-1 py-3 rounded-xl text-xs font-mono font-bold tracking-wider uppercase text-center bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            DESCARGAR ARCHIVO MASTER →
          </a>
          <a
            href={`/api/download/${purchase.id}?fileType=contract`}
            className="w-full sm:flex-1 py-3 rounded-xl text-xs font-mono font-bold tracking-wider uppercase text-center bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-200 hover:text-white transition-colors"
          >
            DESCARGAR CONTRATO PDF (OFICIAL)
          </a>
        </div>
      </div>
    </div>
  );
}
