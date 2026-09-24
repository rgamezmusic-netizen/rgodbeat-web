import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicStorageUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: beats, error } = await supabase
      .from("beats")
      .select(`
        id,
        title,
        slug,
        bpm,
        musical_key,
        duration_seconds,
        cover_path,
        preview_path,
        current_rank,
        ranking_status,
        performance_metrics,
        category:categories(name, slug)
      `)
      .eq("published", true)
      .in("ranking_status", ["active", "new"])
      .order("current_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(23);

    if (error) {
      console.error("[Ranking API] Error fetching ranking beats:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formattedBeats = (beats || []).map((b, index) => ({
      id: b.id,
      title: b.title,
      slug: b.slug,
      bpm: b.bpm || 140,
      key: b.musical_key || "C",
      duration: b.duration_seconds || 180,
      currentRank: b.current_rank || (index + 1),
      coverUrl: getPublicStorageUrl(b.cover_path),
      previewUrl: getPublicStorageUrl(b.preview_path),
      genre: (b.category as any)?.name || "Trap",
      favorites: (b.performance_metrics as any)?.favorites || 0,
      plays: (b.performance_metrics as any)?.plays || 0,
    }));

    return NextResponse.json({ beats: formattedBeats }, { status: 200 });
  } catch (err: any) {
    console.error("[Ranking API Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
