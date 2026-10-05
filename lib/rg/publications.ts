import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { RG_UUID, RgIdentityError, validateOwnedTrackForPublication } from '@/lib/rg/identity';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';

export type LinkedPublicationInput = {
  userId: string;
  artistId: string;
  trackId: string;
  beatId: string | null;
  youtubeExportJobId: string;
  youtubeVideoId: string;
};

export type LinkedPublicationResult =
  | { linked: true; publicationId: string }
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
    // The Score event is a failure-isolated sidecar. A verified YouTube upload and
    // its Phase 1 publication link remain successful if Phase 2 is temporarily unavailable.
    try {
      const { error: scoreError } = await createPhase2AdminClient().rpc('rg_record_score_event', {
        p_event_type: 'TRACK_PUBLISHED',
        p_artist_id: input.artistId,
        p_track_id: input.trackId,
        p_beat_id: input.beatId,
        p_publication_id: data,
        p_source_type: 'rg_publication_link',
        p_source_id: data,
        p_milestone_key: null,
      });
      if (scoreError) console.error('[RG score event]', scoreError.code || 'TRACK_PUBLISHED_NOT_RECORDED');
    } catch (error) {
      console.error('[RG score event]', error instanceof Error ? error.name : 'TRACK_PUBLISHED_NOT_RECORDED');
    }
    return { linked: true, publicationId: data };
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
