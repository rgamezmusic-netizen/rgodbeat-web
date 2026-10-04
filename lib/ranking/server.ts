import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublishedBeats } from '@/lib/data/beats';
import { buildChart, chartPeriods, type BeatActivity, type CommentActivity } from './chart';

export const getPublicChart = cache(async () => {
  const now = new Date();
  const { period, previousPeriod } = chartPeriods(now);
  const client = createAdminClient();
  const [beats, { data, error }] = await Promise.all([
    getPublishedBeats(),
    client.rpc('get_public_beat_activity', { p_week: period, p_previous_week: previousPeriod }),
  ]);
  if (!error && data) {
    const result = data as unknown as { votes: BeatActivity[]; comments: Record<string, number>; commentsByWeek: CommentActivity[] };
    return buildChart(beats, result.votes ?? [], result.commentsByWeek ?? [], result.comments ?? {}, true, now);
  }
  if (error && error.code !== 'PGRST202') throw new Error('No se pudo consultar la actividad del ranking.');
  // Compatibility with the currently installed schema until the additive migration is applied.
  const counts = new Map<string, BeatActivity>();
  for (let offset = 0; ; offset += 1000) {
    const result = await client.from('beat_votes').select('beat_id, week_period')
      .in('week_period', [period, previousPeriod]).order('id').range(offset, offset + 999);
    if (result.error) throw new Error('No se pudieron consultar los votos del ranking.');
    for (const vote of result.data ?? []) {
      const key = `${vote.beat_id}:${vote.week_period}`;
      const row = counts.get(key) ?? { ...vote, votes: 0 };
      row.votes++; counts.set(key, row);
    }
    if ((result.data?.length ?? 0) < 1000) break;
  }
  const comments: Record<string, number> = {};
  let commentsReady = true;
  for (let offset = 0; ; offset += 1000) {
    const result = await client.from('beat_comments').select('beat_id').eq('is_hidden', false)
      .order('id').range(offset, offset + 999);
    if (result.error) {
      if (result.error.code !== 'PGRST205' && result.error.code !== '42P01') throw new Error('No se pudo consultar la conversación.');
      commentsReady = false; break;
    }
    for (const row of result.data ?? []) comments[row.beat_id] = (comments[row.beat_id] ?? 0) + 1;
    if ((result.data?.length ?? 0) < 1000) break;
  }
  return buildChart(beats, [...counts.values()], [], comments, commentsReady, now);
});
