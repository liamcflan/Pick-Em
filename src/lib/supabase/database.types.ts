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
      leagues: {
        Row: {
          id: string;
          season_id: string;
          name: string;
          invite_code: string;
          created_by: string;
          starting_balance_cents: number;
          status: Database["public"]["Enums"]["league_status"];
          winner_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          name: string;
          invite_code: string;
          created_by: string;
          starting_balance_cents: number;
          status?: Database["public"]["Enums"]["league_status"];
          winner_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          season_id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          starting_balance_cents?: number;
          status?: Database["public"]["Enums"]["league_status"];
          winner_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leagues_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leagues_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leagues_winner_user_id_fkey";
            columns: ["winner_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      league_members: {
        Row: {
          id: string;
          league_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["member_role"];
          joined_week_id: string | null;
          bye_week_id: string | null;
          eliminated_at: string | null;
          eliminated_week_id: string | null;
          left_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          league_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          joined_week_id?: string | null;
          bye_week_id?: string | null;
          eliminated_at?: string | null;
          eliminated_week_id?: string | null;
          left_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          league_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          joined_week_id?: string | null;
          bye_week_id?: string | null;
          eliminated_at?: string | null;
          eliminated_week_id?: string | null;
          left_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey";
            columns: ["league_id"];
            isOneToOne: false;
            referencedRelation: "leagues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "league_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ledger: {
        Row: {
          id: string;
          league_id: string;
          user_id: string;
          week_id: string | null;
          pick_id: string | null;
          kind: Database["public"]["Enums"]["ledger_kind"];
          amount_cents: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          league_id: string;
          user_id: string;
          week_id?: string | null;
          pick_id?: string | null;
          kind: Database["public"]["Enums"]["ledger_kind"];
          amount_cents: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          league_id?: string;
          user_id?: string;
          week_id?: string | null;
          pick_id?: string | null;
          kind?: Database["public"]["Enums"]["ledger_kind"];
          amount_cents?: number;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_league_id_fkey";
            columns: ["league_id"];
            isOneToOne: false;
            referencedRelation: "leagues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      league_events: {
        Row: {
          id: number;
          league_id: string;
          kind: Database["public"]["Enums"]["league_event_kind"];
          actor_user_id: string | null;
          subject_user_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          league_id: string;
          kind: Database["public"]["Enums"]["league_event_kind"];
          actor_user_id?: string | null;
          subject_user_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          league_id?: string;
          kind?: Database["public"]["Enums"]["league_event_kind"];
          actor_user_id?: string | null;
          subject_user_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "league_events_league_id_fkey";
            columns: ["league_id"];
            isOneToOne: false;
            referencedRelation: "leagues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "league_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "league_events_subject_user_id_fkey";
            columns: ["subject_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      picks: {
        Row: {
          id: string;
          league_id: string;
          user_id: string;
          week_id: string;
          game_id: string;
          line_id: string;
          side: Database["public"]["Enums"]["pick_side"];
          wager_cents: number;
          placed_by: Database["public"]["Enums"]["pick_placed_by"];
          status: Database["public"]["Enums"]["pick_status"];
          settled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          league_id: string;
          user_id: string;
          week_id: string;
          game_id: string;
          line_id: string;
          side: Database["public"]["Enums"]["pick_side"];
          wager_cents: number;
          placed_by?: Database["public"]["Enums"]["pick_placed_by"];
          status?: Database["public"]["Enums"]["pick_status"];
          settled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          league_id?: string;
          user_id?: string;
          week_id?: string;
          game_id?: string;
          line_id?: string;
          side?: Database["public"]["Enums"]["pick_side"];
          wager_cents?: number;
          placed_by?: Database["public"]["Enums"]["pick_placed_by"];
          status?: Database["public"]["Enums"]["pick_status"];
          settled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "picks_league_id_fkey";
            columns: ["league_id"];
            isOneToOne: false;
            referencedRelation: "leagues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "picks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "picks_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "weeks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "picks_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "picks_line_id_fkey";
            columns: ["line_id"];
            isOneToOne: false;
            referencedRelation: "lines";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      league_balances: {
        Row: {
          league_id: string | null;
          user_id: string | null;
          balance_cents: number | null;
          total_risked_cents: number | null;
        };
        Relationships: [];
      };
    };
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
      is_league_member: { Args: { p_league_id: string }; Returns: boolean };
      is_league_commissioner: { Args: { p_league_id: string }; Returns: boolean };
      create_league: {
        Args: { p_name: string; p_starting_balance_cents?: number | null };
        Returns: string;
      };
      join_league: { Args: { p_code: string }; Returns: string };
      set_member_role: {
        Args: {
          p_league_id: string;
          p_user_id: string;
          p_role: Database["public"]["Enums"]["member_role"];
        };
        Returns: undefined;
      };
      remove_member: { Args: { p_league_id: string; p_user_id: string }; Returns: undefined };
      rotate_invite_code: { Args: { p_league_id: string }; Returns: string };
      update_league: {
        Args: { p_league_id: string; p_name: string; p_starting_balance_cents: number };
        Returns: undefined;
      };
      post_commissioner_note: { Args: { p_league_id: string; p_text: string }; Returns: undefined };
      week_budget_cents: {
        Args: { p_league_id: string; p_user_id: string; p_week_id: string };
        Returns: number;
      };
      available_cents: {
        Args: { p_league_id: string; p_user_id: string; p_week_id: string };
        Returns: number;
      };
      place_pick: {
        Args: {
          p_league_id: string;
          p_game_id: string;
          p_side: Database["public"]["Enums"]["pick_side"];
          p_wager_cents: number;
        };
        Returns: string;
      };
      delete_pick: { Args: { p_pick_id: string }; Returns: undefined };
      take_bye: { Args: { p_league_id: string; p_week_id: string }; Returns: undefined };
      cancel_bye: { Args: { p_league_id: string; p_week_id: string }; Returns: undefined };
    };
    Enums: {
      job_status: "running" | "succeeded" | "failed";
      audit_action: "insert" | "update" | "delete";
      game_status: "scheduled" | "in_progress" | "final" | "postponed" | "void";
      line_source: "api" | "admin";
      league_status: "open" | "locked" | "complete";
      pick_side: "home" | "away";
      pick_status: "open" | "won" | "lost" | "push" | "void";
      pick_placed_by: "member" | "system";
      member_role: "member" | "commissioner";
      ledger_kind: "initial" | "wager" | "payout" | "refund" | "adjustment";
      league_event_kind:
        | "member_joined"
        | "member_left"
        | "member_removed"
        | "role_changed"
        | "member_eliminated"
        | "bye_used"
        | "forced_pick"
        | "line_edited"
        | "spreads_locked"
        | "week_settled"
        | "season_complete"
        | "commissioner_note"
        | "league_updated";
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
