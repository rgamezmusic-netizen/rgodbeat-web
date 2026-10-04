"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && (event === "PASSWORD_RECOVERY" || session)) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setReady(true);
      else setMessage("El enlace expiró o no es válido. Solicita uno nuevo.");
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("Usa al menos 8 caracteres para la contraseña.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setMessage("El enlace venció o no se pudo guardar. Solicita un nuevo enlace.");
      setSaving(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#08080a] px-4 text-white">
    <form onSubmit={savePassword} className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#101014] p-7">
      <p className="text-xs font-mono uppercase tracking-[.2em] text-amber-400">RGODBEAT • CUENTA ADMIN</p>
      <h1 className="text-2xl font-bold">Define tu contraseña</h1>
      <p className="text-sm text-zinc-400">Abre esta página desde el enlace de recuperación que enviamos a tu correo.</p>
      {ready ? <>
        <label className="block space-y-1 text-sm text-zinc-300">Nueva contraseña
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white" />
        </label>
        <label className="block space-y-1 text-sm text-zinc-300">Repite la contraseña
          <input type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white" />
        </label>
        <button disabled={saving} className="w-full rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-black disabled:opacity-60">{saving ? "Guardando…" : "Guardar contraseña"}</button>
      </> : <p role="status" className="text-sm text-zinc-400">{message || "Validando el enlace…"}</p>}
      {message && ready && <p role="alert" className="text-sm text-red-300">{message}</p>}
    </form>
  </main>;
}
