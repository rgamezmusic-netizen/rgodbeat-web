import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getISOWeek } from '@/lib/ranking/chart';
import { isUUID } from '@/lib/ranking/comments';

export const dynamic = 'force-dynamic';
const duplicate = () => NextResponse.json({ success: false, alreadyVoted: true,
  message: 'Ya votaste por este beat esta semana. Puedes volver a votar el próximo lunes.' }, { status: 409 });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
    const { id } = await params;
    if (!isUUID(id)) return NextResponse.json({ error: 'Beat no encontrado.' }, { status: 404 });
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión con tu cuenta de artista para votar.', requireLogin: true }, { status: 401 });
    const client = createAdminClient();
    const result = await client.rpc('cast_weekly_beat_vote', { p_user_id: user.id, p_beat_id: id });
    if (!result.error && result.data) {
      const vote = result.data as { alreadyVoted?: boolean; favorites?: number };
      if (vote.alreadyVoted) return duplicate();
      const weekly = await client.from('beat_votes').select('id', { count: 'exact', head: true }).eq('beat_id', id).eq('week_period', getISOWeek());
      return NextResponse.json({ success: true, alreadyVoted: false, favorites: vote.favorites, weeklyVotes: weekly.count ?? undefined,
        message: 'Tu voto ya cuenta en el Top 23 de esta semana.' });
    }
    if (result.error?.code === 'P0002') return NextResponse.json({ error: 'Beat no encontrado.' }, { status: 404 });
    if (result.error?.code !== 'PGRST202') throw new Error('No se pudo registrar el voto.');

    // Existing installation: votes remain authoritative. Never increment cached metrics
    // in JavaScript; concurrent writes lose votes. The migration installs an atomic RPC.
    const { data: beat, error: beatError } = await client.from('beats').select('id').eq('id', id).eq('published', true).maybeSingle();
    if (beatError) throw new Error('No se pudo consultar el beat.');
    if (!beat) return NextResponse.json({ error: 'Beat no encontrado.' }, { status: 404 });
    const week = getISOWeek();
    const { error } = await client.from('beat_votes').insert({ user_id: user.id, beat_id: id, week_period: week });
    if (error?.code === '23505') return duplicate();
    if (error) throw new Error('No se pudo registrar el voto.');
    const [count, weekly] = await Promise.all([
      client.from('beat_votes').select('id', { count: 'exact', head: true }).eq('beat_id', id),
      client.from('beat_votes').select('id', { count: 'exact', head: true }).eq('beat_id', id).eq('week_period', week),
    ]);
    // The vote is already committed; a count failure must not turn it into a failed vote.
    return NextResponse.json({ success: true, alreadyVoted: false, favorites: count.count ?? undefined, weeklyVotes: weekly.count ?? undefined,
      message: 'Tu voto ya cuenta en el Top 23 de esta semana.' });
  } catch (error) {
    console.error('[Voting API]', error);
    return NextResponse.json({ error: 'No se pudo registrar tu voto. Inténtalo de nuevo.' }, { status: 503 });
  }
}
