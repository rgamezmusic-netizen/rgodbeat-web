import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getISOWeek } from '@/lib/ranking/chart';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    const currentWeek = getISOWeek();
    if (!user) return NextResponse.json({ votedBeatIds: [], isLoggedIn: false, currentWeek }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
    const { data, error } = await createAdminClient().from('beat_votes').select('beat_id')
      .eq('user_id', user.id).eq('week_period', currentWeek);
    if (error) throw new Error('No se pudieron consultar los votos.');
    return NextResponse.json({ votedBeatIds: (data ?? []).map(row => row.beat_id), isLoggedIn: true, currentWeek }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudieron consultar tus votos.' }, { status: 503 });
  }
}
