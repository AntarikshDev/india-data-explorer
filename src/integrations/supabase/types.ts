export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      call_attempts: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          next_action_at: string | null
          notes: string | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          next_action_at?: string | null
          notes?: string | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          next_action_at?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          user_id?: string
        }
        Relationships: []
      }
      campaign_targets: {
        Row: {
          campaign_id: string
          created_at: string
          district_id: string | null
          district_name: string | null
          id: string
          leads_inserted: number
          locality_id: string | null
          locality_name: string | null
          position: number
          ran_at: string | null
          scheduled_for: string | null
          scrape_run_id: string | null
          state_code: string
          status: Database["public"]["Enums"]["target_status"]
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          district_id?: string | null
          district_name?: string | null
          id?: string
          leads_inserted?: number
          locality_id?: string | null
          locality_name?: string | null
          position?: number
          ran_at?: string | null
          scheduled_for?: string | null
          scrape_run_id?: string | null
          state_code: string
          status?: Database["public"]["Enums"]["target_status"]
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          district_id?: string | null
          district_name?: string | null
          id?: string
          leads_inserted?: number
          locality_id?: string | null
          locality_name?: string | null
          position?: number
          ran_at?: string | null
          scheduled_for?: string | null
          scrape_run_id?: string | null
          state_code?: string
          status?: Database["public"]["Enums"]["target_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          current_district_id: string | null
          current_state_code: string | null
          daily_target_cap: number
          exhaustion_streak: number
          id: string
          last_run_at: string | null
          name: string
          per_district_cap: number
          query_template: string
          results_per_source: number
          schedule_enabled: boolean
          sources: string[]
          start_state_code: string
          state_coverage_threshold: number
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_district_id?: string | null
          current_state_code?: string | null
          daily_target_cap?: number
          exhaustion_streak?: number
          id?: string
          last_run_at?: string | null
          name: string
          per_district_cap?: number
          query_template: string
          results_per_source?: number
          schedule_enabled?: boolean
          sources?: string[]
          start_state_code: string
          state_coverage_threshold?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_district_id?: string | null
          current_state_code?: string | null
          daily_target_cap?: number
          exhaustion_streak?: number
          id?: string
          last_run_at?: string | null
          name?: string
          per_district_cap?: number
          query_template?: string
          results_per_source?: number
          schedule_enabled?: boolean
          sources?: string[]
          start_state_code?: string
          state_coverage_threshold?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_settings: {
        Row: {
          api_key: string | null
          created_at: string
          crm_webhook_url: string | null
          daily_credit_cap: number
          daily_sync_enabled: boolean
          enabled: boolean
          endpoint_url: string | null
          id: string
          last_daily_sync_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          crm_webhook_url?: string | null
          daily_credit_cap?: number
          daily_sync_enabled?: boolean
          enabled?: boolean
          endpoint_url?: string | null
          id?: string
          last_daily_sync_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          crm_webhook_url?: string | null
          daily_credit_cap?: number
          daily_sync_enabled?: boolean
          enabled?: boolean
          endpoint_url?: string | null
          id?: string
          last_daily_sync_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      geo_districts: {
        Row: {
          hq_lat: number
          hq_lng: number
          id: string
          name: string
          state_code: string
        }
        Insert: {
          hq_lat: number
          hq_lng: number
          id?: string
          name: string
          state_code: string
        }
        Update: {
          hq_lat?: number
          hq_lng?: number
          id?: string
          name?: string
          state_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_districts_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "geo_states"
            referencedColumns: ["code"]
          },
        ]
      }
      geo_localities: {
        Row: {
          district_id: string
          id: string
          kind: string
          name: string
        }
        Insert: {
          district_id: string
          id?: string
          kind?: string
          name: string
        }
        Update: {
          district_id?: string
          id?: string
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_localities_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "geo_districts"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_states: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      lead_edits: {
        Row: {
          created_at: string
          field: string
          id: string
          lead_id: string
          new_value: string | null
          old_value: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          lead_id: string
          new_value?: string | null
          old_value?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          lead_id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lead_sets: {
        Row: {
          category_query: string | null
          created_at: string
          district_id: string | null
          district_name: string | null
          id: string
          locality_id: string | null
          locality_name: string | null
          min_score: number
          name: string
          name_query: string | null
          state_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_query?: string | null
          created_at?: string
          district_id?: string | null
          district_name?: string | null
          id?: string
          locality_id?: string | null
          locality_name?: string | null
          min_score?: number
          name: string
          name_query?: string | null
          state_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_query?: string | null
          created_at?: string
          district_id?: string | null
          district_name?: string | null
          id?: string
          locality_id?: string | null
          locality_name?: string | null
          min_score?: number
          name?: string
          name_query?: string | null
          state_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          dedupe_hash: string
          district_id: string | null
          district_name: string | null
          email: string | null
          email_enriched: string | null
          id: string
          listing_url: string | null
          locality_id: string | null
          locality_name: string | null
          name: string | null
          notes: string | null
          owner_name: string | null
          phone: string | null
          pushed_to_crm_at: string | null
          rating: number | null
          raw_json: Json | null
          reviews_count: number | null
          run_id: string
          score: number
          score_reasons: Json | null
          scraped_at: string
          source: string
          source_url: string | null
          state_code: string | null
          user_id: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          dedupe_hash: string
          district_id?: string | null
          district_name?: string | null
          email?: string | null
          email_enriched?: string | null
          id?: string
          listing_url?: string | null
          locality_id?: string | null
          locality_name?: string | null
          name?: string | null
          notes?: string | null
          owner_name?: string | null
          phone?: string | null
          pushed_to_crm_at?: string | null
          rating?: number | null
          raw_json?: Json | null
          reviews_count?: number | null
          run_id: string
          score?: number
          score_reasons?: Json | null
          scraped_at?: string
          source: string
          source_url?: string | null
          state_code?: string | null
          user_id: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          dedupe_hash?: string
          district_id?: string | null
          district_name?: string | null
          email?: string | null
          email_enriched?: string | null
          id?: string
          listing_url?: string | null
          locality_id?: string | null
          locality_name?: string | null
          name?: string | null
          notes?: string | null
          owner_name?: string | null
          phone?: string | null
          pushed_to_crm_at?: string | null
          rating?: number | null
          raw_json?: Json | null
          reviews_count?: number | null
          run_id?: string
          score?: number
          score_reasons?: Json | null
          scraped_at?: string
          source?: string
          source_url?: string | null
          state_code?: string | null
          user_id?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scrape_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          payload: Json | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scrape_runs: {
        Row: {
          city: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          progress: Json
          query: string
          results_per_source: number
          sources: string[]
          started_at: string | null
          status: string
          total_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          progress?: Json
          query: string
          results_per_source?: number
          sources?: string[]
          started_at?: string | null
          status?: string
          total_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          progress?: Json
          query?: string
          results_per_source?: number
          sources?: string[]
          started_at?: string | null
          status?: string
          total_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      call_outcome:
        | "connected"
        | "voicemail"
        | "not_interested"
        | "follow_up"
        | "wrong_number"
        | "skip"
      campaign_status:
        | "draft"
        | "active"
        | "paused"
        | "awaiting_next_state"
        | "completed"
      target_status: "queued" | "running" | "done" | "skipped" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      call_outcome: [
        "connected",
        "voicemail",
        "not_interested",
        "follow_up",
        "wrong_number",
        "skip",
      ],
      campaign_status: [
        "draft",
        "active",
        "paused",
        "awaiting_next_state",
        "completed",
      ],
      target_status: ["queued", "running", "done", "skipped", "failed"],
    },
  },
} as const
