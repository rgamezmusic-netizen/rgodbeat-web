/**
 * RGODBEAT 2.0 - Core Type Definitions
 */

export type Genre =
  | "trap"
  | "rnb"
  | "reggaeton"
  | "afrobeat"
  | "house"
  | "hiphop"
  | "pop"
  | "drill"
  | "country";

export type Mood =
  | "Dark"
  | "Melodic"
  | "Energetic"
  | "Atmospheric"
  | "Aggressive"
  | "Chill"
  | "Romantic"
  | "Epic"
  | "Soulful";

export type LicenseTier =
  | "mp3"
  | "wav"
  | "stems"
  | "unlimited"
  | "exclusive";

export interface LicenseOption {
  id: string;
  name: string;
  slug: LicenseTier | string;
  price: number;
  format: string;
  features: string[];
  recommended?: boolean;
}

export type RankingStatus = "draft" | "new" | "active" | "archived";
export type LocalSyncStatus = "pending" | "synced" | "failed";
export type OnlineAssetStatus = "ready" | "archived" | "purged";

export interface PerformanceMetrics {
  plays: number;
  favorites: number;
  cart_additions: number;
  page_views: number;
  sales_count: number;
  revenue_usd: number;
  conversion_rate: number;
}

export interface Beat {
  id: string;
  slug: string;
  title: string;
  description?: string;
  genre: Genre;
  mood: Mood;
  bpm: number;
  key: string;
  duration: string;
  price: number; // Base MP3 price
  cover: string; // Gradient style or artwork path
  featured: boolean;
  published?: boolean;
  createdAt: string;
  tags: string[];
  pricing: Record<LicenseTier, number>;
  previewAudioUrl?: string;
  rankingStatus?: RankingStatus;
  currentRank?: number | null;
  previousRank?: number | null;
  rankingPeriod?: string | null;
  poolEntryDate?: string | null;
  daysInPool?: number;
  performanceScore?: number;
  performanceMetrics?: PerformanceMetrics;
  localSyncStatus?: LocalSyncStatus;
  localArchivePath?: string | null;
  lastSyncedAt?: string | null;
  onlineAssetStatus?: OnlineAssetStatus;
}

export interface CartItem {
  id: string; // Unique combination of beatId + licenseTier
  beat: Beat;
  licenseTier: LicenseTier;
  price: number;
  licenseName: string;
  customPrice?: number;
}

export type SortOption =
  | "latest"
  | "ranking"
  | "price_asc"
  | "price_desc"
  | "bpm_asc"
  | "bpm_desc";

export interface CategoryInfo {
  id: Genre;
  title: string;
  tagline: string;
  bpmRange: string;
  count: number;
  accentColor: string;
}

export interface ServiceInfo {
  id: string;
  title: string;
  category: string;
  description: string;
  turnaround: string;
  startingPrice: string;
  features: string[];
}

export interface BeatEditData {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  genre_id: string | null;
  mood: string | null;
  bpm: number | null;
  musical_key: string | null;
  duration_seconds: number | null;
  featured: boolean;
  published: boolean;
  cover_path: string | null;
  cover_url: string | null;
  preview_path: string | null;
  preview_url: string | null;
  ranking_status?: RankingStatus;
  current_rank?: number | null;
  previous_rank?: number | null;
  ranking_period?: string | null;
  pool_entry_date?: string | null;
  days_in_pool?: number;
  performance_score?: number;
  performance_metrics?: PerformanceMetrics;
  local_sync_status?: LocalSyncStatus;
  local_archive_path?: string | null;
  last_synced_at?: string | null;
  online_asset_status?: OnlineAssetStatus;
  wav_file: {
    id: string;
    file_name: string | null;
    storage_path: string;
    file_size: number | null;
  } | null;
  licenses: {
    license_type_id: string;
    slug: string;
    price_override: number | null;
    active: boolean;
  }[];
}

export interface BeatRankingHistory {
  id: string;
  beat_id: string;
  ranking_period: string;
  event_type: "entry" | "weekly_rotation" | "demotion" | "archival" | "reactivation";
  rank: number | null;
  performance_score: number;
  sales_count: number;
  revenue_usd: number;
  plays_count: number;
  favorites_count: number;
  cart_additions_count: number;
  page_views_count: number;
  conversion_rate: number;
  window_started_at: string | null;
  window_ended_at: string | null;
  raw_metrics?: Record<string, any>;
  recorded_at: string;
}

