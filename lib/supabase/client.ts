import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const createClient = () => {
  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
};
