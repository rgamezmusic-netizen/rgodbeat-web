import React from "react";
import { requireAdminAuth } from "@/lib/auth/server";
import { listAllStemRequests } from "@/lib/stems/tickets";
import { StemRequestsManager } from "@/components/admin/StemRequestsManager";

export const dynamic = "force-dynamic";

export default async function AdminStemRequestsPage() {
  await requireAdminAuth("/admin/stem-requests");

  const tickets = await listAllStemRequests();

  const pendingCount = tickets.filter((t) => t.status === "Pending").length;
  const contactedCount = tickets.filter((t) => t.status === "Contacted").length;
  const deliveredCount = tickets.filter((t) => t.status === "Delivered").length;
  const closedCount = tickets.filter((t) => t.status === "Closed").length;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-[10px] font-mono tracking-[0.25em] text-purple-400 uppercase font-bold">
              PORTAL DE SOPORTE // STEM DELIVERIES
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase font-sans mt-1">
            Solicitudes de Stems (Tickets)
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Gestión de entrega manual de stems agrupados (01_MELODIES, 02_DRUMS, 03_BASS, 04_FX) para licencias UNLIMITED y EXCLUSIVE.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono text-zinc-300">
            TOTAL TICKETS: <span className="font-bold text-white">{tickets.length}</span>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#0e0e14] border border-white/[0.06] space-y-1">
          <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block font-bold">
            PENDIENTES
          </span>
          <div className="text-2xl font-mono font-extrabold text-white">{pendingCount}</div>
          <span className="text-[10px] text-zinc-500 font-mono block">Por atender</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0e0e14] border border-white/[0.06] space-y-1">
          <span className="text-[10px] font-mono text-blue-400 uppercase tracking-wider block font-bold">
            CONTACTADOS
          </span>
          <div className="text-2xl font-mono font-extrabold text-white">{contactedCount}</div>
          <span className="text-[10px] text-zinc-500 font-mono block">En preparación</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0e0e14] border border-white/[0.06] space-y-1">
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block font-bold">
            ENTREGADOS
          </span>
          <div className="text-2xl font-mono font-extrabold text-white">{deliveredCount}</div>
          <span className="text-[10px] text-zinc-500 font-mono block">Stems listos</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0e0e14] border border-white/[0.06] space-y-1">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block font-bold">
            CERRADOS
          </span>
          <div className="text-2xl font-mono font-extrabold text-white">{closedCount}</div>
          <span className="text-[10px] text-zinc-500 font-mono block">Finalizados</span>
        </div>
      </div>

      {/* Main Manager Component */}
      <StemRequestsManager initialTickets={tickets} />
    </div>
  );
}
