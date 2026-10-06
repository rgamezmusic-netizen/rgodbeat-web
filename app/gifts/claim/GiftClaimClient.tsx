"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type GiftPreview = { beatTitle: string; coverUrl: string | null; licenseTier: string; licenseName: string };

export default function GiftClaimClient({ token, contextId, gift }: { token: string | null; contextId: string | null; gift: GiftPreview | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const autoClaimStarted = useRef(false);

  const ensureContext = async () => {
    if (contextId) return contextId;
    if (!token) throw new Error("Este enlace ya no está disponible. Pide al comprador que reenvíe el regalo desde su cuenta.");
    const response = await fetch("/api/gifts/context", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok || typeof data.contextId !== "string") throw new Error(data.error || "No se pudo preparar el acceso al regalo.");
    return data.contextId as string;
  };

  const goToAuth = async (mode: "signin" | "signup") => {
    setPending(true);
    setMessage(null);
    try {
      const context = await ensureContext();
      const destination = `/gifts/claim?context=${encodeURIComponent(context)}`;
      router.push(`/login?mode=${mode}&gift_context=${encodeURIComponent(context)}&redirect=${encodeURIComponent(destination)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo continuar.");
    } finally { setPending(false); }
  };

  const claim = useCallback(async () => {
    setPending(true);
    setMessage(null);
    try {
      const body = token ? { token } : { contextId };
      const response = await fetch("/api/gifts/claim", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.status === 401) { setAuthRequired(true); setMessage(data.error); return; }
      if (!response.ok) throw new Error(data.error || "No se pudo reclamar el regalo.");
      setPurchaseId(data.purchaseId);
      setMessage("La licencia ya está disponible en tu cuenta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo reclamar el regalo.");
    } finally { setPending(false); }
  }, [contextId, token]);

  useEffect(() => {
    if (!gift || autoClaimStarted.current) return;
    autoClaimStarted.current = true;
    void createClient().auth.getSession().then(({ data }) => {
      if (data.session?.user) void claim();
    });
  }, [claim, gift]);

  const art = gift?.coverUrl ? <Image src={gift.coverUrl} alt="Portada del beat" width={160} height={160} unoptimized className="h-40 w-40 rounded-xl border border-white/10 object-cover" />
    : <div className="flex h-40 w-40 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-4xl">♫</div>;
  return <main className="min-h-[100dvh] bg-[#08080a] px-4 py-10 text-white" style={{ paddingTop: "max(40px, env(safe-area-inset-top))" }}>
    <section className="mx-auto w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-[#101014] p-5 shadow-2xl sm:p-7">
      <div className="space-y-1"><p className="text-[11px] font-mono tracking-[.18em] text-amber-300">RGODBEAT · REGALO</p><h1 className="text-2xl font-bold">{gift ? "Recibiste un beat" : "Este enlace no está disponible"}</h1></div>
      {gift ? <div className="flex flex-col items-center gap-4 rounded-xl border border-white/5 bg-black/20 p-4 text-center sm:flex-row sm:text-left">{art}<div className="min-w-0"><h2 className="text-lg font-semibold">{gift.beatTitle}</h2><p className="mt-1 text-sm text-zinc-400">{gift.licenseName} · {gift.licenseTier.toUpperCase()}</p><p className="mt-3 text-xs text-zinc-500">Al reclamar, la licencia y el acceso Studio se asignarán a esta cuenta.</p></div></div>
        : <p className="text-sm leading-6 text-zinc-400">El regalo pudo reclamarse ya o el enlace venció. Si sigue pendiente, pide al comprador que lo reenvíe desde su cuenta.</p>}
      {gift && !purchaseId && <div className="space-y-3">
        <button type="button" disabled={pending} onClick={() => void claim()} className="w-full rounded-xl bg-amber-400 px-4 py-3.5 text-sm font-bold text-black disabled:opacity-60">{pending ? "VALIDANDO…" : "RECLAMAR REGALO"}</button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pending} onClick={() => void goToAuth("signin")} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-semibold text-white disabled:opacity-60">INICIAR SESIÓN</button>
          <button type="button" disabled={pending} onClick={() => void goToAuth("signup")} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-semibold text-white disabled:opacity-60">CREAR CUENTA</button>
        </div>
      </div>}
      {purchaseId && <a href={`/tickets/${purchaseId}`} className="block w-full rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-black">ABRIR LICENCIA</a>}
      {message && <p role="status" className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-zinc-200">{message}</p>}
      {authRequired && <p className="text-center text-xs text-zinc-500">Usa el correo verificado al que se envió este regalo.</p>}
    </section>
  </main>;
}
