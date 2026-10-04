"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSiteAdmin } from "@/lib/auth/admin";
import { safeAuthRedirect } from "@/lib/auth/redirect";
import { requestPasswordRecovery, resolveAuthRecovery } from "@/lib/auth/recovery";
import { translateAuthError } from "@/lib/auth/client";

export default function ResetPasswordForm() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    void resolveAuthRecovery().then(result => {
      if (!active) return;
      setReady(Boolean(result.user && !result.error));
      if (result.user?.email) setEmail(result.user.email);
      setMessage(result.error || "");
      setChecking(false);
    });
    return () => { active = false; };
  }, []);

  async function sendRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setSent(false); setMessage("");
    const { error } = await requestPasswordRecovery(email, new URL(window.location.href).searchParams.get("next"));
    setSending(false);
    if (error) setMessage(error);
    else { setSent(true); setMessage("Si ese correo tiene una cuenta, recibirás un enlace nuevo. Revisa también Spam y abre el correo más reciente."); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) { setMessage("Usa al menos 8 caracteres para la contraseña."); return; }
    if (password !== confirmation) { setMessage("Las contraseñas no coinciden."); return; }
    setSaving(true);
    try {
      const { data, error } = await createClient().auth.updateUser({ password });
      if (error || !data.user) {
        if (error && /session|expired|not authenticated/i.test(error.message)) {
          setReady(false); setSent(false); setMessage("La sesión venció. Solicita un enlace nuevo aquí.");
        } else setMessage(translateAuthError(error?.message));
        setSaving(false); return;
      }
      const fallback = isSiteAdmin(data.user) ? "/admin" : "/account";
      const next = new URL(window.location.href).searchParams.get("next");
      window.location.replace(safeAuthRedirect(next, fallback));
    } catch { setMessage("No se pudo guardar. Revisa la conexión e inténtalo de nuevo."); setSaving(false); }
  }

  const inputClass = "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white";
  const buttonClass = "w-full rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-black disabled:opacity-60";
  return <main className="flex min-h-screen items-center justify-center bg-[#08080a] px-4 text-white">
    <section className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#101014] p-7">
      <p className="text-xs font-mono uppercase tracking-[.2em] text-amber-400">RGODBEAT • TU CUENTA</p>
      <h1 className="text-2xl font-bold">{ready ? "Define tu contraseña" : "Recuperar contraseña"}</h1>
      {checking ? <p role="status" className="text-sm text-zinc-400">Validando el enlace…</p> : ready ? <form onSubmit={savePassword} className="space-y-5">
        <p className="break-all text-sm text-zinc-400">Cuenta: {email}</p>
        <label className="block space-y-1 text-sm text-zinc-300">Nueva contraseña
          <input type="password" autoComplete="new-password" required minLength={8} disabled={saving} value={password} onChange={event => setPassword(event.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm text-zinc-300">Repite la contraseña
          <input type="password" autoComplete="new-password" required minLength={8} disabled={saving} value={confirmation} onChange={event => setConfirmation(event.target.value)} className={inputClass} />
        </label>
        <button disabled={saving} className={buttonClass}>{saving ? "Guardando…" : "Guardar contraseña"}</button>
      </form> : <form onSubmit={sendRecovery} className="space-y-5">
        <p className="text-sm text-zinc-400">Escribe el correo de tu cuenta para recibir un enlace nuevo. Puedes abrirlo también desde otro navegador o dispositivo.</p>
        <label className="block space-y-1 text-sm text-zinc-300">Correo electrónico
          <input type="email" autoComplete="email" required maxLength={254} disabled={sending} value={email} onChange={event => setEmail(event.target.value)} className={inputClass} />
        </label>
        <button disabled={sending} className={buttonClass}>{sending ? "Enviando…" : "Enviar enlace de recuperación"}</button>
      </form>}
      {message && <p role={sent ? "status" : "alert"} className={`text-sm ${sent ? "text-emerald-300" : "text-red-300"}`}>{message}</p>}
      <Link href="/login" className="block text-center text-sm text-amber-300 underline-offset-4 hover:underline">Volver a iniciar sesión</Link>
    </section>
  </main>;
}
