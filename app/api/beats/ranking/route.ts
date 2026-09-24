import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getPublicStorageUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

function getIsoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Fetch top published beats ordered by performance_score (likes/votes + plays + sales)
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
        performance_score,
        ranking_status,
        performance_metrics,
        category:categories(name, slug)
      `)
      .eq("published", true)
      .order("performance_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(23);

    if (error) {
      console.error("[Ranking API] Error fetching ranking beats:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. Check if current user is logged in to return their weekly votes
    let userVotedBeatIds: string[] = [];
    try {
      const user = await getCurrentUser();
      if (user && user.id) {
        const currentWeek = getIsoWeek();
        const { data: userVotes } = await (supabase as any)
          .from("beat_votes")
          .select("beat_id")
          .eq("user_id", user.id)
          .eq("week_period", currentWeek);

        if (userVotes) {
          userVotedBeatIds = userVotes.map((v: any) => v.beat_id);
        }
      }
    } catch {
      // Unauthenticated, continue
    }

    const formattedBeats = (beats || []).map((b, index) => ({
      id: b.id,
      title: b.title,
      slug: b.slug,
      bpm: b.bpm || 140,
      key: b.musical_key || "C",
      duration: b.duration_seconds || 180,
      currentRank: index + 1,
      performanceScore: Number(b.performance_score || 0),
      coverUrl: getPublicStorageUrl(b.cover_path),
      previewUrl: getPublicStorageUrl(b.preview_path),
      genre: (b.category as any)?.name || "Trap",
      favorites: (b.performance_metrics as any)?.favorites || 0,
      plays: (b.performance_metrics as any)?.plays || 0,
    }));

    return NextResponse.json(
      {
        beats: formattedBeats,
        userVotedBeatIds,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[Ranking API Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
