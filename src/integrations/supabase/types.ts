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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bot_pending_states: {
        Row: {
          bot_token_id: string
          chat_id: number
          created_at: string
          data: Json | null
          id: string
          state: string
        }
        Insert: {
          bot_token_id: string
          chat_id: number
          created_at?: string
          data?: Json | null
          id?: string
          state: string
        }
        Update: {
          bot_token_id?: string
          chat_id?: number
          created_at?: string
          data?: Json | null
          id?: string
          state?: string
        }
        Relationships: []
      }
      bot_tokens: {
        Row: {
          admin_telegram_id: number | null
          created_at: string
          id: string
          non_subscriber_message: string
          token: string
          token_updated_at: string
          user_id: string
        }
        Insert: {
          admin_telegram_id?: number | null
          created_at?: string
          id?: string
          non_subscriber_message?: string
          token: string
          token_updated_at?: string
          user_id: string
        }
        Update: {
          admin_telegram_id?: number | null
          created_at?: string
          id?: string
          non_subscriber_message?: string
          token?: string
          token_updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      telegram_channels: {
        Row: {
          bot_token_id: string | null
          channel_id: number
          channel_name: string
          created_at: string
          id: string
          invite_link: string | null
          owner_id: string
        }
        Insert: {
          bot_token_id?: string | null
          channel_id: number
          channel_name: string
          created_at?: string
          id?: string
          invite_link?: string | null
          owner_id: string
        }
        Update: {
          bot_token_id?: string | null
          channel_id?: number
          channel_name?: string
          created_at?: string
          id?: string
          invite_link?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_channels_bot_token_id_fkey"
            columns: ["bot_token_id"]
            isOneToOne: false
            referencedRelation: "bot_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_subscribers: {
        Row: {
          bot_token_id: string | null
          created_at: string
          expires_at: string | null
          first_name: string | null
          id: string
          is_permanent: boolean
          last_name: string | null
          owner_id: string
          photo_url: string | null
          subscription_days: number | null
          telegram_user_id: number
          telegram_username: string | null
        }
        Insert: {
          bot_token_id?: string | null
          created_at?: string
          expires_at?: string | null
          first_name?: string | null
          id?: string
          is_permanent?: boolean
          last_name?: string | null
          owner_id: string
          photo_url?: string | null
          subscription_days?: number | null
          telegram_user_id: number
          telegram_username?: string | null
        }
        Update: {
          bot_token_id?: string | null
          created_at?: string
          expires_at?: string | null
          first_name?: string | null
          id?: string
          is_permanent?: boolean
          last_name?: string | null
          owner_id?: string
          photo_url?: string | null
          subscription_days?: number | null
          telegram_user_id?: number
          telegram_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_subscribers_bot_token_id_fkey"
            columns: ["bot_token_id"]
            isOneToOne: false
            referencedRelation: "bot_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
