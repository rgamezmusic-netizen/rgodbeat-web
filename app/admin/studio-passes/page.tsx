"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Check, Clock, UserCheck, Shield, Plus, RefreshCw, AlertCircle, Ban } from "lucide-react";

interface CustomerPass {
  id: string;
  email: string;
  name: string;
  studioAccessUntil: string | null;
  isActive: boolean;
  daysRemaining: number;
  createdAt: string;
}

export default function AdminStudioPassesPage() {
  const [customers, setCustomers] = useState<CustomerPass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Form State
  const [targetEmail, setTargetEmail] = useState("");
  const [selectedDays, setSelectedDays] = useState<number>(3);
  const [customDays, setCustomDays] = useState<string>("");

  const fetchPasses = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/studio-passes");
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
      }
    } catch (err) {
      console.error("Error loading studio passes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPasses();
  }, []);

  const handleGrantPass = async (emailToGrant?: string, daysToGrant?: number) => {
    const email = (emailToGrant || targetEmail).trim().toLowerCase();
    const days = daysToGrant || (customDays ? parseInt(customDays, 10) : selectedDays);

    if (!email) {
      setStatusMsg({ text: "Por favor ingresa un correo electrónico válido.", type: "error" });
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMsg(null);

      const res = await fetch("/api/admin/studio-passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, days, action: "grant" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al otorgar el pase.");
      }

      setStatusMsg({ text: data.message || `¡Pase de ${days} días otorgado a ${email}!`, type: "success" });
      if (!emailToGrant) {
        setTargetEmail("");
        setCustomDays("");
      }
      await fetchPasses();
    } catch (err: any) {
      setStatusMsg({ text: err.message || "Error al otorgar pase.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokePass = async (email: string) => {
    if (!confirm(`¿Estás seguro de que deseas revocar el pase a ${email}?`)) return;

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/admin/studio-passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action: "revoke" }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ text: `Pase revocado para ${email}.`, type: "success" });
        await fetchPasses();
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeCount = customers.filter((c) => c.isActive).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[11px] font-mono tracking-[0.2em] text-amber-400 uppercase font-bold">
              ESTUDIO & LICENCIAS // CMS
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight uppercase">
            CONTROL DE PASES DE STUDIO
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 font-mono mt-1">
            Otorga pases gratuitos de cortesía (3 días, 7 días o 30 días) o administra los accesos vigentes.
          </p>
        </div>

        <button
          onClick={fetchPasses}
          disabled={isLoading}
          className="self-start sm:self-center flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-zinc-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl border text-xs font-mono flex items-center justify-between gap-3 ${
            statusMsg.type === "success"
              ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/60 border-red-500/40 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-xs opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Top Creation Card */}
      <div className="p-6 rounded-2xl bg-[#0e0e14] border border-amber-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl space-y-5 relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold font-mono text-white uppercase tracking-wider">
              OTORGAR PASE DE CORTESÍA (CONTROL ADMINISTRADOR)
            </h2>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-zinc-300 mb-1.5 uppercase tracking-wider">
                Correo Electrónico del Artista / Cliente
              </label>
              <input
                type="email"
                placeholder="ejemplo@artista.com"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-300 mb-1.5 uppercase tracking-wider">
                Duración del Pase
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDays(3);
                    setCustomDays("");
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all border ${
                    selectedDays === 3 && !customDays
                      ? "bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20"
                      : "bg-white/[0.04] text-zinc-300 border-white/10 hover:border-amber-500/40"
                  }`}
                >
                  ⭐ 3 Días Free
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDays(7);
                    setCustomDays("");
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all border ${
                    selectedDays === 7 && !customDays
                      ? "bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20"
                      : "bg-white/[0.04] text-zinc-300 border-white/10 hover:border-amber-500/40"
                  }`}
                >
                  7 Días Free
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDays(30);
                    setCustomDays("");
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all border ${
                    selectedDays === 30 && !customDays
                      ? "bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20"
                      : "bg-white/[0.04] text-zinc-300 border-white/10 hover:border-amber-500/40"
                  }`}
                >
                  30 Días (1 Mes)
                </button>
                <input
                  type="number"
                  min="1"
                  max="365"
                  placeholder="Días personaliz."
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleGrantPass()}
                disabled={isSubmitting || !targetEmail.trim()}
                className="py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(245,158,11,0.25)] active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? "Otorgando..."
                    : `Otorgar Pase de ${customDays ? customDays : selectedDays} Días Inmediato`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Passes List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold font-mono text-white uppercase tracking-wider">
              CLIENTES & ARTISTAS CON PASES ({customers.length})
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {activeCount} Activos
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0c0c12]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-white/[0.08] bg-white/[0.02] text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Artista / Email</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Días Restantes</th>
                <th className="py-3 px-4">Vence En</th>
                <th className="py-3 px-4 text-right">Acciones Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No hay clientes registrados con pases aún.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{c.email}</div>
                      <div className="text-[10px] text-zinc-500">{c.name}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      {c.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          ACTIVO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px]">
                          EXPIRADO
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {c.isActive ? (
                        <span className="text-amber-400 font-bold">{c.daysRemaining} días</span>
                      ) : (
                        <span className="text-zinc-600">0 días</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 text-[11px]">
                      {c.studioAccessUntil ? new Date(c.studioAccessUntil).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }) : "Sin pase"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleGrantPass(c.email, 3)}
                          disabled={isSubmitting}
                          className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] transition-colors cursor-pointer"
                          title="Sumar 3 días free a este usuario"
                        >
                          +3 Días
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGrantPass(c.email, 30)}
                          disabled={isSubmitting}
                          className="px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] transition-colors cursor-pointer"
                          title="Sumar 30 días a este usuario"
                        >
                          +30 Días
                        </button>
                        {c.isActive && (
                          <button
                            type="button"
                            onClick={() => handleRevokePass(c.email)}
                            disabled={isSubmitting}
                            className="p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Revocar acceso de inmediato"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
