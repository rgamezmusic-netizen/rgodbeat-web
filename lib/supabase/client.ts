import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";
import { fetchAuth } from "@/lib/auth/request";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const createClient = () => {
  return createBrowserClient<Database>(supabaseUrl, supabaseKey, {
    global: { fetch: fetchAuth },
    auth: {
      // RecoveryLinkRedirect/ResetPasswordForm exchange these links explicitly.
      // This also accepts older implicit recovery links with our SSR/PKCE storage.
      detectSessionInUrl: (url, params) => url.pathname !== "/reset-password" &&
        !params.code && !params.token_hash && params.type !== "recovery" && params.type !== "invite",
    },
  });
};
