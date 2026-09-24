import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return NextResponse.json({ votedBeatIds: [], isLoggedIn: false });
    }

    const currentWeek = getIsoWeek();
    const supabase = createAdminClient();

    const { data: votes, error } = await (supabase as any)
      .from("beat_votes")
      .select("beat_id")
      .eq("user_id", user.id)
      .eq("week_period", currentWeek);

    if (error) {
      console.warn("[Votes API] Error fetching user votes:", error.message);
      return NextResponse.json({ votedBeatIds: [], isLoggedIn: true });
    }

    const votedBeatIds = (votes || []).map((v: any) => v.beat_id);
    return NextResponse.json({
      votedBeatIds,
      isLoggedIn: true,
      currentWeek,
    });
  } catch (err: any) {
    return NextResponse.json({ votedBeatIds: [], error: err.message }, { status: 500 });
  }
}
