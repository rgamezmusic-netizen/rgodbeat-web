import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { RG_UUID, RgIdentityError, validateOwnedTrackForPublication } from '@/lib/rg/identity';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';
import type { PublicationRewards } from './publication-rewards';

export type LinkedPublicationInput = {
  userId: string;
  artistId: string;
  trackId: string;
  beatId: string | null;
  youtubeExportJobId: string;
  youtubeVideoId: string;
};

export type LinkedPublicationResult =
  | { linked: true; publicationId: string; rewards: PublicationRewards }
  | { linked: false; error: string; code: string };

/**
 * This is an additive sidecar to the confirmed YouTube upload. It deliberately
 * returns a failure result instead of throwing, so RG table/API problems can
 * never turn a successful YouTube upload into a failed publication response.
 */
export async function recordConfirmedPublication(input: LinkedPublicationInput): Promise<LinkedPublicationResult> {
  try {
    await validateOwnedTrackForPublication(input.userId, input.artistId, input.trackId, input.beatId);
    const { data, error } = await createAdminClient().rpc('record_rg_publication_link', {
      p_user_id: input.userId,
      p_artist_id: input.artistId,
      p_track_id: input.trackId,
      p_beat_id: input.beatId,
      p_youtube_export_job_id: input.youtubeExportJobId,
      p_youtube_video_id: input.youtubeVideoId,
    });
    if (error || !data) {
      console.error('[RG publication link]', error?.code || 'NO_PUBLICATION_ID');
      return { linked: false, error: 'La publicación se confirmó, pero no se pudo vincular al RG Track. Puede reintentarse.', code: error?.code || 'NO_PUBLICATION_ID' };
    }
    // Score and utility issuance use the existing idempotent server RPCs. Never
    // retry the YouTube upload just because either accounting step is unavailable.
    const rewards: PublicationRewards = { score: 'pending', points: null, credits: 'pending', creditedRg: null, balanceRg: null };
    try {
      const db = createPhase2AdminClient();
      const award = await db.rpc('rg_reward_publication', { p_publication_id: data });
      if (award.error || !award.data || typeof award.data !== 'object') {
        console.error('[RG publication reward]', award.error?.code || 'REWARD_NOT_CONFIRMED');
      } else {
        const result = award.data as { status?: string; points?: number; creditedRg?: number };
        const validAward = result.status === 'awarded' && [23, 7, 4].includes(result.points!) && result.points === result.creditedRg;
        const validZero = ['limit_reached', 'duplicate_audio'].includes(result.status || '') && result.points === 0 && result.creditedRg === 0;
        const validLegacy = result.status === 'legacy' && Number.isSafeInteger(result.points) && result.points! >= 0 && result.creditedRg === 0;
        if (validAward || validZero || validLegacy) {
          rewards.score = 'recorded';
          rewards.points = Number.isSafeInteger(result.points) ? result.points! : 0;
          rewards.creditedRg = Number.isSafeInteger(result.creditedRg) ? result.creditedRg! : 0;
          rewards.credits = rewards.creditedRg > 0 ? 'credited' : 'not_awarded';
          rewards.reason = result.status as PublicationRewards['reason'];
          const balance = await db.from('rg_spendable_balances').select('balance_rg').eq('user_id', input.userId).maybeSingle();
          const balanceRg = Number((balance.data as { balance_rg?: number | string } | null)?.balance_rg ?? 0);
          if (!balance.error && balance.data && Number.isSafeInteger(balanceRg) && balanceRg >= 0) rewards.balanceRg = balanceRg;
        }
      }
    } catch (error) {
      console.error('[RG score event]', error instanceof Error ? error.name : 'TRACK_PUBLISHED_NOT_RECORDED');
    }
    return { linked: true, publicationId: data, rewards };
  } catch (error) {
    const code = error instanceof RgIdentityError ? error.code : 'RG_LINK_UNAVAILABLE';
    console.error('[RG publication link]', code);
    return { linked: false, error: 'La publicación se confirmó, pero no se pudo vincular al RG Track. Puede reintentarse.', code };
  }
}

export async function retryConfirmedPublicationLink(input: Omit<LinkedPublicationInput, 'youtubeVideoId'>): Promise<LinkedPublicationResult> {
  if (!RG_UUID.test(input.youtubeExportJobId)) {
    return { linked: false, error: 'No se encontró el trabajo de publicación.', code: 'YOUTUBE_JOB_NOT_FOUND' };
  }
  try {
    const { data: job, error } = await createAdminClient().from('youtube_export_jobs')
      .select('id,status,youtube_video_id').eq('id', input.youtubeExportJobId).eq('user_id', input.userId).maybeSingle();
    if (error || !job || job.status !== 'uploaded' || !job.youtube_video_id) {
      return { linked: false, error: 'No se encontró una publicación confirmada que pertenezca a esta cuenta.', code: error?.code || 'YOUTUBE_JOB_UNVERIFIED' };
    }
    return await recordConfirmedPublication({ ...input, youtubeVideoId: job.youtube_video_id });
  } catch (error) {
    const code = error instanceof RgIdentityError ? error.code : 'RG_LINK_UNAVAILABLE';
    console.error('[RG publication retry]', code);
    return { linked: false, error: 'No se pudo reintentar el vínculo RG. La publicación original sigue confirmada.', code };
  }
}
