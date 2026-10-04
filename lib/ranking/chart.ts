import type { Beat } from '@/types';

export interface BeatActivity { beat_id: string; week_period: string; votes: number }
export interface CommentActivity { beat_id: string; week_period: string; comments: number }
export interface RankedBeat { beat: Beat; rank: number; votes: number; points: number; previousRank: number | null; comments: number }
export interface ChartSnapshot {
  entries: RankedBeat[];
  outside: RankedBeat[];
  period: string;
  totalVotes: number;
  commentsReady: boolean;
  generatedAt: string;
  nextResetAt: string;
}

export function getISOWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function chartPeriods(now = new Date()) {
  const previous = new Date(now.getTime() - 7 * 86400000);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + (8 - (next.getUTCDay() || 7)));
  return { period: getISOWeek(now), previousPeriod: getISOWeek(previous), nextResetAt: next.toISOString() };
}

export function buildChart(beats: Beat[], activity: BeatActivity[], weeklyComments: CommentActivity[], comments: Record<string, number>, commentsReady: boolean, now = new Date()): ChartSnapshot {
  const { period, previousPeriod, nextResetAt } = chartPeriods(now);
  const current = new Map<string, number>();
  const previous = new Map<string, number>();
  const currentCommentPoints = new Map<string, number>();
  const previousCommentPoints = new Map<string, number>();
  for (const row of activity) {
    const target = row.week_period === period ? current : row.week_period === previousPeriod ? previous : null;
    if (target) target.set(row.beat_id, (target.get(row.beat_id) ?? 0) + Number(row.votes));
  }
  for (const row of weeklyComments) {
    const target = row.week_period === period ? currentCommentPoints : row.week_period === previousPeriod ? previousCommentPoints : null;
    if (target) target.set(row.beat_id, (target.get(row.beat_id) ?? 0) + Number(row.comments));
  }
  const points = (beatId: string, votes: Map<string, number>, commentsByWeek: Map<string, number>) =>
    (votes.get(beatId) ?? 0) * 5 + (commentsByWeek.get(beatId) ?? 0);
  const currentPoints = new Map([...new Set([...current.keys(), ...currentCommentPoints.keys()])]
    .map(id => [id, points(id, current, currentCommentPoints)]));
  const previousPoints = new Map([...new Set([...previous.keys(), ...previousCommentPoints.keys()])]
    .map(id => [id, points(id, previous, previousCommentPoints)]));
  // Ranking membership never changes publication, identity, file paths or purchases.
  const published = beats.filter(beat => beat.published !== false);
  const compare = (scores: Map<string, number>, votes: Map<string, number>) => (a: Beat, b: Beat) =>
    (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0) || (b.releasedAt ?? b.createdAt).localeCompare(a.releasedAt ?? a.createdAt) || a.id.localeCompare(b.id);
  const previousRanks = new Map([...published].filter(beat => (previousPoints.get(beat.id) ?? 0) > 0)
    .sort(compare(previousPoints, previous)).slice(0, 23).map((beat, index) => [beat.id, index + 1]));
  const ordered = [...published].sort(compare(currentPoints, current)).map((beat, index) => ({
    beat, rank: index + 1, votes: current.get(beat.id) ?? 0, points: currentPoints.get(beat.id) ?? 0,
    previousRank: previousRanks.get(beat.id) ?? null, comments: comments[beat.id] ?? 0,
  }));
  return { entries: ordered.slice(0, 23), outside: ordered.slice(23), period,
    totalVotes: ordered.reduce((total, entry) => total + entry.votes, 0),
    commentsReady, generatedAt: now.toISOString(), nextResetAt };
}
