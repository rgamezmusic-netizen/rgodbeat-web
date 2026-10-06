import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/** Commerce tables/RPCs are newer than the checked-in generated Supabase schema. */
export function createCommerceAdminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}
