export type YoutubeMetric = {
  videoId: string;
  viewCount: number;
  likeCount: number | null;
  publishedAt: string | null;
  uploadStatus: string;
};

function count(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Missing/deleted videos, foreign channels and invalid statistics never become zero-view evidence. */
export function parseYoutubeMetrics(payload: unknown, channelId: string): YoutubeMetric[] {
  if (!payload || typeof payload !== 'object' || !('items' in payload) || !Array.isArray(payload.items)) throw new Error('Invalid YouTube statistics response.');
  return payload.items.flatMap((item): YoutubeMetric[] => {
    if (!item || typeof item.id !== 'string' || item.snippet?.channelId !== channelId || item.status?.uploadStatus !== 'processed') return [];
    const viewCount = count(item.statistics?.viewCount);
    if (viewCount === null) return [];
    return [{ videoId: item.id, viewCount, likeCount: count(item.statistics?.likeCount),
      publishedAt: typeof item.snippet?.publishedAt === 'string' && Number.isFinite(Date.parse(item.snippet.publishedAt)) ? item.snippet.publishedAt : null,
      uploadStatus: item.status.uploadStatus }];
  });
}

export type VerifiedViewObservation = { view_count: number | string; captured_at: string; observed_day: string };

/** Replays persisted crossings after temporary Score failures, within the same competitive season. */
export function youtubeMilestoneEvidence(observations: VerifiedViewObservation[], rules: Record<string, { points: number }>, startsAt: string, endsAt: string) {
  const ordered = [...observations].sort((a, b) => a.observed_day.localeCompare(b.observed_day));
  let maximum: number | null = null;
  const events: Array<{ milestone: string; viewCount: number; verifiedAt: string }> = [];
  for (const observation of ordered) {
    const views = Number(observation.view_count);
    if (!Number.isSafeInteger(views) || views < 0) continue;
    if (maximum !== null && Date.parse(observation.captured_at) >= Date.parse(startsAt) && Date.parse(observation.captured_at) < Date.parse(endsAt)) {
      for (const [milestone, rule] of Object.entries(rules)) {
        if (Number(milestone) > maximum && Number(milestone) <= views && Number.isSafeInteger(rule.points) && rule.points > 0) {
          events.push({ milestone, viewCount: views, verifiedAt: observation.captured_at });
        }
      }
    }
    maximum = Math.max(maximum ?? views, views);
  }
  return events;
}
