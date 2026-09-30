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
          bet_unit_cents: number;
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
          bet_unit_cents?: number;
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
          bet_unit_cents?: number;
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
      seasons: {
        Row: {
          id: string;
          year: number;
          regular_season_weeks: number;
          playoffs_start_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          regular_season_weeks?: number;
          playoffs_start_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          year?: number;
          regular_season_weeks?: number;
          playoffs_start_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      weeks: {
        Row: {
          id: string;
          season_id: string;
          week_number: number;
          opens_at: string | null;
          spread_lock_at: string | null;
          first_kickoff_at: string | null;
          last_kickoff_at: string | null;
          last_game_id: string | null;
          last_deadline_at: string | null;
          settled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          week_number: number;
          opens_at?: string | null;
          spread_lock_at?: string | null;
          first_kickoff_at?: string | null;
          last_kickoff_at?: string | null;
          last_game_id?: string | null;
          last_deadline_at?: string | null;
          settled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          week_number?: number;
          opens_at?: string | null;
          spread_lock_at?: string | null;
          first_kickoff_at?: string | null;
          last_kickoff_at?: string | null;
          last_game_id?: string | null;
          last_deadline_at?: string | null;
          settled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weeks_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          id: string;
          espn_team_id: number;
          abbreviation: string;
          location: string;
          name: string;
          display_name: string;
          conference: string;
          division: string;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          espn_team_id: number;
          abbreviation: string;
          location: string;
          name: string;
          display_name: string;
          conference: string;
          division: string;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          espn_team_id?: number;
          abbreviation?: string;
          location?: string;
          name?: string;
          display_name?: string;
          conference?: string;
          division?: string;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          season_id: string;
          week_id: string;
          espn_event_id: string;
          home_team_id: string;
          away_team_id: string;
          kickoff_at: string;
          deadline_at: string;
          neutral_site: boolean;
          status: Database["public"]["Enums"]["game_status"];
          status_detail: string | null;
          home_score: number | null;
          away_score: number | null;
          period: number | null;
          clock: string | null;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          week_id: string;
          espn_event_id: string;
          home_team_id: string;
          away_team_id: string;
          kickoff_at: string;
          deadline_at?: string;
          neutral_site?: boolean;
          status?: Database["public"]["Enums"]["game_status"];
          status_detail?: string | null;
          home_score?: number | null;
          away_score?: number | null;
          period?: number | null;
          clock?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          week_id?: string;
          espn_event_id?: string;
          home_team_id?: string;
          away_team_id?: string;
          kickoff_at?: string;
          deadline_at?: string;
          neutral_site?: boolean;
          status?: Database["public"]["Enums"]["game_status"];
          status_detail?: string | null;
          home_score?: number | null;
          away_score?: number | null;
          period?: number | null;
          clock?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "games_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "games_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "weeks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "games_home_team_id_fkey";
            columns: ["home_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "games_away_team_id_fkey";
            columns: ["away_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      lines: {
        Row: {
          id: string;
          game_id: string;
          home_spread: number;
          price: number;
          source: Database["public"]["Enums"]["line_source"];
          set_by: string | null;
          locked_at: string;
          is_current: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          home_spread: number;
          price?: number;
          source: Database["public"]["Enums"]["line_source"];
          set_by?: string | null;
          locked_at?: string;
          is_current?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          home_spread?: number;
          price?: number;
          source?: Database["public"]["Enums"]["line_source"];
          set_by?: string | null;
          locked_at?: string;
          is_current?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lines_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_site_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      set_line: {
        Args: {
          p_game_id: string;
          p_home_spread: number;
          p_source?: Database["public"]["Enums"]["line_source"];
        };
        Returns: string;
      };
      refresh_week_rollup: {
        Args: { p_week_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      job_status: "running" | "succeeded" | "failed";
      audit_action: "insert" | "update" | "delete";
      game_status: "scheduled" | "in_progress" | "final" | "postponed" | "void";
      line_source: "api" | "admin";
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
