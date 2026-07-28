export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          detail: string
          guild_id: string
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          detail: string
          guild_id: string
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          detail?: string
          guild_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
      bosses: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      credit_logs: {
        Row: {
          created_at: string
          delta: number
          guild_id: string
          id: string
          payment_id: string | null
          raid_id: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          delta: number
          guild_id: string
          id?: string
          payment_id?: string | null
          raid_id?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          delta?: number
          guild_id?: string
          id?: string
          payment_id?: string | null
          raid_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_logs_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_logs_raid_id_fkey"
            columns: ["raid_id"]
            isOneToOne: false
            referencedRelation: "raids"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          at: string
          guild_id: string | null
          id: string
          message: string
          method: string
          path: string
          status: number
        }
        Insert: {
          at?: string
          guild_id?: string | null
          id?: string
          message: string
          method: string
          path: string
          status: number
        }
        Update: {
          at?: string
          guild_id?: string | null
          id?: string
          message?: string
          method?: string
          path?: string
          status?: number
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
      game_servers: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      guild_accounts: {
        Row: {
          created_at: string
          email: string
          guild_id: string
          id: string
          name: string
          role: Database["public"]["Enums"]["account_role"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          guild_id: string
          id?: string
          name: string
          role?: Database["public"]["Enums"]["account_role"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          guild_id?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["account_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guild_accounts_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
      guild_settings: {
        Row: {
          default_fee_pct: number
          guild_id: string
          ppoji_rate: number
        }
        Insert: {
          default_fee_pct?: number
          guild_id: string
          ppoji_rate?: number
        }
        Update: {
          default_fee_pct?: number
          guild_id?: string
          ppoji_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "guild_settings_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: true
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
      guilds: {
        Row: {
          created_at: string
          credits: number
          guild_name: string
          id: string
          server_name: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          credits?: number
          guild_name: string
          id?: string
          server_name: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          credits?: number
          guild_name?: string
          id?: string
          server_name?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          guild_id: string
          role: Database["public"]["Enums"]["account_role"]
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          guild_id: string
          role?: Database["public"]["Enums"]["account_role"]
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          guild_id?: string
          role?: Database["public"]["Enums"]["account_role"]
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          guild_id: string
          id: string
          job: string
          job_category: string
          level: number
          nickname: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          created_at?: string
          guild_id: string
          id?: string
          job: string
          job_category: string
          level: number
          nickname: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          created_at?: string
          guild_id?: string
          id?: string
          job?: string
          job_category?: string
          level?: number
          nickname?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "members_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          created_at: string
          guild_id: string
          id: string
          leader_id: string | null
          name: string
          remainder_policy: Database["public"]["Enums"]["remainder_policy"]
        }
        Insert: {
          created_at?: string
          guild_id: string
          id?: string
          leader_id?: string | null
          name: string
          remainder_policy?: Database["public"]["Enums"]["remainder_policy"]
        }
        Update: {
          created_at?: string
          guild_id?: string
          id?: string
          leader_id?: string | null
          name?: string
          remainder_policy?: Database["public"]["Enums"]["remainder_policy"]
        }
        Relationships: [
          {
            foreignKeyName: "parties_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      party_members: {
        Row: {
          member_id: string
          party_id: string
        }
        Insert: {
          member_id: string
          party_id: string
        }
        Update: {
          member_id?: string
          party_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      penalty_types: {
        Row: {
          calc_type: Database["public"]["Enums"]["penalty_calc_type"]
          guild_id: string
          id: string
          is_active: boolean
          name: string
          value: number
        }
        Insert: {
          calc_type: Database["public"]["Enums"]["penalty_calc_type"]
          guild_id: string
          id?: string
          is_active?: boolean
          name: string
          value: number
        }
        Update: {
          calc_type?: Database["public"]["Enums"]["penalty_calc_type"]
          guild_id?: string
          id?: string
          is_active?: boolean
          name?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "penalty_types_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
      raid_drops: {
        Row: {
          fee_pct: number
          id: string
          name: string
          raid_id: string
          sale_price: number
          sort_order: number
        }
        Insert: {
          fee_pct?: number
          id?: string
          name: string
          raid_id: string
          sale_price?: number
          sort_order?: number
        }
        Update: {
          fee_pct?: number
          id?: string
          name?: string
          raid_id?: string
          sale_price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "raid_drops_raid_id_fkey"
            columns: ["raid_id"]
            isOneToOne: false
            referencedRelation: "raids"
            referencedColumns: ["id"]
          },
        ]
      }
      raid_expenses: {
        Row: {
          category: Database["public"]["Enums"]["expense_category"]
          cost: number
          id: string
          name: string
          raid_id: string
          sort_order: number
        }
        Insert: {
          category: Database["public"]["Enums"]["expense_category"]
          cost?: number
          id?: string
          name: string
          raid_id: string
          sort_order?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["expense_category"]
          cost?: number
          id?: string
          name?: string
          raid_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "raid_expenses_raid_id_fkey"
            columns: ["raid_id"]
            isOneToOne: false
            referencedRelation: "raids"
            referencedColumns: ["id"]
          },
        ]
      }
      raid_participant_penalties: {
        Row: {
          calc_type: Database["public"]["Enums"]["penalty_calc_type"]
          id: string
          name: string
          penalty_type_id: string | null
          raid_participant_id: string
          value: number
        }
        Insert: {
          calc_type: Database["public"]["Enums"]["penalty_calc_type"]
          id?: string
          name: string
          penalty_type_id?: string | null
          raid_participant_id: string
          value: number
        }
        Update: {
          calc_type?: Database["public"]["Enums"]["penalty_calc_type"]
          id?: string
          name?: string
          penalty_type_id?: string | null
          raid_participant_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "raid_participant_penalties_penalty_type_id_fkey"
            columns: ["penalty_type_id"]
            isOneToOne: false
            referencedRelation: "penalty_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raid_participant_penalties_raid_participant_id_fkey"
            columns: ["raid_participant_id"]
            isOneToOne: false
            referencedRelation: "raid_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      raid_participants: {
        Row: {
          base: number
          exit_phase: number | null
          final_amount: number
          forfeited: boolean
          guest_name: string | null
          id: string
          member_id: string | null
          penalty: number
          raid_id: string
          redistributed: number
          sort_order: number
        }
        Insert: {
          base?: number
          exit_phase?: number | null
          final_amount?: number
          forfeited?: boolean
          guest_name?: string | null
          id?: string
          member_id?: string | null
          penalty?: number
          raid_id: string
          redistributed?: number
          sort_order?: number
        }
        Update: {
          base?: number
          exit_phase?: number | null
          final_amount?: number
          forfeited?: boolean
          guest_name?: string | null
          id?: string
          member_id?: string | null
          penalty?: number
          raid_id?: string
          redistributed?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "raid_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raid_participants_raid_id_fkey"
            columns: ["raid_id"]
            isOneToOne: false
            referencedRelation: "raids"
            referencedColumns: ["id"]
          },
        ]
      }
      raids: {
        Row: {
          boss_name: string
          created_at: string
          date: string
          expense_total: number
          fee_total: number
          guild_id: string
          id: string
          leader_ppoji: number
          leftover: number
          net_profit: number
          participant_count: number
          party_name: string | null
          per_person: number
          phase_count: number
          ppoji_pct: number
          remainder_policy: Database["public"]["Enums"]["remainder_policy"]
          sent: boolean
          status: Database["public"]["Enums"]["raid_status"]
          total_sales: number
          updated_at: string
        }
        Insert: {
          boss_name: string
          created_at?: string
          date?: string
          expense_total?: number
          fee_total?: number
          guild_id: string
          id?: string
          leader_ppoji?: number
          leftover?: number
          net_profit?: number
          participant_count?: number
          party_name?: string | null
          per_person?: number
          phase_count?: number
          ppoji_pct?: number
          remainder_policy?: Database["public"]["Enums"]["remainder_policy"]
          sent?: boolean
          status?: Database["public"]["Enums"]["raid_status"]
          total_sales?: number
          updated_at?: string
        }
        Update: {
          boss_name?: string
          created_at?: string
          date?: string
          expense_total?: number
          fee_total?: number
          guild_id?: string
          id?: string
          leader_ppoji?: number
          leftover?: number
          net_profit?: number
          participant_count?: number
          party_name?: string | null
          per_person?: number
          phase_count?: number
          ppoji_pct?: number
          remainder_policy?: Database["public"]["Enums"]["remainder_policy"]
          sent?: boolean
          status?: Database["public"]["Enums"]["raid_status"]
          total_sales?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raids_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_user_guilds: { Args: never; Returns: string[] }
      confirm_settlement: {
        Args: { p_raid_id: string }
        Returns: {
          boss_name: string
          created_at: string
          date: string
          expense_total: number
          fee_total: number
          guild_id: string
          id: string
          leader_ppoji: number
          leftover: number
          net_profit: number
          participant_count: number
          party_name: string | null
          per_person: number
          phase_count: number
          ppoji_pct: number
          remainder_policy: Database["public"]["Enums"]["remainder_policy"]
          sent: boolean
          status: Database["public"]["Enums"]["raid_status"]
          total_sales: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "raids"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_role: "OWNER" | "ADMIN" | "MEMBER"
      expense_category: "CONSUMABLE" | "ENTRY" | "ETC"
      member_role: "MASTER" | "MANAGER" | "MEMBER"
      penalty_calc_type: "PERCENT" | "FIXED"
      raid_status: "DRAFT" | "CONFIRMED"
      remainder_policy: "LEADER" | "FUND" | "FIRST"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_role: ["OWNER", "ADMIN", "MEMBER"],
      expense_category: ["CONSUMABLE", "ENTRY", "ETC"],
      member_role: ["MASTER", "MANAGER", "MEMBER"],
      penalty_calc_type: ["PERCENT", "FIXED"],
      raid_status: ["DRAFT", "CONFIRMED"],
      remainder_policy: ["LEADER", "FUND", "FIRST"],
    },
  },
} as const

