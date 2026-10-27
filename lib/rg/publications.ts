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
      const { data: scoreId, error: scoreError } = await db.rpc('rg_record_score_event', {
        p_event_type: 'TRACK_PUBLISHED',
        p_artist_id: input.artistId,
        p_track_id: input.trackId,
        p_beat_id: input.beatId,
        p_publication_id: data,
        p_source_type: 'rg_publication_link',
        p_source_id: data,
        p_milestone_key: null,
      });
      if (scoreError || typeof scoreId !== 'string') {
        console.error('[RG score event]', scoreError?.code || 'TRACK_PUBLISHED_NOT_RECORDED');
      } else {
        const score = await db.from('rg_score_events').select('score_points').eq('id', scoreId)
          .eq('track_id', input.trackId).eq('artist_id', input.artistId).maybeSingle();
        const points = Number((score.data as { score_points?: number } | null)?.score_points);
        if (!score.error && Number.isSafeInteger(points) && points > 0) {
          rewards.score = 'recorded';
          rewards.points = points;
          const award = await db.rpc('rg_award_verified_activity', { p_score_event_id: scoreId });
          if (award.error) {
            if (award.error.code === 'PGRST202') rewards.credits = 'unavailable';
            console.error('[RG publication credit]', award.error.code || 'CREDIT_NOT_CONFIRMED');
          } else if (typeof award.data === 'string') {
            const ledger = await db.from('rg_coin_ledger').select('amount').eq('id', award.data)
              .eq('user_id', input.userId).eq('source_type', 'verified_activity').eq('source_id', scoreId).maybeSingle();
            const amount = Number((ledger.data as { amount?: number | string } | null)?.amount);
            if (!ledger.error && Number.isSafeInteger(amount) && amount > 0) {
              rewards.credits = 'credited';
              rewards.creditedRg = amount;
              const balance = await db.from('rg_spendable_balances').select('balance_rg').eq('user_id', input.userId).maybeSingle();
              const balanceRg = Number((balance.data as { balance_rg?: number | string } | null)?.balance_rg);
              if (!balance.error && balance.data && Number.isSafeInteger(balanceRg) && balanceRg >= 0) rewards.balanceRg = balanceRg;
            }
          } else rewards.credits = 'not_awarded';
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
