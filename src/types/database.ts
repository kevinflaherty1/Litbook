export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      custom_fields: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          field_type: Database["public"]["Enums"]["custom_field_type"];
          help_text: string | null;
          id: string;
          label: string;
          options: string[];
          organization_id: string;
          position: number;
          required: boolean;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          field_type?: Database["public"]["Enums"]["custom_field_type"];
          help_text?: string | null;
          id?: string;
          label: string;
          options?: string[];
          organization_id: string;
          position?: number;
          required?: boolean;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          field_type?: Database["public"]["Enums"]["custom_field_type"];
          help_text?: string | null;
          id?: string;
          label?: string;
          options?: string[];
          organization_id?: string;
          position?: number;
          required?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "custom_fields_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custom_fields_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      episode_guests: {
        Row: {
          created_at: string;
          created_by: string | null;
          episode_id: string;
          guest_id: string;
          id: string;
          last_reminder_at: string | null;
          link_emailed_at: string | null;
          organization_id: string;
          ready_at: string | null;
          reminder_count: number;
          status: Database["public"]["Enums"]["onboarding_status"];
          submitted_at: string | null;
          token_expires_at: string | null;
          token_hash: string | null;
          token_last_used_at: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          episode_id: string;
          guest_id: string;
          id?: string;
          last_reminder_at?: string | null;
          link_emailed_at?: string | null;
          organization_id: string;
          ready_at?: string | null;
          reminder_count?: number;
          status?: Database["public"]["Enums"]["onboarding_status"];
          submitted_at?: string | null;
          token_expires_at?: string | null;
          token_hash?: string | null;
          token_last_used_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          episode_id?: string;
          guest_id?: string;
          id?: string;
          last_reminder_at?: string | null;
          link_emailed_at?: string | null;
          organization_id?: string;
          ready_at?: string | null;
          reminder_count?: number;
          status?: Database["public"]["Enums"]["onboarding_status"];
          submitted_at?: string | null;
          token_expires_at?: string | null;
          token_hash?: string | null;
          token_last_used_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "episode_guests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "episode_guests_organization_id_episode_id_fkey";
            columns: ["organization_id", "episode_id"];
            isOneToOne: false;
            referencedRelation: "episodes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "episode_guests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "episode_guests_organization_id_guest_id_fkey";
            columns: ["organization_id", "guest_id"];
            isOneToOne: false;
            referencedRelation: "guests";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      episodes: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          episode_number: number | null;
          id: string;
          organization_id: string;
          publish_at: string | null;
          recording_at: string | null;
          status: Database["public"]["Enums"]["episode_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          episode_number?: number | null;
          id?: string;
          organization_id: string;
          publish_at?: string | null;
          recording_at?: string | null;
          status?: Database["public"]["Enums"]["episode_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          episode_number?: number | null;
          id?: string;
          organization_id?: string;
          publish_at?: string | null;
          recording_at?: string | null;
          status?: Database["public"]["Enums"]["episode_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "episodes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "episodes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      guests: {
        Row: {
          created_at: string;
          created_by: string | null;
          email: string | null;
          full_name: string;
          id: string;
          internal_notes: string | null;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          internal_notes?: string | null;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          internal_notes?: string | null;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          billing_event_at: string | null;
          brand_color: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          created_by: string | null;
          current_period_end: string | null;
          guest_reminders_enabled: boolean;
          id: string;
          logo_path: string | null;
          name: string;
          portal_welcome: string | null;
          release_form_text: string;
          release_form_version: number;
          slug: string;
          stripe_customer_id: string | null;
          stripe_price_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: Database["public"]["Enums"]["subscription_status"] | null;
          updated_at: string;
        };
        Insert: {
          billing_event_at?: string | null;
          brand_color?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          created_by?: string | null;
          current_period_end?: string | null;
          guest_reminders_enabled?: boolean;
          id?: string;
          logo_path?: string | null;
          name: string;
          portal_welcome?: string | null;
          release_form_text?: string;
          release_form_version?: number;
          slug: string;
          stripe_customer_id?: string | null;
          stripe_price_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: Database["public"]["Enums"]["subscription_status"] | null;
          updated_at?: string;
        };
        Update: {
          billing_event_at?: string | null;
          brand_color?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          created_by?: string | null;
          current_period_end?: string | null;
          guest_reminders_enabled?: boolean;
          id?: string;
          logo_path?: string | null;
          name?: string;
          portal_welcome?: string | null;
          release_form_text?: string;
          release_form_version?: number;
          slug?: string;
          stripe_customer_id?: string | null;
          stripe_price_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: Database["public"]["Enums"]["subscription_status"] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          hits: number;
          key: string;
          window_start: string;
        };
        Insert: {
          hits?: number;
          key: string;
          window_start: string;
        };
        Update: {
          hits?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      stripe_events: {
        Row: {
          id: string;
          processed_at: string;
          type: string;
        };
        Insert: {
          id: string;
          processed_at?: string;
          type: string;
        };
        Update: {
          id?: string;
          processed_at?: string;
          type?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          created_at: string;
          custom_answers: NonNullable<Json>;
          display_name: string | null;
          episode_guest_id: string;
          headline: string | null;
          headshot_path: string | null;
          id: string;
          long_bio: string | null;
          name_pronunciation: string | null;
          organization_id: string;
          pronouns: string | null;
          release_ip: unknown;
          release_signed_at: string | null;
          release_signed_name: string | null;
          release_text_snapshot: string | null;
          release_user_agent: string | null;
          release_version: number | null;
          short_bio: string | null;
          social_links: NonNullable<Json>;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          created_at?: string;
          custom_answers?: NonNullable<Json>;
          display_name?: string | null;
          episode_guest_id: string;
          headline?: string | null;
          headshot_path?: string | null;
          id?: string;
          long_bio?: string | null;
          name_pronunciation?: string | null;
          organization_id: string;
          pronouns?: string | null;
          release_ip?: unknown;
          release_signed_at?: string | null;
          release_signed_name?: string | null;
          release_text_snapshot?: string | null;
          release_user_agent?: string | null;
          release_version?: number | null;
          short_bio?: string | null;
          social_links?: NonNullable<Json>;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          created_at?: string;
          custom_answers?: NonNullable<Json>;
          display_name?: string | null;
          episode_guest_id?: string;
          headline?: string | null;
          headshot_path?: string | null;
          id?: string;
          long_bio?: string | null;
          name_pronunciation?: string | null;
          organization_id?: string;
          pronouns?: string | null;
          release_ip?: unknown;
          release_signed_at?: string | null;
          release_signed_name?: string | null;
          release_text_snapshot?: string | null;
          release_user_agent?: string | null;
          release_version?: number | null;
          short_bio?: string | null;
          social_links?: NonNullable<Json>;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_organization_id_episode_guest_id_fkey";
            columns: ["organization_id", "episode_guest_id"];
            isOneToOne: false;
            referencedRelation: "episode_guests";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      apply_stripe_subscription: {
        Args: {
          p_cancel_at_period_end: boolean;
          p_current_period_end: string;
          p_customer: string;
          p_event_at: string;
          p_org: string;
          p_price: string;
          p_status: Database["public"]["Enums"]["subscription_status"];
          p_subscription: string;
        };
        Returns: string;
      };
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      claim_onboarding_reminders: {
        Args: { p_gap?: string; p_limit?: number; p_max?: number };
        Returns: {
          episode_guest_id: string;
          episode_title: string;
          guest_email: string;
          guest_name: string;
          organization_name: string;
          recording_at: string;
          reminder_number: number;
        }[];
      };
      create_invitation: {
        Args: { p_email: string; p_org: string; p_role?: Database["public"]["Enums"]["org_role"] };
        Returns: string;
      };
      create_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: {
          billing_event_at: string | null;
          brand_color: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          created_by: string | null;
          current_period_end: string | null;
          guest_reminders_enabled: boolean;
          id: string;
          logo_path: string | null;
          name: string;
          portal_welcome: string | null;
          release_form_text: string;
          release_form_version: number;
          slug: string;
          stripe_customer_id: string | null;
          stripe_price_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: Database["public"]["Enums"]["subscription_status"] | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      generate_token: { Args: Record<PropertyKey, never>; Returns: string };
      get_invitation_preview: { Args: { p_token: string }; Returns: Json };
      get_onboarding_context: { Args: { p_token: string }; Returns: Json };
      has_org_role: {
        Args: { p_org: string; p_roles: Database["public"]["Enums"]["org_role"][] };
        Returns: boolean;
      };
      hash_token: { Args: { p_token: string }; Returns: string };
      is_org_member: { Args: { p_org: string }; Returns: boolean };
      issue_onboarding_token: {
        Args: { p_emailed?: boolean; p_episode_guest_id: string; p_ttl?: string };
        Returns: string;
      };
      org_has_active_subscription: { Args: { p_org: string }; Returns: boolean };
      record_onboarding_visit: { Args: { p_token: string }; Returns: undefined };
      set_onboarding_token: {
        Args: { p_episode_guest_id: string; p_token: string; p_ttl?: string };
        Returns: boolean;
      };
      shares_org_with: { Args: { p_user: string }; Returns: boolean };
      storage_object_org_id: { Args: { p_name: string }; Returns: string };
      submit_onboarding: {
        Args: { p_ip?: unknown; p_payload: Json; p_token: string; p_user_agent?: string };
        Returns: undefined;
      };
    };
    Enums: {
      custom_field_type: "short_text" | "long_text" | "url" | "select" | "checkbox";
      episode_status: "draft" | "scheduled" | "recorded" | "published" | "archived";
      onboarding_status: "pending" | "assets_submitted" | "ready" | "cancelled";
      org_role: "owner" | "admin" | "member";
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      custom_field_type: ["short_text", "long_text", "url", "select", "checkbox"],
      episode_status: ["draft", "scheduled", "recorded", "published", "archived"],
      onboarding_status: ["pending", "assets_submitted", "ready", "cancelled"],
      org_role: ["owner", "admin", "member"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
      ],
    },
  },
} as const;
