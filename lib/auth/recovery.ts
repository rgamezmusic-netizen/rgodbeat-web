"use client";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { safeAuthRedirect } from "@/lib/auth/redirect";
import { fetchAuth } from "./request";

export const RECOVERY_INVALID = "El enlace venció o ya se usó. Solicita uno nuevo aquí.";
export const RECOVERY_SESSION_MARKER = "rgodbeat-password-recovery";
export function recoveryErrorMessage(error: { message: string; code?: string } | null): string {
  if (!error) return RECOVERY_INVALID;
  const value = `${error.code || ""} ${error.message}`.toLowerCase();
  if (/pkce|code verifier|flow state/.test(value)) return "Este enlace necesita el navegador donde lo solicitaste. Pide uno nuevo aquí para poder abrirlo también en otro dispositivo.";
  if (/expired|otp|invalid|not found|session missing/.test(value)) return RECOVERY_INVALID;
  if (/rate.limit|too.many|429/.test(value)) return "Hay demasiados intentos. Espera unos minutos antes de pedir otro enlace.";
  if (/fetch|network|timeout/.test(value)) return "No pudimos conectar. Comprueba tu conexión y vuelve a abrir el enlace.";
  return "No se pudo validar el enlace. Solicita uno nuevo aquí.";
}
export function hasAuthLinkParameters(url: URL): boolean {
  const hash = new URLSearchParams(url.hash.slice(1));
  return Boolean(url.searchParams.get("code") || url.searchParams.get("token_hash") || hash.get("access_token") || hash.get("error") || url.searchParams.get("error"));
}
type RecoveryResult = { user: User | null; recovery: boolean; error: string | null };
let pendingLink: Promise<RecoveryResult> | null = null;
export function hasPendingAuthRecovery(): boolean { return pendingLink !== null; }

/** Shared by the global redirect and password form, so a token is exchanged once. */
export function resolveAuthRecovery(): Promise<RecoveryResult> {
  if (pendingLink) return pendingLink;
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id") || undefined;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") || hash.get("type");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  let sessionMarker = false;
  if (url.pathname === "/reset-password") {
    try {
      sessionMarker = window.sessionStorage.getItem(RECOVERY_SESSION_MARKER) === "1";
      if (sessionMarker) window.sessionStorage.removeItem(RECOVERY_SESSION_MARKER);
    } catch { /* Private browsing may disable session storage; link tokens still work. */ }
  }
  const urlError = hash.get("error_code") || hash.get("error") || url.searchParams.get("error_code") || url.searchParams.get("error");
  const recovery = type === "recovery" || type === "invite" || sessionMarker || url.pathname === "/reset-password";

  // A normal signed-in session is not proof that the user requested a password
  // reset. Require a real Supabase link or the SDK's PASSWORD_RECOVERY event.
  if (url.pathname === "/reset-password" && !tokenHash && !accessToken && !refreshToken && !code && !sessionMarker) {
    pendingLink = Promise.resolve({ user: null, recovery: true, error: RECOVERY_INVALID });
    const shared = pendingLink;
    void shared.finally(() => queueMicrotask(() => { if (pendingLink === shared) pendingLink = null; }));
    return shared;
  }

  // Remove credentials before any further navigation; keep the intended destination.
  if (hasAuthLinkParameters(url)) {
    for (const name of ["code", "token_hash", "type", "error", "error_code", "error_description", "sb_flow_id"]) url.searchParams.delete(name);
    url.hash = "";
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }
  pendingLink = (async () => {
    try {
      if (urlError) return { user: null, recovery, error: recoveryErrorMessage({ message: urlError }) };
      const supabase = createClient();
      let recovered = recovery;
      if (tokenHash) {
        if (type !== "recovery" && type !== "invite") return { user: null, recovery: true, error: RECOVERY_INVALID };
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) return { user: null, recovery: true, error: recoveryErrorMessage(error) };
      } else if (accessToken || refreshToken) {
        if (!accessToken || !refreshToken || (type !== "recovery" && type !== "invite")) return { user: null, recovery, error: RECOVERY_INVALID };
        // Older/admin-issued links return tokens in the hash, even with an SSR/PKCE client.
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) return { user: null, recovery, error: recoveryErrorMessage(error) };
      } else if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code, { flowId });
        if (error) return { user: null, recovery, error: recoveryErrorMessage(error) };
        recovered = recovered || ("redirectType" in data && data.redirectType === "recovery");
      }
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return { user: null, recovery: recovered, error: recoveryErrorMessage(error) };
      return { user: data.user, recovery: recovered, error: null };
    } catch {
      return { user: null, recovery, error: "No pudimos conectar. Comprueba tu conexión y vuelve a abrir el enlace." };
    }
  })();
  const shared = pendingLink;
  void shared.finally(() => queueMicrotask(() => { if (pendingLink === shared) pendingLink = null; }));
  return shared;
}

export async function requestPasswordRecovery(email: string, next?: string | null): Promise<{ error: string | null }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) return { error: "Escribe el correo de tu cuenta." };
  try {
    const response = await fetchAuth("/api/auth/recover", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, ...(next ? { next: safeAuthRedirect(next, "/account") } : {}) }),
    });
    const data = await response.json();
    return { error: response.ok ? null : data.error || "No se pudo enviar el correo. Inténtalo más tarde." };
  } catch { return { error: "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo." }; }
}
