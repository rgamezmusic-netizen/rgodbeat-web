import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Beat, Genre, Mood, LicenseTier, BeatEditData, PerformanceMetrics } from "@/types";
import { getPublicStorageUrl } from "@/lib/storage";

export type { BeatEditData };

const GENRE_GRADIENTS: Record<string, string> = {
  trap: "from-[#1d102e] via-[#121018] to-[#09080d]",
  reggaeton: "from-[#0f1d2e] via-[#10131a] to-[#09090d]",
  rnb: "from-[#1b1228] via-[#121018] to-[#09080d]",
  afrobeat: "from-[#241a10] via-[#161310] to-[#09080d]",
  house: "from-[#0d1e28] via-[#10141a] to-[#09090d]",
  hiphop: "from-[#19152a] via-[#12111a] to-[#09080d]",
  drill: "from-[#1d0e14] via-[#140f12] to-[#09080d]",
  pop: "from-[#1b2612] via-[#141910] to-[#09090d]",
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "3:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function mapBeatRowToBeat(row: any): Beat {
  const genreSlug = (row.category?.slug || "trap").toLowerCase() as Genre;
  const pricing: Record<LicenseTier, number> = {
    mp3: 29,
    wav: 49,
    stems: 99,
    unlimited: 199,
    exclusive: 499,
  };

  if (row.beat_licenses && Array.isArray(row.beat_licenses)) {
    row.beat_licenses.forEach((bl: any) => {
      const slug = bl.license_type?.slug as LicenseTier;
      if (slug && pricing[slug] !== undefined) {
        pricing[slug] = bl.price_override !== null && bl.price_override !== undefined
          ? Number(bl.price_override)
          : Number(bl.license_type?.price || pricing[slug]);
      }
    });
  }

  const durationStr = formatDuration(row.duration_seconds);
  const coverStyle = GENRE_GRADIENTS[genreSlug] || "from-[#1d102e] via-[#121018] to-[#09080d]";

  // Generate tags from description / title / mood / genre
  const tags: string[] = [
    row.mood || "Atmospheric",
    genreSlug.toUpperCase(),
    `${row.bpm || 140} BPM`,
    "Studio Master",
  ];

  const resolvedCoverUrl = getPublicStorageUrl(row.cover_path);
  const resolvedPreviewUrl = getPublicStorageUrl(row.preview_path);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || undefined,
    genre: genreSlug,
    mood: (row.mood as Mood) || "Dark",
    bpm: row.bpm || 140,
    key: row.musical_key || "C",
    duration: durationStr,
    price: pricing.mp3,
    cover: resolvedCoverUrl || coverStyle,
    featured: Boolean(row.featured),
    published: Boolean(row.published),
    createdAt: row.created_at ? new Date(row.created_at).toISOString().split("T")[0] : "2026-03-20",
    tags,
    pricing,
    previewAudioUrl: resolvedPreviewUrl || undefined,
    rankingStatus: row.ranking_status || (row.published ? "active" : "draft"),
    currentRank: row.current_rank !== null && row.current_rank !== undefined ? Number(row.current_rank) : null,
    previousRank: row.previous_rank !== null && row.previous_rank !== undefined ? Number(row.previous_rank) : null,
    rankingPeriod: row.ranking_period || null,
    poolEntryDate: row.pool_entry_date || null,
    daysInPool: row.days_in_pool || 0,
    performanceScore: row.performance_score !== null && row.performance_score !== undefined ? Number(row.performance_score) : 0,
    performanceMetrics: row.performance_metrics || undefined,
    localSyncStatus: row.local_sync_status || "pending",
    localArchivePath: row.local_archive_path || null,
    lastSyncedAt: row.last_synced_at || null,
    onlineAssetStatus: row.online_asset_status || "ready",
  };
}

/**
 * Fetch all published beats with categories and license pricing from Supabase
 */
export async function getPublishedBeats(): Promise<Beat[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("beats")
      .select(`
        id,
        title,
        slug,
        description,
        mood,
        bpm,
        musical_key,
        duration_seconds,
        cover_path,
        preview_path,
        featured,
        published,
        created_at,
        category:categories(name, slug),
        beat_licenses(
          price_override,
          license_type:license_types(slug, price)
        )
      `)
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Beats] Error fetching published beats:", error.message);
      throw new Error(`Failed to load beats: ${error.message}`);
    }

    return (data || []).map(mapBeatRowToBeat);
  } catch (err: any) {
    console.error("[Beats] Unexpected error:", err.message);
    throw err;
  }
}

/**
 * Fetch a single published beat by slug with full details
 */
export async function getBeatBySlug(slug: string): Promise<Beat | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("beats")
      .select(`
        id,
        title,
        slug,
        description,
        mood,
        bpm,
        musical_key,
        duration_seconds,
        cover_path,
        preview_path,
        featured,
        published,
        created_at,
        category:categories(name, slug),
        beat_licenses(
          price_override,
          license_type:license_types(slug, price)
        )
      `)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (error) {
      console.error(`[Beats] Error fetching beat with slug "${slug}":`, error.message);
      throw new Error(`Failed to load beat: ${error.message}`);
    }

    if (!data) return null;
    return mapBeatRowToBeat(data);
  } catch (err: any) {
    console.error("[Beats] Unexpected error:", err.message);
    throw err;
  }
}

/**
 * Fetch featured published beats for homepage or recommendations
 */
export async function getFeaturedBeats(limit = 6): Promise<Beat[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("beats")
      .select(`
        id,
        title,
        slug,
        description,
        mood,
        bpm,
        musical_key,
        duration_seconds,
        cover_path,
        preview_path,
        featured,
        published,
        created_at,
        category:categories(name, slug),
        beat_licenses(
          price_override,
          license_type:license_types(slug, price)
        )
      `)
      .eq("published", true)
      .eq("featured", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Beats] Error fetching featured beats:", error.message);
      throw new Error(`Failed to load featured beats: ${error.message}`);
    }

    return (data || []).map(mapBeatRowToBeat);
  } catch (err: any) {
    console.error("[Beats] Unexpected error:", err.message);
    throw err;
  }
}

/**
 * Fetch all beats (both published and draft) for the Admin CMS
 */
export async function getAllBeats(): Promise<Beat[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("beats")
      .select(`
        id,
        title,
        slug,
        description,
        mood,
        bpm,
        musical_key,
        duration_seconds,
        cover_path,
        preview_path,
        featured,
        published,
        created_at,
        category:categories(name, slug),
        beat_licenses(
          price_override,
          license_type:license_types(slug, price)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Beats] Error fetching all beats for admin:", error.message);
      throw new Error(`Failed to load admin beats: ${error.message}`);
    }

    return (data || []).map(mapBeatRowToBeat);
  } catch (err: any) {
    console.error("[Beats] Unexpected error in getAllBeats:", err.message);
    throw err;
  }
}

/**
 * Fetch a beat by ID with all relations for administrative editing
 */
export async function getBeatForEdit(id: string): Promise<BeatEditData | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("beats")
      .select(`
        id,
        title,
        slug,
        description,
        genre_id,
        mood,
        bpm,
        musical_key,
        duration_seconds,
        cover_path,
        preview_path,
        featured,
        published,
        ranking_status,
        current_rank,
        previous_rank,
        ranking_period,
        pool_entry_date,
        days_in_pool,
        performance_score,
        performance_metrics,
        local_sync_status,
        local_archive_path,
        last_synced_at,
        online_asset_status,
        beat_files(id, file_type, storage_path, file_name, file_size),
        beat_licenses(license_type_id, price_override, active, license_type:license_types(slug, price))
      `)
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("[Beats] Error fetching beat for edit:", error.message);
      return null;
    }

    const wavFileRow = Array.isArray(data.beat_files)
      ? data.beat_files.find((f: any) => f.file_type === "wav")
      : null;

    const licenses = Array.isArray(data.beat_licenses)
      ? data.beat_licenses.map((bl: any) => ({
          license_type_id: bl.license_type_id,
          slug: bl.license_type?.slug || "",
          price_override: bl.price_override !== null ? Number(bl.price_override) : null,
          active: bl.active,
        }))
      : [];

    return {
      id: data.id,
      title: data.title,
      slug: data.slug,
      description: data.description,
      genre_id: data.genre_id,
      mood: data.mood,
      bpm: data.bpm,
      musical_key: data.musical_key,
      duration_seconds: data.duration_seconds,
      featured: data.featured,
      published: data.published,
      cover_path: data.cover_path,
      cover_url: getPublicStorageUrl(data.cover_path),
      preview_path: data.preview_path,
      preview_url: getPublicStorageUrl(data.preview_path),
      ranking_status: data.ranking_status || (data.published ? "active" : "draft"),
      current_rank: data.current_rank !== null && data.current_rank !== undefined ? Number(data.current_rank) : null,
      previous_rank: data.previous_rank !== null && data.previous_rank !== undefined ? Number(data.previous_rank) : null,
      ranking_period: data.ranking_period || null,
      pool_entry_date: data.pool_entry_date || null,
      days_in_pool: data.days_in_pool || 0,
      performance_score: data.performance_score !== null && data.performance_score !== undefined ? Number(data.performance_score) : 0,
      performance_metrics: (data.performance_metrics as unknown as PerformanceMetrics) || undefined,
      local_sync_status: data.local_sync_status || "pending",
      local_archive_path: data.local_archive_path || null,
      last_synced_at: data.last_synced_at || null,
      online_asset_status: data.online_asset_status || "ready",
      wav_file: wavFileRow
        ? {
            id: wavFileRow.id,
            file_name: wavFileRow.file_name,
            storage_path: wavFileRow.storage_path,
            file_size: wavFileRow.file_size,
          }
        : null,
      licenses,
    };
  } catch (err: any) {
    console.error("[Beats] Unexpected error in getBeatForEdit:", err.message);
    throw err;
  }
}
