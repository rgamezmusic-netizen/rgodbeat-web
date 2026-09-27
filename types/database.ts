/**
-- RGODBEAT 2.0 Database Types
-- Defines schema matching Supabase PostgreSQL tables
*/

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      beats: {
        Row: {
          id: string;
          title: string;
          slug: string;
          description: string | null;
          genre_id: string | null;
          mood: string | null;
          bpm: number | null;
          musical_key: string | null;
          duration_seconds: number | null;
          cover_path: string | null;
          preview_path: string | null;
          featured: boolean;
          published: boolean;
          created_at: string;
          updated_at: string;
          ranking_status: "draft" | "new" | "active" | "archived";
          current_rank: number | null;
          previous_rank: number | null;
          ranking_period: string | null;
          pool_entry_date: string | null;
          days_in_pool: number;
          performance_window_started_at: string | null;
          performance_window_ended_at: string | null;
          performance_score: number;
          performance_metrics: Json;
          local_sync_status: "pending" | "synced" | "failed";
          local_archive_path: string | null;
          last_synced_at: string | null;
          online_asset_status: "ready" | "archived" | "purged";
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          description?: string | null;
          genre_id?: string | null;
          mood?: string | null;
          bpm?: number | null;
          musical_key?: string | null;
          duration_seconds?: number | null;
          cover_path?: string | null;
          preview_path?: string | null;
          featured?: boolean;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
          ranking_status?: "draft" | "new" | "active" | "archived";
          current_rank?: number | null;
          previous_rank?: number | null;
          ranking_period?: string | null;
          pool_entry_date?: string | null;
          days_in_pool?: number;
          performance_window_started_at?: string | null;
          performance_window_ended_at?: string | null;
          performance_score?: number;
          performance_metrics?: Json;
          local_sync_status?: "pending" | "synced" | "failed";
          local_archive_path?: string | null;
          last_synced_at?: string | null;
          online_asset_status?: "ready" | "archived" | "purged";
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          description?: string | null;
          genre_id?: string | null;
          mood?: string | null;
          bpm?: number | null;
          musical_key?: string | null;
          duration_seconds?: number | null;
          cover_path?: string | null;
          preview_path?: string | null;
          featured?: boolean;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
          ranking_status?: "draft" | "new" | "active" | "archived";
          current_rank?: number | null;
          previous_rank?: number | null;
          ranking_period?: string | null;
          pool_entry_date?: string | null;
          days_in_pool?: number;
          performance_window_started_at?: string | null;
          performance_window_ended_at?: string | null;
          performance_score?: number;
          performance_metrics?: Json;
          local_sync_status?: "pending" | "synced" | "failed";
          local_archive_path?: string | null;
          last_synced_at?: string | null;
          online_asset_status?: "ready" | "archived" | "purged";
        };
        Relationships: [];
      };
      beat_files: {
        Row: {
          id: string;
          beat_id: string;
          file_type: "preview" | "wav" | "stems" | "exclusive" | "contract";
          storage_path: string;
          file_name: string | null;
          mime_type: string | null;
          file_size: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          beat_id: string;
          file_type: "preview" | "wav" | "stems" | "exclusive" | "contract";
          storage_path: string;
          file_name?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          beat_id?: string;
          file_type?: "preview" | "wav" | "stems" | "exclusive" | "contract";
          storage_path?: string;
          file_name?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      license_types: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          price: number;
          currency: string;
          sort_order: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          price: number;
          currency?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          price?: number;
          currency?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      beat_licenses: {
        Row: {
          id: string;
          beat_id: string;
          license_type_id: string;
          price_override: number | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          beat_id: string;
          license_type_id: string;
          price_override?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          beat_id?: string;
          license_type_id?: string;
          price_override?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      beat_ranking_history: {
        Row: {
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
          raw_metrics: Json;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          beat_id: string;
          ranking_period: string;
          event_type: "entry" | "weekly_rotation" | "demotion" | "archival" | "reactivation";
          rank?: number | null;
          performance_score?: number;
          sales_count?: number;
          revenue_usd?: number;
          plays_count?: number;
          favorites_count?: number;
          cart_additions_count?: number;
          page_views_count?: number;
          conversion_rate?: number;
          window_started_at?: string | null;
          window_ended_at?: string | null;
          raw_metrics?: Json;
          recorded_at?: string;
        };
        Update: {
          id?: string;
          beat_id?: string;
          ranking_period?: string;
          event_type?: "entry" | "weekly_rotation" | "demotion" | "archival" | "reactivation";
          rank?: number | null;
          performance_score?: number;
          sales_count?: number;
          revenue_usd?: number;
          plays_count?: number;
          favorites_count?: number;
          cart_additions_count?: number;
          page_views_count?: number;
          conversion_rate?: number;
          window_started_at?: string | null;
          window_ended_at?: string | null;
          raw_metrics?: Json;
          recorded_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          customer_id: string;
          stripe_checkout_session_id: string;
          stripe_payment_intent_id: string | null;
          status: "pending" | "processing" | "completed" | "failed" | "cancelled";
          payment_status: "unpaid" | "paid" | "failed" | "refunded";
          currency: string;
          subtotal_amount: number;
          total_amount: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          stripe_checkout_session_id: string;
          stripe_payment_intent_id?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
          payment_status?: "unpaid" | "paid" | "failed" | "refunded";
          currency?: string;
          subtotal_amount?: number;
          total_amount?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          stripe_checkout_session_id?: string;
          stripe_payment_intent_id?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
          payment_status?: "unpaid" | "paid" | "failed" | "refunded";
          currency?: string;
          subtotal_amount?: number;
          total_amount?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          }
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          beat_id: string;
          license_type_id: string;
          unit_price: number;
          currency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          beat_id: string;
          license_type_id: string;
          unit_price: number;
          currency?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          beat_id?: string;
          license_type_id?: string;
          unit_price?: number;
          currency?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_beat_id_fkey";
            columns: ["beat_id"];
            isOneToOne: false;
            referencedRelation: "beats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_license_type_id_fkey";
            columns: ["license_type_id"];
            isOneToOne: false;
            referencedRelation: "license_types";
            referencedColumns: ["id"];
          }
        ];
      };
      purchases: {
        Row: {
          id: string;
          order_id: string;
          order_item_id: string;
          customer_id: string;
          beat_id: string;
          license_type_id: string;
          license_tier: "mp3" | "wav" | "stems" | "unlimited" | "exclusive";
          contract_text: string | null;
          status: "active" | "revoked" | "refunded";
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          order_item_id: string;
          customer_id: string;
          beat_id: string;
          license_type_id: string;
          license_tier: "mp3" | "wav" | "stems" | "unlimited" | "exclusive";
          contract_text?: string | null;
          status?: "active" | "revoked" | "refunded";
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          order_item_id?: string;
          customer_id?: string;
          beat_id?: string;
          license_type_id?: string;
          license_tier?: "mp3" | "wav" | "stems" | "unlimited" | "exclusive";
          contract_text?: string | null;
          status?: "active" | "revoked" | "refunded";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_beat_id_fkey";
            columns: ["beat_id"];
            isOneToOne: false;
            referencedRelation: "beats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_license_type_id_fkey";
            columns: ["license_type_id"];
            isOneToOne: false;
            referencedRelation: "license_types";
            referencedColumns: ["id"];
          }
        ];
      };
      download_records: {
        Row: {
          id: string;
          purchase_id: string;
          file_type: "mp3" | "wav" | "stems" | "exclusive" | "contract";
          storage_path: string;
          ip_address: string | null;
          user_agent: string | null;
          downloaded_at: string;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          file_type: "mp3" | "wav" | "stems" | "exclusive" | "contract";
          storage_path: string;
          ip_address?: string | null;
          user_agent?: string | null;
          downloaded_at?: string;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          file_type?: "mp3" | "wav" | "stems" | "exclusive" | "contract";
          storage_path?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          downloaded_at?: string;
        };
        Relationships: [];
      };
      stem_requests: {
        Row: {
          id: string;
          ticket_id: string;
          purchase_id: string;
          customer_id: string | null;
          customer_name: string;
          customer_email: string;
          beat_id: string | null;
          beat_title: string;
          license_id: string;
          license_tier: "unlimited" | "exclusive";
          order_id: string | null;
          contract_version: string;
          status: "Pending" | "Contacted" | "Delivered" | "Closed";
          admin_notes: string | null;
          stem_files: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          purchase_id: string;
          customer_id?: string | null;
          customer_name: string;
          customer_email: string;
          beat_id?: string | null;
          beat_title: string;
          license_id: string;
          license_tier: "unlimited" | "exclusive";
          order_id?: string | null;
          contract_version: string;
          status?: "Pending" | "Contacted" | "Delivered" | "Closed";
          admin_notes?: string | null;
          stem_files?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ticket_id?: string;
          purchase_id?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_email?: string;
          beat_id?: string | null;
          beat_title?: string;
          license_id?: string;
          license_tier?: "unlimited" | "exclusive";
          order_id?: string | null;
          contract_version?: string;
          status?: "Pending" | "Contacted" | "Delivered" | "Closed";
          admin_notes?: string | null;
          stem_files?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      park_profiles: {
        Row: {
          id: string;
          user_id: string;
          legal_name: string;
          professional_name: string;
          producer_name: string | null;
          artist_name: string | null;
          roles: Json;
          ipi_cae_number: string | null;
          isni_number: string | null;
          pro_affiliation: string | null;
          pro_member_id: string | null;
          mlc_member_id: string | null;
          soundexchange_id: string | null;
          isrc_registrant_code: string | null;
          publisher_name: string | null;
          publisher_ipi: string | null;
          label_name: string | null;
          company_name: string | null;
          email: string;
          country: string | null;
          state: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          legal_name?: string;
          professional_name?: string;
          producer_name?: string | null;
          artist_name?: string | null;
          roles?: Json;
          ipi_cae_number?: string | null;
          isni_number?: string | null;
          pro_affiliation?: string | null;
          pro_member_id?: string | null;
          mlc_member_id?: string | null;
          soundexchange_id?: string | null;
          isrc_registrant_code?: string | null;
          publisher_name?: string | null;
          publisher_ipi?: string | null;
          label_name?: string | null;
          company_name?: string | null;
          email: string;
          country?: string | null;
          state?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          legal_name?: string;
          professional_name?: string;
          producer_name?: string | null;
          artist_name?: string | null;
          roles?: Json;
          ipi_cae_number?: string | null;
          isni_number?: string | null;
          pro_affiliation?: string | null;
          pro_member_id?: string | null;
          mlc_member_id?: string | null;
          soundexchange_id?: string | null;
          isrc_registrant_code?: string | null;
          publisher_name?: string | null;
          publisher_ipi?: string | null;
          label_name?: string | null;
          company_name?: string | null;
          email?: string;
          country?: string | null;
          state?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      park_projects: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          title: string;
          type: "beat" | "song" | "album_cut" | "client_work";
          stage: "beat_instrumental" | "work_in_progress" | "song_complete" | "master_delivered" | "registered_protected" | "released_monetized";
          bpm: number;
          musical_key: string;
          scale: string;
          genre: string;
          mood: string | null;
          duration_sec: number;
          producer_name: string | null;
          primary_artist_name: string | null;
          featured_artists: Json;
          songwriters: Json;
          publishers: Json;
          splits: Json;
          master_ownership_percentage: number;
          publishing_ownership_percentage: number;
          iswc_code: string | null;
          isrc_code: string | null;
          upc_code: string | null;
          distributor_name: string | null;
          release_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          title: string;
          type?: "beat" | "song" | "album_cut" | "client_work";
          stage?: "beat_instrumental" | "work_in_progress" | "song_complete" | "master_delivered" | "registered_protected" | "released_monetized";
          bpm?: number;
          musical_key?: string;
          scale?: string;
          genre?: string;
          mood?: string | null;
          duration_sec?: number;
          producer_name?: string | null;
          primary_artist_name?: string | null;
          featured_artists?: Json;
          songwriters?: Json;
          publishers?: Json;
          splits?: Json;
          master_ownership_percentage?: number;
          publishing_ownership_percentage?: number;
          iswc_code?: string | null;
          isrc_code?: string | null;
          upc_code?: string | null;
          distributor_name?: string | null;
          release_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          slug?: string;
          title?: string;
          type?: "beat" | "song" | "album_cut" | "client_work";
          stage?: "beat_instrumental" | "work_in_progress" | "song_complete" | "master_delivered" | "registered_protected" | "released_monetized";
          bpm?: number;
          musical_key?: string;
          scale?: string;
          genre?: string;
          mood?: string | null;
          duration_sec?: number;
          producer_name?: string | null;
          primary_artist_name?: string | null;
          featured_artists?: Json;
          songwriters?: Json;
          publishers?: Json;
          splits?: Json;
          master_ownership_percentage?: number;
          publishing_ownership_percentage?: number;
          iswc_code?: string | null;
          isrc_code?: string | null;
          upc_code?: string | null;
          distributor_name?: string | null;
          release_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      park_registrations: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          service: string;
          status: "NOT_STARTED" | "READY_TO_REGISTER" | "SUBMITTED" | "CONFIRMED" | "ACTION_REQUIRED" | "NOT_APPLICABLE";
          confirmation_number: string | null;
          submission_date: string | null;
          confirmation_date: string | null;
          notes: string | null;
          last_updated: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          service: string;
          status?: "NOT_STARTED" | "READY_TO_REGISTER" | "SUBMITTED" | "CONFIRMED" | "ACTION_REQUIRED" | "NOT_APPLICABLE";
          confirmation_number?: string | null;
          submission_date?: string | null;
          confirmation_date?: string | null;
          notes?: string | null;
          last_updated?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          service?: string;
          status?: "NOT_STARTED" | "READY_TO_REGISTER" | "SUBMITTED" | "CONFIRMED" | "ACTION_REQUIRED" | "NOT_APPLICABLE";
          confirmation_number?: string | null;
          submission_date?: string | null;
          confirmation_date?: string | null;
          notes?: string | null;
          last_updated?: string;
        };
        Relationships: [];
      };
      park_documents: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          title: string;
          type: "splitsheet" | "copyright_cert" | "license_agreement" | "lyrics" | "audio_proof" | "other";
          file_path: string;
          file_name: string;
          file_size_bytes: number;
          mime_type: string;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          title: string;
          type?: "splitsheet" | "copyright_cert" | "license_agreement" | "lyrics" | "audio_proof" | "other";
          file_path: string;
          file_name: string;
          file_size_bytes?: number;
          mime_type?: string;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          title?: string;
          type?: "splitsheet" | "copyright_cert" | "license_agreement" | "lyrics" | "audio_proof" | "other";
          file_path?: string;
          file_name?: string;
          file_size_bytes?: number;
          mime_type?: string;
          uploaded_at?: string;
        };
        Relationships: [];
      };
      park_audit_events: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          user_email: string;
          action: string;
          entity_type: string;
          entity_id: string;
          previous_state: Json | null;
          new_state: Json | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          user_email: string;
          action: string;
          entity_type: string;
          entity_id: string;
          previous_state?: Json | null;
          new_state?: Json | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          user_email?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          previous_state?: Json | null;
          new_state?: Json | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type BeatRow = Database["public"]["Tables"]["beats"]["Row"];
export type BeatFileRow = Database["public"]["Tables"]["beat_files"]["Row"];
export type LicenseTypeRow = Database["public"]["Tables"]["license_types"]["Row"];
export type BeatLicenseRow = Database["public"]["Tables"]["beat_licenses"]["Row"];
export type BeatRankingHistoryRow = Database["public"]["Tables"]["beat_ranking_history"]["Row"];
export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type PurchaseRow = Database["public"]["Tables"]["purchases"]["Row"];
export type DownloadRecordRow = Database["public"]["Tables"]["download_records"]["Row"];
export type ParkProfileRow = Database["public"]["Tables"]["park_profiles"]["Row"];
export type ParkProjectRow = Database["public"]["Tables"]["park_projects"]["Row"];
export type ParkRegistrationRow = Database["public"]["Tables"]["park_registrations"]["Row"];
export type ParkDocumentRow = Database["public"]["Tables"]["park_documents"]["Row"];
export type ParkAuditEventRow = Database["public"]["Tables"]["park_audit_events"]["Row"];
