import { createClient } from "@/lib/supabase/server";
import { LicenseOption, LicenseTier } from "@/types";

// Standard formatting and feature inclusions by tier
const TIER_METADATA: Record<
  string,
  { format: string; features: string[]; recommended?: boolean }
> = {
  mp3: {
    format: "MP3 (320 kbps)",
    features: [
      "Non-Exclusive",
      "MP3 320 kbps",
    ],
  },
  wav: {
    format: "MP3 320 kbps + WAV 24-bit / 48 kHz",
    features: [
      "Non-Exclusive",
      "MP3 320 kbps",
      "WAV 24-bit / 48 kHz",
    ],
    recommended: true,
  },
  unlimited: {
    format: "MP3 + WAV + Stems on Request",
    features: [
      "Non-Exclusive",
      "MP3",
      "WAV",
      "Includes access to grouped stems upon request",
    ],
  },
  exclusive: {
    format: "Exclusive Ownership + Full Masters",
    features: [
      "Exclusive",
      "MP3",
      "WAV",
      "Includes access to grouped stems upon request",
    ],
  },
};

/**
 * Fetch all active license types from Supabase (excluding standalone stems)
 */
export async function getLicenseTypes(): Promise<LicenseOption[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("license_types")
      .select("id, name, slug, description, price, sort_order, active")
      .eq("active", true)
      .neq("slug", "stems")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[Licenses] Error fetching license types:", error.message);
      throw new Error(`Failed to load license types: ${error.message}`);
    }

    const rows = (data as any[]) || [];
    return rows.map((lt) => {
      const tier = lt.slug as LicenseTier;
      const meta = TIER_METADATA[tier] || {
        format: lt.description || lt.name,
        features: ["Standard commercial distribution", "Stereo master output"],
      };

      return {
        id: lt.id,
        slug: tier,
        name: lt.name,
        price: Number(lt.price),
        format: meta.format,
        features: meta.features,
        recommended: meta.recommended,
      };
    });
  } catch (err: any) {
    console.error("[Licenses] Unexpected error:", err.message);
    throw err;
  }
}

/**
 * Fetch active beat licenses for a given beat ID
 */
export async function getBeatLicenses(beatId: string): Promise<Record<LicenseTier, number>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("beat_licenses")
      .select(`
        price_override,
        license_type:license_types(slug, price)
      `)
      .eq("beat_id", beatId)
      .eq("active", true);

    if (error) {
      console.error("[Licenses] Error fetching beat licenses:", error.message);
      throw new Error(`Failed to load beat licenses: ${error.message}`);
    }

    const pricing: Partial<Record<LicenseTier, number>> = {};

    (data || []).forEach((row: any) => {
      const lt = row.license_type;
      if (!lt || !lt.slug) return;
      const tier = lt.slug as LicenseTier;
      const finalPrice = row.price_override !== null && row.price_override !== undefined
        ? Number(row.price_override)
        : Number(lt.price);
      pricing[tier] = finalPrice;
    });

    return pricing as Record<LicenseTier, number>;
  } catch (err: any) {
    console.error("[Licenses] Unexpected error:", err.message);
    throw err;
  }
}
