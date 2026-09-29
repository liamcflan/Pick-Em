/**
 * Database types for the public schema.
 *
 * Hand-maintained for the foundation migration; regenerate with `pnpm db:types` (requires the
 * Supabase CLI + Docker) whenever a migration changes the schema. Keep the shape identical to the
 * generator's output so a regenerated file is a drop-in replacement.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_path: string | null;
          is_site_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_path?: string | null;
          is_site_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_path?: string | null;
          is_site_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: number;
          spread_lock_day: number;
          spread_lock_time: string;
          timezone: string;
          default_starting_balance_cents: number;
          hide_picks_until_kickoff: boolean;
          odds_provider: string;
          score_poll_interval_s: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          spread_lock_day?: number;
          spread_lock_time?: string;
          timezone?: string;
          default_starting_balance_cents?: number;
          hide_picks_until_kickoff?: boolean;
          odds_provider?: string;
          score_poll_interval_s?: number;
          updated_at?: string;
        };
        Update: {
          id?: number;
          spread_lock_day?: number;
          spread_lock_time?: string;
          timezone?: string;
          default_starting_balance_cents?: number;
          hide_picks_until_kickoff?: boolean;
          odds_provider?: string;
          score_poll_interval_s?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      job_runs: {
        Row: {
          id: string;
          job_name: string;
          request_id: string | null;
          status: Database["public"]["Enums"]["job_status"];
          started_at: string;
          finished_at: string | null;
          detail: Json;
        };
        Insert: {
          id?: string;
          job_name: string;
          request_id?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          started_at?: string;
          finished_at?: string | null;
          detail?: Json;
        };
        Update: {
          id?: string;
          job_name?: string;
          request_id?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          started_at?: string;
          finished_at?: string | null;
          detail?: Json;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          table_name: string;
          row_id: string;
          action: Database["public"]["Enums"]["audit_action"];
          actor_id: string | null;
          actor_role: string | null;
          request_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          table_name: string;
          row_id: string;
          action: Database["public"]["Enums"]["audit_action"];
          actor_id?: string | null;
          actor_role?: string | null;
          request_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          table_name?: string;
          row_id?: string;
          action?: Database["public"]["Enums"]["audit_action"];
          actor_id?: string | null;
          actor_role?: string | null;
          request_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_site_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      job_status: "running" | "succeeded" | "failed";
      audit_action: "insert" | "update" | "delete";
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
