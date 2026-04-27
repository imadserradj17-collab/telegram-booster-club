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
          auto_scan_enabled: boolean
          auto_scan_interval: number
          created_at: string
          free_trial_channel_ids: Json | null
          free_trial_days: number
          free_trial_enabled: boolean
          id: string
          mandatory_channel_id: string | null
          non_subscriber_message: string
          public_channel_id: string | null
          subscribers_channel_id: string | null
          token: string
          token_updated_at: string
          user_id: string
        }
        Insert: {
          admin_telegram_id?: number | null
          auto_scan_enabled?: boolean
          auto_scan_interval?: number
          created_at?: string
          free_trial_channel_ids?: Json | null
          free_trial_days?: number
          free_trial_enabled?: boolean
          id?: string
          mandatory_channel_id?: string | null
          non_subscriber_message?: string
          public_channel_id?: string | null
          subscribers_channel_id?: string | null
          token: string
          token_updated_at?: string
          user_id: string
        }
        Update: {
          admin_telegram_id?: number | null
          auto_scan_enabled?: boolean
          auto_scan_interval?: number
          created_at?: string
          free_trial_channel_ids?: Json | null
          free_trial_days?: number
          free_trial_enabled?: boolean
          id?: string
          mandatory_channel_id?: string | null
          non_subscriber_message?: string
          public_channel_id?: string | null
          subscribers_channel_id?: string | null
          token?: string
          token_updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_tokens_mandatory_channel_id_fkey"
            columns: ["mandatory_channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_tokens_public_channel_id_fkey"
            columns: ["public_channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_tokens_subscribers_channel_id_fkey"
            columns: ["subscribers_channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_users: {
        Row: {
          bot_token_id: string
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          owner_id: string
          photo_url: string | null
          telegram_user_id: number
          telegram_username: string | null
        }
        Insert: {
          bot_token_id: string
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          owner_id: string
          photo_url?: string | null
          telegram_user_id: number
          telegram_username?: string | null
        }
        Update: {
          bot_token_id?: string
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          owner_id?: string
          photo_url?: string | null
          telegram_user_id?: number
          telegram_username?: string | null
        }
        Relationships: []
      }
      channel_members: {
        Row: {
          bot_token_id: string
          channel_id: string
          first_name: string | null
          id: string
          joined_at: string
          last_name: string | null
          owner_id: string
          telegram_channel_id: number
          telegram_user_id: number
          telegram_username: string | null
        }
        Insert: {
          bot_token_id: string
          channel_id: string
          first_name?: string | null
          id?: string
          joined_at?: string
          last_name?: string | null
          owner_id: string
          telegram_channel_id: number
          telegram_user_id: number
          telegram_username?: string | null
        }
        Update: {
          bot_token_id?: string
          channel_id?: string
          first_name?: string | null
          id?: string
          joined_at?: string
          last_name?: string | null
          owner_id?: string
          telegram_channel_id?: number
          telegram_user_id?: number
          telegram_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          bot_token_id: string
          channel_id: string
          created_at: string
          id: string
          media_caption: string | null
          media_duration: number | null
          media_file_id: string | null
          media_file_size: number | null
          media_file_unique_id: string | null
          media_height: number | null
          media_mime_type: string | null
          media_thumbnail: string | null
          media_type: string | null
          media_width: number | null
          message_date: string
          message_text: string | null
          owner_id: string
          raw_data: Json | null
          sender_name: string | null
          sender_username: string | null
          telegram_channel_id: number
          telegram_message_id: number
        }
        Insert: {
          bot_token_id: string
          channel_id: string
          created_at?: string
          id?: string
          media_caption?: string | null
          media_duration?: number | null
          media_file_id?: string | null
          media_file_size?: number | null
          media_file_unique_id?: string | null
          media_height?: number | null
          media_mime_type?: string | null
          media_thumbnail?: string | null
          media_type?: string | null
          media_width?: number | null
          message_date?: string
          message_text?: string | null
          owner_id: string
          raw_data?: Json | null
          sender_name?: string | null
          sender_username?: string | null
          telegram_channel_id: number
          telegram_message_id: number
        }
        Update: {
          bot_token_id?: string
          channel_id?: string
          created_at?: string
          id?: string
          media_caption?: string | null
          media_duration?: number | null
          media_file_id?: string | null
          media_file_size?: number | null
          media_file_unique_id?: string | null
          media_height?: number | null
          media_mime_type?: string | null
          media_thumbnail?: string | null
          media_type?: string | null
          media_width?: number | null
          message_date?: string
          message_text?: string | null
          owner_id?: string
          raw_data?: Json | null
          sender_name?: string | null
          sender_username?: string | null
          telegram_channel_id?: number
          telegram_message_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      free_trial_users: {
        Row: {
          activated_at: string
          bot_token_id: string
          expires_at: string
          first_name: string | null
          id: string
          last_name: string | null
          owner_id: string
          telegram_user_id: number
          telegram_username: string | null
        }
        Insert: {
          activated_at?: string
          bot_token_id: string
          expires_at: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          owner_id: string
          telegram_user_id: number
          telegram_username?: string | null
        }
        Update: {
          activated_at?: string
          bot_token_id?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          owner_id?: string
          telegram_user_id?: number
          telegram_username?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved_until: string | null
          created_at: string
          id: string
          is_approved: boolean
          preferred_language: string
        }
        Insert: {
          approved_until?: string | null
          created_at?: string
          id: string
          is_approved?: boolean
          preferred_language?: string
        }
        Update: {
          approved_until?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          preferred_language?: string
        }
        Relationships: []
      }
      public_channel_members: {
        Row: {
          bot_token_id: string
          channel_id: string
          first_name: string | null
          id: string
          joined_at: string
          last_name: string | null
          owner_id: string
          telegram_user_id: number
          telegram_username: string | null
        }
        Insert: {
          bot_token_id: string
          channel_id: string
          first_name?: string | null
          id?: string
          joined_at?: string
          last_name?: string | null
          owner_id: string
          telegram_user_id: number
          telegram_username?: string | null
        }
        Update: {
          bot_token_id?: string
          channel_id?: string
          first_name?: string | null
          id?: string
          joined_at?: string
          last_name?: string | null
          owner_id?: string
          telegram_user_id?: number
          telegram_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_logs: {
        Row: {
          bot_token_id: string
          created_at: string
          details: Json | null
          id: string
          kicked_expired: number
          kicked_non_subscribers: number
          owner_id: string
        }
        Insert: {
          bot_token_id: string
          created_at?: string
          details?: Json | null
          id?: string
          kicked_expired?: number
          kicked_non_subscribers?: number
          owner_id: string
        }
        Update: {
          bot_token_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          kicked_expired?: number
          kicked_non_subscribers?: number
          owner_id?: string
        }
        Relationships: []
      }
      subscriber_channels: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          subscriber_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          subscriber_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriber_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriber_channels_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "telegram_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_channels: {
        Row: {
          bot_token_id: string | null
          channel_id: number
          channel_name: string
          channel_type: string
          created_at: string
          id: string
          invite_link: string | null
          owner_id: string
        }
        Insert: {
          bot_token_id?: string | null
          channel_id: number
          channel_name: string
          channel_type?: string
          created_at?: string
          id?: string
          invite_link?: string | null
          owner_id: string
        }
        Update: {
          bot_token_id?: string | null
          channel_id?: number
          channel_name?: string
          channel_type?: string
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
          expiry_notified: boolean
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
          expiry_notified?: boolean
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
          expiry_notified?: boolean
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
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_users_with_email: {
        Args: never
        Returns: {
          approved_until: string
          created_at: string
          email: string
          id: string
          is_approved: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      update_preferred_language: { Args: { _lang: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
