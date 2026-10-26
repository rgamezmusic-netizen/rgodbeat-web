import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";
import { fetchSupabaseAuth } from "@/lib/auth/request";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

export const createClient = () => {
  const { url, key } = requireSupabasePublicConfig();
  return createBrowserClient<Database>(url, key, {
    global: { fetch: fetchSupabaseAuth },
    auth: {
      // RecoveryLinkRedirect/ResetPasswordForm exchange these links explicitly.
      // This also accepts older implicit recovery links with our SSR/PKCE storage.
      detectSessionInUrl: (url, params) => url.pathname !== "/reset-password" &&
        !params.code && !params.token_hash && params.type !== "recovery" && params.type !== "invite",
    },
  });
};
