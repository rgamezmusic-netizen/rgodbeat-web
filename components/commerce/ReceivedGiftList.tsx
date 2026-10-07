"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ReceivedGift = { giftId: string; title: string; license: string; licenseTier: string; status: string; createdAt: string; canClaim: boolean };
const statusLabel: Record<string, string> = { paid_pending_recipient: "PREPARANDO REGALO", ready_to_claim: "LISTO PARA RECLAMAR" };

export function ReceivedGiftList() {
  const router = useRouter();
  const [gifts, setGifts] = useState<ReceivedGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/gifts/received", { cache: "no-store" })
      .then(async response => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (active && response.ok && Array.isArray(data.gifts)) setGifts(data.gifts);
        else if (active && !response.ok) setMessage(data.error || "No se pudieron cargar tus regalos.");
      })
      .catch(() => { if (active) setMessage("No se pudieron cargar tus regalos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const claim = async (giftId: string) => {
    setBusy(giftId); setMessage(null);
    try {
      const response = await fetch("/api/gifts/context", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giftId }) });
      const data = await response.json();
      if (!response.ok || typeof data.contextId !== "string") throw new Error(data.error || "No se pudo abrir el regalo.");
      router.push(`/gifts/claim?context=${encodeURIComponent(data.contextId)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir el regalo.");
      setBusy(null);
    }
  };

  if (!loading && gifts.length === 0 && !message) return null;
  return <section className="space-y-4 rounded-2xl border border-emerald-300/15 bg-[#0e0e14] p-5 sm:p-6">
    <div>
      <h2 className="text-base font-bold text-white">Regalos recibidos</h2>
      <p className="mt-1 text-xs text-zinc-400">Aquí aparecen los regalos pendientes. Al reclamarlos, su licencia o beneficio se asigna a tu cuenta.</p>
    </div>
    {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : gifts.map(gift => <article key={gift.giftId}
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-semibold text-white">{gift.title}</h3>
        <p className="mt-1 text-xs text-zinc-400">{gift.license} · {statusLabel[gift.status] || gift.status}</p>
      </div>
      {gift.canClaim
        ? <button type="button" disabled={busy === gift.giftId} onClick={() => void claim(gift.giftId)}
            className="rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-bold text-black disabled:opacity-50">
            {busy === gift.giftId ? "ABRIENDO…" : "RECLAMAR REGALO"}
          </button>
        : <span className="text-xs text-amber-200">
            {gift.status === "paid_pending_recipient"
              ? "El regalo se está preparando."
              : "El enlace venció; pide al comprador que reenvíe el regalo."}
          </span>}
    </article>)}
    {message && <p role="status" className="text-xs text-zinc-300">{message}</p>}
  </section>;
}
