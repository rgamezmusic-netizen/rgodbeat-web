import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { isYouTubeChannelAdmin } from '@/lib/youtube/config';
import { refreshRgYoutubeMilestones } from '@/lib/rg/phase2/youtube';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getCurrentUser();
  if (!isYouTubeChannelAdmin(user?.email)) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  try {
    const result = await refreshRgYoutubeMilestones();
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[RG YouTube metrics]', error instanceof Error ? error.message : 'UNKNOWN');
    return NextResponse.json({ error: 'No se pudieron actualizar las métricas RG de YouTube.' }, { status: 503 });
  }
}
