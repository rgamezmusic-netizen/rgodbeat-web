"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Supabase can fall back to the configured Site URL when the requested
 * redirect URL is not allowlisted. Recovery tokens then land on the home
 * page, where the auth client emits PASSWORD_RECOVERY. Send that session to
 * the password form instead of leaving the user on the storefront.
 */
export function RecoveryLinkRedirect() {
  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY" || window.location.pathname === "/reset-password") return;
      window.location.replace("/reset-password");
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
