"use client";

import { useEffect, useState } from "react";

type GiftRow = { gift_id: string; beat_title: string; license_name: string; status: string; delivery_status: string; created_at: string };
const labels: Record<string, string> = { paid_pending_recipient: "PENDIENTE", ready_to_claim: "ESPERANDO RECLAMO", claimed: "RECLAMADO", refunded: "REEMBOLSADO", revoked: "REVOCADO", gift_sent: "REGALO ENVIADO", waiting_to_be_claimed: "ESPERANDO RECLAMO", delivery_issue: "PROBLEMA DE ENTREGA" };

export function GiftStatusList() {
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = async () => {
    const response = await fetch("/api/gifts", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setGifts(Array.isArray(data.gifts) ? data.gifts : []);
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/gifts", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => { if (active && response.ok) setGifts(Array.isArray(data.gifts) ? data.gifts : []); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const resend = async (giftId: string) => {
    setBusy(giftId); setMessage(null);
    try {
      const response = await fetch(`/api/gifts/${giftId}/resend`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo reenviar el regalo.");
      setMessage("Si el regalo sigue pendiente, enviaremos un enlace nuevo al destinatario original.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo reenviar el regalo."); }
    finally { setBusy(null); }
  };
  if (!loading && gifts.length === 0) return null;
  return <section className="space-y-3 rounded-2xl border border-amber-300/15 bg-[#0e0e14] p-5 sm:p-6">
    <div><h2 className="text-base font-bold text-white">Regalos enviados</h2><p className="mt-1 text-xs text-zinc-400">Estado de las licencias que compraste para otras personas.</p></div>
    {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : gifts.map((gift) => <article key={gift.gift_id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="font-semibold text-white">{gift.beat_title}</h3><p className="mt-1 text-xs text-zinc-400">{gift.license_name} · {labels[gift.status] || gift.status}</p><p className="mt-1 text-[10px] text-amber-200">{labels[gift.delivery_status] || gift.delivery_status}</p></div>
      {gift.status !== "claimed" && gift.status !== "refunded" && gift.status !== "revoked" && <button type="button" disabled={busy === gift.gift_id} onClick={() => void resend(gift.gift_id)} className="rounded-lg border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">{busy === gift.gift_id ? "REENVIANDO…" : "REENVIAR REGALO"}</button>}
    </article>)}
    {message && <p role="status" className="text-xs text-zinc-300">{message}</p>}
  </section>;
}
