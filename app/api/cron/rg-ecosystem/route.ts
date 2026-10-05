import { NextRequest, NextResponse } from 'next/server';
import { refreshRgYoutubeMilestones } from '@/lib/rg/phase2/youtube';
import { reconcileRgPublicationScores } from '@/lib/rg/phase2/publication-scores';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const db = createPhase2AdminClient();
    const now = new Date();
    const { data: activeSeasonId, error: seasonError } = await db.rpc('rg_ensure_seasons', { p_now: now.toISOString() });
    if (seasonError || !activeSeasonId) throw new Error('Season schedule could not be advanced.');
    const publications = await reconcileRgPublicationScores(now);
    let youtube: { checked: number; viewSnapshots: number; milestonesRecorded: number; connectionVerified: boolean } | null = null;
    let youtubeError = false;
    try { youtube = await refreshRgYoutubeMilestones(now); }
    catch (error) { youtubeError = true; console.error('[RG scheduled YouTube metrics]', error instanceof Error ? error.message : 'FAILED'); }
    if (youtubeError) throw new Error('YouTube metric verification failed; season finalization is deferred.');
    const { data: endedSeasons, error: endedError } = await db.from('rg_seasons').select('id')
      .eq('status', 'ended').lte('ends_at', now.toISOString());
    if (endedError) throw new Error('Ended seasons could not be loaded.');
    let finalized = 0;
    let failures = 0;
    for (const season of (endedSeasons ?? []) as Array<{ id: string }>) {
      const { error } = await db.rpc('rg_finalize_season', { p_season_id: season.id });
      if (!error) finalized++;
      else { failures++; console.error('[RG season finalization]', error.code || 'FAILED'); }
    }
    if (failures) throw new Error('One or more ended RG seasons failed to finalize.');
    const { error: snapshotError } = await db.rpc('rg_capture_rank_snapshot', { p_season_id: activeSeasonId, p_final: false });
    if (snapshotError) throw new Error('Season ranking snapshot could not be created.');
    return NextResponse.json({ success: true, seasonId: activeSeasonId, endedSeasonsFinalized: finalized, publications, youtube, youtubeMetricsAvailable: Boolean(youtube?.connectionVerified) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[RG ecosystem cron]', error instanceof Error ? error.message : 'UNKNOWN');
    return NextResponse.json({ error: 'RG ecosystem schedule could not complete.' }, { status: 503 });
  }
}
