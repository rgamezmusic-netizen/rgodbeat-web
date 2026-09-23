"use client";

import React, { useState } from "react";
import {
  StemRequestTicket,
  StemTicketStatus,
  STEM_TICKET_STATUSES,
  EXPECTED_STEM_GROUPS,
  STEM_GROUP_FILE_NAMES,
  ExpectedStemGroup,
} from "@/lib/stems/types";

interface StemRequestsManagerProps {
  initialTickets: StemRequestTicket[];
}

export function StemRequestsManager({ initialTickets }: StemRequestsManagerProps) {
  const [tickets, setTickets] = useState<StemRequestTicket[]>(initialTickets);
  const [selectedTicket, setSelectedTicket] = useState<StemRequestTicket | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Edit form state
  const [editStatus, setEditStatus] = useState<StemTicketStatus>("Pending");
  const [editNotes, setEditNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [uploadingGroup, setUploadingGroup] = useState<ExpectedStemGroup | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const openTicketModal = (ticket: StemRequestTicket) => {
    setSelectedTicket(ticket);
    setEditStatus(ticket.status);
    setEditNotes(ticket.adminNotes || "");
    setMessage(null);
  };

  const closeTicketModal = () => {
    setSelectedTicket(null);
    setMessage(null);
  };

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.ticketId.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.customerEmail.toLowerCase().includes(q) ||
        t.beatTitle.toLowerCase().includes(q) ||
        t.licenseId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Save status & notes
  const handleSave = async (overrideStatus?: StemTicketStatus) => {
    if (!selectedTicket) return;
    setSaving(true);
    setMessage(null);

    const newStatus = overrideStatus || editStatus;

    try {
      const res = await fetch("/api/admin/stems", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.ticketId,
          status: newStatus,
          adminNotes: editNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update ticket");

      const updated = data.ticket as StemRequestTicket;
      setSelectedTicket(updated);
      setEditStatus(updated.status);
      setTickets((prev) => prev.map((t) => (t.ticketId === updated.ticketId ? updated : t)));
      setMessage({ type: "success", text: `Ticket actualizado: Estado ${newStatus}` });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Error al actualizar ticket" });
    } finally {
      setSaving(false);
    }
  };

  // Upload a stem file for a specific group
  const handleFileUpload = async (groupKey: ExpectedStemGroup, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTicket) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingGroup(groupKey);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("ticketId", selectedTicket.ticketId);
      formData.append("groupKey", groupKey);
      formData.append("file", file);

      const res = await fetch("/api/admin/stems", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error subiendo ${groupKey}`);

      const updated = data.ticket as StemRequestTicket;
      setSelectedTicket(updated);
      setTickets((prev) => prev.map((t) => (t.ticketId === updated.ticketId ? updated : t)));
      setMessage({ type: "success", text: `Archivo ${STEM_GROUP_FILE_NAMES[groupKey]} subido con éxito.` });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Error al subir archivo" });
    } finally {
      setUploadingGroup(null);
      e.target.value = "";
    }
  };

  const statusBadge = (status: StemTicketStatus) => {
    switch (status) {
      case "Pending":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">PENDING</span>;
      case "Contacted":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">CONTACTED</span>;
      case "Delivered":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">DELIVERED</span>;
      case "Closed":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">CLOSED</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar por Ticket ID, cliente, email, beat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#101018] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {["ALL", ...STEM_TICKET_STATUSES].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                filterStatus === st
                  ? "bg-purple-600 text-white font-bold"
                  : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white border border-white/[0.06]"
              }`}
            >
              {st} {st !== "ALL" && `(${tickets.filter((t) => t.status === st).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets Table */}
      <div className="rounded-2xl bg-[#0e0e14] border border-white/[0.08] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-zinc-400 uppercase text-[10px] tracking-wider">
                <th className="py-3.5 px-4">Ticket ID</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4">Beat</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Licencia & Tier</th>
                <th className="py-3.5 px-4">Orden / Versión</th>
                <th className="py-3.5 px-4">Fecha</th>
                <th className="py-3.5 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredTickets.length > 0 ? (
                filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.ticketId}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => openTicketModal(ticket)}
                  >
                    <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                      {ticket.ticketId}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {statusBadge(ticket.status)}
                    </td>
                    <td className="py-3.5 px-4 text-white font-semibold whitespace-nowrap">
                      {ticket.beatTitle}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-zinc-200 font-sans font-medium">{ticket.customerName}</div>
                      <div className="text-[11px] text-zinc-500">{ticket.customerEmail}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-zinc-300 font-bold">{ticket.licenseId}</div>
                      <div className="text-[10px] text-purple-400 uppercase font-bold">
                        {ticket.licenseTier.toUpperCase()}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-zinc-400">{ticket.orderId || "N/A"}</div>
                      <div className="text-[10px] text-zinc-500">{ticket.contractVersion}</div>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 whitespace-nowrap">
                      {new Date(ticket.createdAt).toLocaleDateString("es-ES")}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTicketModal(ticket);
                        }}
                        className="px-2.5 py-1.5 rounded bg-white/[0.06] hover:bg-purple-600 hover:text-white text-zinc-300 text-[10px] font-bold uppercase transition-all"
                      >
                        GESTIONAR →
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500 text-xs font-sans">
                    No hay solicitudes de stems en esta categoría.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail & Action Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#0f0f16] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
              <div>
                <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest block font-bold">
                  GESTIÓN DE STEMS RGODBEAT
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white uppercase font-sans">
                  {selectedTicket.ticketId}
                </h2>
                <p className="text-xs text-zinc-400 font-mono">
                  Beat: <span className="text-white font-bold">&ldquo;{selectedTicket.beatTitle}&rdquo;</span>
                </p>
              </div>

              <button
                onClick={closeTicketModal}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center text-sm font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Message Alert */}
            {message && (
              <div
                className={`p-3 rounded-lg text-xs font-mono ${
                  message.type === "success"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-300 border border-red-500/30"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Specifications Card */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs font-mono">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">CLIENTE</span>
                <span className="text-white font-semibold truncate block">{selectedTicket.customerName}</span>
                <span className="text-zinc-400 text-[10px] truncate block">{selectedTicket.customerEmail}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">LICENCIA</span>
                <span className="text-purple-400 font-bold block">{selectedTicket.licenseId}</span>
                <span className="text-zinc-400 text-[10px] uppercase block">
                  TIER: {selectedTicket.licenseTier.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">ORDEN & VERSIÓN</span>
                <span className="text-white truncate block">{selectedTicket.orderId || "N/A"}</span>
                <span className="text-zinc-400 text-[10px] block">{selectedTicket.contractVersion}</span>
              </div>
            </div>

            {/* Quick Status Buttons */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block font-bold">
                CAMBIAR ESTADO RÁPIDO:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {STEM_TICKET_STATUSES.map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setEditStatus(st);
                      handleSave(st);
                    }}
                    disabled={saving}
                    className={`py-2 px-3 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                      editStatus === st
                        ? "bg-purple-600 text-white shadow-lg"
                        : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 border border-white/[0.06]"
                    }`}
                  >
                    {st === "Delivered" ? "✓ DELIVERED" : st === "Closed" ? "✕ CLOSED" : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin Notes */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block font-bold">
                NOTAS ADMINISTRATIVAS (VISIBLES EN EL TICKET DEL CLIENTE):
              </label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Ejemplo: Stems agrupados exportados a 24-bit / 48 kHz. Cualquier duda contáctanos a rgodbeat@gmail.com"
                className="w-full bg-[#12121c] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-sans"
              />
            </div>

            {/* Grouped Stems File Upload / Delivery Management */}
            <div className="space-y-3 pt-2 border-t border-white/[0.08]">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block font-bold">
                  SUBIR / ENTREGAR LOS 4 GRUPOS DE STEMS:
                </label>
                <span className="text-[10px] font-mono text-zinc-500">FORMATO WAV REQUERIDO</span>
              </div>

              <div className="space-y-2">
                {EXPECTED_STEM_GROUPS.map((groupKey) => {
                  const fileName = STEM_GROUP_FILE_NAMES[groupKey];
                  const fileEntry = selectedTicket.stemFiles?.[groupKey];
                  const isUploading = uploadingGroup === groupKey;

                  return (
                    <div
                      key={groupKey}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                        <div>
                          <span className="font-bold text-white block">{fileName}</span>
                          <span className="text-[10px] text-zinc-400 block">
                            {fileEntry
                              ? `Entregado: ${new Date(fileEntry.uploadedAt).toLocaleDateString("es-ES")}`
                              : "No adjuntado aún"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {fileEntry && (
                          <a
                            href={`/api/stems/${selectedTicket.ticketId}/download?group=${groupKey}`}
                            download={fileName}
                            className="px-2.5 py-1.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase hover:bg-emerald-500/30 transition-colors"
                          >
                            PROBAR DESCARGA ↗
                          </a>
                        )}

                        <label className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 text-[10px] font-bold uppercase cursor-pointer border border-white/10 transition-colors">
                          {isUploading ? "SUBIENDO..." : fileEntry ? "REEMPLAZAR" : "SUBIR WAV"}
                          <input
                            type="file"
                            accept=".wav,audio/wav"
                            disabled={isUploading}
                            className="hidden"
                            onChange={(e) => handleFileUpload(groupKey, e)}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={closeTicketModal}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-mono font-bold uppercase bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white border border-white/[0.08]"
              >
                CERRAR
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-mono font-bold uppercase bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "GUARDANDO..." : "GUARDAR CAMBIOS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
