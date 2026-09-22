import "server-only";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

export const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey || supabaseServiceRoleKey.includes("your-supabase-service-role")) {
    throw new Error(
      "[Supabase Admin] SUPABASE_SERVICE_ROLE_KEY is not configured or is using placeholder in .env.local. Please provide your Supabase service_role secret."
    );
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
