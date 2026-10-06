"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasAuthLinkParameters, hasPendingAuthRecovery, RECOVERY_SESSION_MARKER, resolveAuthRecovery } from "@/lib/auth/recovery";

/** Handles links that land on the Site URL when Supabase rejects a redirect URL. */
export function RecoveryLinkRedirect() {
  useEffect(() => {
    if (window.location.pathname === "/reset-password") return;
    let active = true;
    const url = new URL(window.location.href);
    const processing = hasAuthLinkParameters(url) || hasPendingAuthRecovery();
    if (processing) {
      void resolveAuthRecovery().then(result => {
        if (!active) return;
        if (result.recovery || result.error) {
          const target = new URL("/reset-password", window.location.origin);
          if (url.searchParams.get("next")) target.searchParams.set("next", url.searchParams.get("next")!);
          if (result.error) target.searchParams.set("error", "invalid_link");
          window.location.replace(`${target.pathname}${target.search}`);
        }
      });
    }
    const { data } = createClient().auth.onAuthStateChange(event => {
      if (event === "PASSWORD_RECOVERY" && active && !processing) {
        try { window.sessionStorage.setItem(RECOVERY_SESSION_MARKER, "1"); } catch { /* Keep URL-token recovery available without storage. */ }
        window.location.replace("/reset-password");
      }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return null;
}
