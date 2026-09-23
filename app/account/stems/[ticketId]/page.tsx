import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { getStemRequestByTicketId } from "@/lib/stems/tickets";
import { EXPECTED_STEM_GROUPS, STEM_GROUP_FILE_NAMES } from "@/lib/stems/types";

export const dynamic = "force-dynamic";

interface CustomerTicketPageProps {
  params: Promise<{ ticketId: string }>;
}

export default async function CustomerStemTicketPage({ params }: CustomerTicketPageProps) {
  const { ticketId } = await params;
  if (!ticketId) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=/account/stems/${ticketId}`);
  }

  const ticket = await getStemRequestByTicketId(ticketId);
  if (!ticket) {
    notFound();
  }

  const isAdmin = user.email === "rgodbeat@gmail.com" || user.email === "admin@rgodbeat.com";
  const isOwner = user.email && ticket.customerEmail.toLowerCase() === user.email.toLowerCase();

  if (!isAdmin && !isOwner) {
    return (
      <div className="min-h-screen bg-[#08080a] text-white pt-32 pb-20 px-4 text-center">
        <div className="max-w-md mx-auto p-8 rounded-2xl bg-[#0e0e14] border border-red-500/20 space-y-4">
          <div className="text-3xl">🔒</div>
          <h1 className="text-xl font-bold uppercase">Acceso Restringido</h1>
          <p className="text-xs text-zinc-400">
            Este ticket de stems pertenece a otra cuenta de usuario.
          </p>
          <Link
            href="/account"
            className="inline-block px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase bg-white/10 hover:bg-white/20 text-white"
          >
            ← Volver a Mi Cuenta
          </Link>
        </div>
      </div>
    );
  }

  const isDelivered = ticket.status === "Delivered";
  const isPending = ticket.status === "Pending";
  const isContacted = ticket.status === "Contacted";
  const isClosed = ticket.status === "Closed";

  const statusColors: Record<string, string> = {
    Pending: "bg-amber-500/20 border-amber-500/30 text-amber-300",
    Contacted: "bg-blue-500/20 border-blue-500/30 text-blue-300",
    Delivered: "bg-emerald-500/20 border-emerald-500/30 text-emerald-300",
    Closed: "bg-zinc-500/20 border-zinc-500/30 text-zinc-400",
  };

  const statusDescriptions: Record<string, string> = {
    Pending: "Tu solicitud ha sido recibida y está en cola de empaquetado por RGODBEAT.",
    Contacted: "RGODBEAT está preparando los 4 stems agrupados en formato WAV 24-bit / 48 kHz.",
    Delivered: "Los 4 grupos de stems han sido verificados y entregados con éxito.",
    Closed: "Este ticket de soporte ha sido cerrado.",
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-white pt-28 pb-20 px-4 sm:px-6 selection:bg-purple-500/30 selection:text-white">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
          <Link href="/account" className="hover:text-white transition-colors flex items-center gap-1.5">
            <span>←</span>
            <span>VOLVER A MI CUENTA</span>
          </Link>
          <span className="text-[10px] text-zinc-500 uppercase">RGODBEAT STEM REQUEST SYSTEM</span>
        </div>

        {/* Ticket Card */}
        <div className="rounded-3xl bg-[#0e0e14] border border-white/[0.1] shadow-2xl p-6 sm:p-9 relative overflow-hidden space-y-8">
          <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-white/[0.08] gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[10px] font-mono tracking-[0.25em] text-purple-400 uppercase font-bold">
                  TICKET OFICIAL DE SOLICITUD DE STEMS
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase font-sans">
                {ticket.ticketId}
              </h1>
              <p className="text-xs font-mono text-zinc-400">
                Obra: <span className="text-white font-bold">&ldquo;{ticket.beatTitle}&rdquo;</span>
              </p>
            </div>

            <div className="sm:text-right shrink-0">
              <span
                className={`inline-block px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider border ${
                  statusColors[ticket.status] || statusColors.Pending
                }`}
              >
                ESTADO: {ticket.status.toUpperCase()}
              </span>
              <span className="text-[10px] font-mono text-zinc-500 block mt-1">
                {new Date(ticket.createdAt).toLocaleDateString("es-ES", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Status Alert Banner */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3.5 ${
              isDelivered
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-200"
                : isPending
                ? "bg-amber-500/10 border-amber-500/25 text-amber-200"
                : isContacted
                ? "bg-blue-500/10 border-blue-500/25 text-blue-200"
                : "bg-white/[0.03] border-white/10 text-zinc-300"
            }`}
          >
            <span className="text-xl shrink-0 mt-0.5">
              {isDelivered ? "✅" : isPending ? "⏳" : isContacted ? "🛠️" : "📁"}
            </span>
            <div className="space-y-1 text-xs">
              <div className="font-bold uppercase tracking-wide">
                {ticket.status === "Delivered" ? "¡Stems Agrupados Entregados!" : `Estado: ${ticket.status}`}
              </div>
              <p className="opacity-90 leading-relaxed font-sans">
                {statusDescriptions[ticket.status]}
              </p>
            </div>
          </div>

          {/* Metadata Specifications Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">LICENCIA ASOCIADA</span>
              <div className="text-white font-bold">{ticket.licenseId}</div>
              <div className="text-purple-400 text-[11px] uppercase">
                TIER: {ticket.licenseTier.toUpperCase()} &bull; {ticket.contractVersion}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">ORDEN & FECHA</span>
              <div className="text-white font-bold truncate">{ticket.orderId || "Direct Checkout"}</div>
              <div className="text-zinc-400 text-[11px]">
                {new Date(ticket.createdAt).toLocaleString("es-ES")}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1 sm:col-span-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">LICENCIATARIO (CLIENTE)</span>
              <div className="text-white font-semibold">{ticket.customerName}</div>
              <div className="text-zinc-400 text-[11px]">{ticket.customerEmail}</div>
            </div>
          </div>

          {/* Admin Note if present */}
          {ticket.adminNotes && (
            <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-1 text-xs">
              <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block font-bold">
                NOTA DEL PRODUCTOR (RGODBEAT)
              </span>
              <p className="text-zinc-300 font-sans leading-relaxed">{ticket.adminNotes}</p>
            </div>
          )}

          {/* Stems Delivery Section */}
          <div className="space-y-4 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white uppercase tracking-tight font-sans">
                  Archivos de Stems Agrupados (WAV 24-bit / 48 kHz)
                </h2>
                <p className="text-xs text-zinc-400">
                  Grupos de pistas independientes para mezcla y masterización oficial.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500">4 GRUPOS</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EXPECTED_STEM_GROUPS.map((groupKey) => {
                const fileName = STEM_GROUP_FILE_NAMES[groupKey];
                const fileEntry = ticket.stemFiles?.[groupKey];
                const hasFile = Boolean(fileEntry);

                return (
                  <div
                    key={groupKey}
                    className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isDelivered
                        ? "bg-[#14141e] border-white/10 hover:border-purple-500/40"
                        : "bg-white/[0.02] border-white/[0.06] opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-sm shrink-0">
                        🎛️
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold font-mono text-white block truncate">
                          {fileName}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 block">
                          {isDelivered ? "Listo para descarga" : "Pendiente de empaque"}
                        </span>
                      </div>
                    </div>

                    {isDelivered ? (
                      <a
                        href={`/api/stems/${ticket.ticketId}/download?group=${groupKey}`}
                        download={fileName}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white transition-colors shrink-0"
                      >
                        DESCARGAR
                      </a>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-1 rounded bg-white/[0.04] text-zinc-500 border border-white/[0.06]">
                        BLOQUEADO
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-4 border-t border-dashed border-white/10 text-center text-[10px] font-mono text-zinc-500">
            RGODBEAT 2.0 &bull; Stems Agrupados Oficiales &bull; Austin, TX &bull; rgodbeat@gmail.com
          </div>
        </div>
      </div>
    </div>
  );
}
