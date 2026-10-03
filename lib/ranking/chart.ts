import type { Beat } from '@/types';

export interface BeatActivity { beat_id: string; week_period: string; votes: number }
export interface RankedBeat { beat: Beat; rank: number; votes: number; previousRank: number | null; comments: number }
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

export function buildChart(beats: Beat[], activity: BeatActivity[], comments: Record<string, number>, commentsReady: boolean, now = new Date()): ChartSnapshot {
  const { period, previousPeriod, nextResetAt } = chartPeriods(now);
  const current = new Map<string, number>();
  const previous = new Map<string, number>();
  for (const row of activity) {
    const target = row.week_period === period ? current : row.week_period === previousPeriod ? previous : null;
    if (target) target.set(row.beat_id, (target.get(row.beat_id) ?? 0) + Number(row.votes));
  }
  // Ranking membership never changes publication, identity, file paths or purchases.
  const published = beats.filter(beat => beat.published !== false);
  const compare = (counts: Map<string, number>) => (a: Beat, b: Beat) =>
    (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || (b.releasedAt ?? b.createdAt).localeCompare(a.releasedAt ?? a.createdAt) || a.id.localeCompare(b.id);
  const previousRanks = new Map([...published].filter(beat => (previous.get(beat.id) ?? 0) > 0)
    .sort(compare(previous)).slice(0, 23).map((beat, index) => [beat.id, index + 1]));
  const ordered = [...published].sort(compare(current)).map((beat, index) => ({
    beat, rank: index + 1, votes: current.get(beat.id) ?? 0,
    previousRank: previousRanks.get(beat.id) ?? null, comments: comments[beat.id] ?? 0,
  }));
  return { entries: ordered.slice(0, 23), outside: ordered.slice(23), period,
    totalVotes: ordered.reduce((total, entry) => total + entry.votes, 0),
    commentsReady, generatedAt: now.toISOString(), nextResetAt };
}
