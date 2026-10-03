import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicChart } from '@/lib/ranking/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [chart, user] = await Promise.all([getPublicChart(), getCurrentUser()]);
    let userVotedBeatIds: string[] = [];
    if (user) {
      const { data, error } = await createAdminClient().from('beat_votes').select('beat_id')
        .eq('user_id', user.id).eq('week_period', chart.period);
      if (error) throw new Error('No se pudieron consultar tus votos.');
      userVotedBeatIds = (data ?? []).map(row => row.beat_id);
    }
    // Keep the Studio API contract while sharing the public weekly chart.
    const beats = chart.entries.map(({ beat, rank, previousRank, votes }) => ({
      id: beat.id, title: beat.title, slug: beat.slug, bpm: beat.bpm, key: beat.key,
      duration: beat.duration.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0),
      currentRank: rank, previousRank, performanceScore: beat.performanceScore ?? 0,
      coverUrl: /^(https?:|\/)/.test(beat.cover) ? beat.cover : null,
      previewUrl: beat.previewAudioUrl ?? null, genre: beat.genre,
      favorites: votes, plays: beat.performanceMetrics?.plays ?? 0,
    }));
    return NextResponse.json({ beats, chart, userVotedBeatIds, isLoggedIn: !!user }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[Ranking API]', error);
    return NextResponse.json({ error: 'No se pudo actualizar el ranking. Inténtalo de nuevo.' }, { status: 503 });
  }
}
