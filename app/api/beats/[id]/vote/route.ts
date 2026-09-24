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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: beatId } = await params;
    const user = await getCurrentUser();

    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Debes iniciar sesión con tu cuenta de artista para votar por un beat.", requireLogin: true },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const currentWeek = getIsoWeek();

    // 1. Check if user already voted for this beat in the current week
    const { data: existingVote } = await (supabase as any)
      .from("beat_votes")
      .select("id")
      .eq("user_id", user.id)
      .eq("beat_id", beatId)
      .eq("week_period", currentWeek)
      .maybeSingle();

    if (existingVote) {
      return NextResponse.json(
        {
          success: false,
          alreadyVoted: true,
          message: "Ya votaste por este beat en la semana actual. Podrás emitir un nuevo voto el próximo lunes.",
        },
        { status: 409 }
      );
    }

    // 2. Insert vote into audit table
    const { error: insertError } = await (supabase as any).from("beat_votes").insert({
      user_id: user.id,
      beat_id: beatId,
      week_period: currentWeek,
    });

    if (insertError && insertError.code !== "42P01") {
      console.warn("[Voting API] Warning inserting into beat_votes:", insertError.message);
    }

    // 3. Fetch current beat metrics to increment favorites
    const { data: beat, error: beatError } = await supabase
      .from("beats")
      .select("id, performance_metrics, performance_score")
      .eq("id", beatId)
      .maybeSingle();

    if (beatError || !beat) {
      return NextResponse.json(
        { error: "Beat no encontrado en el catálogo." },
        { status: 404 }
      );
    }

    const currentMetrics = (beat.performance_metrics as any) || {
      plays: 0,
      favorites: 0,
      cart_additions: 0,
      page_views: 0,
      sales_count: 0,
      revenue_usd: 0,
      conversion_rate: 0,
    };

    const newFavorites = (currentMetrics.favorites || 0) + 1;
    const updatedMetrics = {
      ...currentMetrics,
      favorites: newFavorites,
    };

    // Calculate score (plays*1 + favorites*5 + sales*20)
    const newScore =
      (updatedMetrics.plays || 0) * 1.0 +
      newFavorites * 5.0 +
      (updatedMetrics.sales_count || 0) * 20.0;

    await supabase
      .from("beats")
      .update({
        performance_metrics: updatedMetrics,
        performance_score: newScore,
      })
      .eq("id", beatId);

    return NextResponse.json(
      {
        success: true,
        alreadyVoted: false,
        favorites: newFavorites,
        message: "¡Voto registrado exitosamente en el ranking Top 23 de esta semana!",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[Voting API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Error al procesar el voto." },
      { status: 500 }
    );
  }
}
