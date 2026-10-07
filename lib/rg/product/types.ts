import type { RankingKind } from '@/lib/rg/phase2/engine';

export type PublicArtist = { id: string; stage_name: string; slug: string };
export type PublicTrack = { id: string; title: string; beat_id: string | null };
export type PublicBeat = { id: string; title: string; slug: string; coverUrl: string | null };
export type ChartEntry = {
  entityId: string; rank: number; score: number; previousRank: number | null;
  movement: number | null; isNew: boolean; onFire: false;
  track?: PublicTrack | null; artist?: PublicArtist | null; beat?: PublicBeat | null;
  rankedTrackCount?: number;
};
export type ChartData = {
  season: { id: string; season_number: number; name: string; starts_at: string; ends_at: string; status: string };
  serverTime: string; rewardPoolRg: number;
  rewards: Array<{ place: number; premiumDays: number; poolSharePercent: number }>;
  rewardTail?: { firstPlace: number; lastPlace: number; poolSharePercent: number };
  sponsors: Array<{ name: string; websiteUrl: string | null; logoUrl: string | null; tier: string }>;
  rankings: Record<RankingKind, ChartEntry[]>;
};
export type SeasonPerformance = { rank: number | null; score: number; movement: number | null; isNew: boolean; onFire: false };
export type ArtistProfile = {
  artist: PublicArtist & { bio: string | null }; performance: SeasonPerformance;
  tracks: Array<{ id: string; title: string }>;
  history: Array<{ seasonNumber: number; rank: number; score: number }>;
  seasonNumber: number;
};
export type TrackProfile = {
  track: PublicTrack; artist: PublicArtist; beat: PublicBeat | null;
  performance: SeasonPerformance; seasonNumber: number;
  publication: { url: string; publishedAt: string; viewCount: number | null; observedAt: string | null; milestoneCount: number } | null;
};
export type BeatProfile = {
  beat: PublicBeat; performance: SeasonPerformance; seasonNumber: number;
  tracks: ChartEntry[];
};
