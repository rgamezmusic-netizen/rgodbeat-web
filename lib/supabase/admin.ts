import "server-only";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { requireSupabaseUrl } from "@/lib/supabase/config";

export const createAdminClient = () => {
  const supabaseUrl = requireSupabaseUrl();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey || supabaseServiceRoleKey.includes("your-supabase-service-role")) {
    throw new Error(
      "[Supabase Admin] El servicio administrativo de Supabase no está configurado para este entorno."
    );
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
