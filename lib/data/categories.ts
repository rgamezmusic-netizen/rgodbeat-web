import { createClient } from "@/lib/supabase/server";
import { CategoryRow } from "@/types/database";

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * Fetch all categories from Supabase
 */
export async function getCategories(): Promise<CategoryItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description")
      .order("name", { ascending: true });

    if (error) {
      console.error("[Categories] Error fetching categories:", error.message);
      throw new Error(`Failed to load categories: ${error.message}`);
    }

    return (data as CategoryItem[]) || [];
  } catch (err: any) {
    console.error("[Categories] Unexpected error:", err.message);
    throw err;
  }
}
