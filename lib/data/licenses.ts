import { createClient } from "@/lib/supabase/server";
import { LicenseOption, LicenseTier } from "@/types";

// Standard formatting and feature inclusions by tier
const TIER_METADATA: Record<
  string,
  { format: string; features: string[]; recommended?: boolean }
> = {
  mp3: {
    format: "Untagged High-Quality MP3 (320kbps)",
    features: [
      "Untagged stereo audio file",
      "Up to 100,000 audio streams",
      "Distribution on Spotify & Apple Music",
      "1 Non-monetized music video",
    ],
  },
  wav: {
    format: "Uncompressed 24-Bit Master WAV + MP3",
    features: [
      "Master studio WAV file (24-bit/48kHz)",
      "Up to 500,000 audio streams",
      "2 Commercial music videos",
      "Monetized YouTube streaming allowed",
    ],
    recommended: true,
  },
  stems: {
    format: "Separated Multitrack WAV Stems + Master WAV",
    features: [
      "All individual drum, synth, bass & vocal stems",
      "Perfect for professional studio mixing & vocal tuning",
      "Up to 1,000,000 audio streams",
      "Radio broadcasting rights included",
    ],
  },
  unlimited: {
    format: "Full Master WAV + All Stems (No Caps)",
    features: [
      "Unlimited commercial audio streams",
      "Unlimited physical & digital sales",
      "Unlimited music videos & radio airplay",
      "For-profit live performance rights",
    ],
  },
  exclusive: {
    format: "Full Ownership Transfer & Master Copyright",
    features: [
      "Sole ownership transferred directly to you",
      "Beat permanently removed from store",
      "Unlimited sync, streaming & physical distribution",
      "Official signed contract agreement",
    ],
  },
};

/**
 * Fetch all active license types from Supabase
 */
export async function getLicenseTypes(): Promise<LicenseOption[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("license_types")
      .select("id, name, slug, description, price, sort_order, active")
      .eq("active", true)
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
