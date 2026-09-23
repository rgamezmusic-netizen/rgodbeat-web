"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

interface RequestStemsButtonProps {
  purchaseId: string;
  beatTitle?: string;
  initialTicketId?: string | null;
  initialStatus?: string | null;
}

export function RequestStemsButton({
  purchaseId,
  beatTitle = "Beat",
  initialTicketId,
  initialStatus,
}: RequestStemsButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(initialTicketId || null);
  const [status, setStatus] = useState<string | null>(initialStatus || null);
  const [error, setError] = useState<string | null>(null);

  if (ticketId) {
    const isDelivered = status === "Delivered";
    return (
      <a
        href={`/account/stems/${ticketId}`}
        className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-mono font-bold tracking-wider uppercase border transition-all text-center flex items-center justify-center gap-1.5 ${
          isDelivered
            ? "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300"
            : "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-300"
        }`}
        title={`Ticket: ${ticketId} — Estado: ${status}`}
      >
        <span>🎛️</span>
        <span>
          STEMS ({status?.toUpperCase() || "PENDING"}) →
        </span>
      </a>
    );
  }

  const handleRequest = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stems/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo procesar la solicitud de stems.");
      }

      if (data.ticket?.ticketId) {
        setTicketId(data.ticket.ticketId);
        setStatus(data.ticket.status);
        router.push(`/account/stems/${data.ticket.ticketId}`);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "Error al solicitar stems.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleRequest}
        disabled={loading}
        className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 transition-all text-center cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
        title="Crear ticket oficial para recibir los 4 grupos de stems (.wav)"
      >
        <span>🎛️</span>
        <span>{loading ? "CREANDO TICKET..." : "SOLICITAR STEMS"}</span>
      </button>
      {error && <span className="text-[10px] text-red-400 font-mono mt-1">{error}</span>}
    </div>
  );
}
