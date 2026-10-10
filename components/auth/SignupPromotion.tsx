"use client";

import { useEffect, useState } from "react";

export function SignupPromotion() {
  const [endsAt, setEndsAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    void fetch("/api/auth/signup-promotion", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const campaign = await response.json();
        const remaining = Date.parse(campaign.endsAt) - Date.parse(campaign.serverTime);
        if (controller.signal.aborted || campaign.active !== true || !Number.isFinite(remaining) || remaining <= 0) return;
        setEndsAt(campaign.endsAt);
        // Browser timers cannot exceed ~24.8 days. Recheck long campaigns in chunks.
        const hideAt = Date.now() + remaining;
        const schedule = () => {
          const delay = hideAt - Date.now();
          if (delay <= 0) setEndsAt(null);
          else timeout = setTimeout(schedule, Math.min(delay, 2_147_483_647));
        };
        schedule();
      })
      .catch(() => {});
    return () => { controller.abort(); clearTimeout(timeout); };
  }, []);

  if (!endsAt) return null;
  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 text-sm text-purple-100">
      <p className="font-bold">90 días gratis de RG Studio</p>
      <p className="mt-1 text-xs leading-relaxed text-purple-200/80">
        Crea una cuenta nueva antes del {new Date(endsAt).toLocaleString("es", { dateStyle: "long", timeStyle: "short" })} y confirma tu correo.
        Tu acceso se activa automáticamente al confirmar, una sola vez por cuenta y correo.
      </p>
    </div>
  );
}
