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
      children: {
        Row: {
          created_at: string
          dob: string
          id: string
          name: string
          parent_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dob: string
          id?: string
          name: string
          parent_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dob?: string
          id?: string
          name?: string
          parent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      parents: {
        Row: {
          created_at: string
          id: string
          name: string | null
          phone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          phone: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          phone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          clinic_id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          clinic_id: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          clinic_id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          clinic_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        Insert: {
          appointment_id?: string | null
          called_at?: string | null
          child_id: string
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          follow_up_date?: string | null
          id?: string
          seq: number
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        Update: {
          appointment_id?: string | null
          called_at?: string | null
          child_id?: string
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          follow_up_date?: string | null
          id?: string
          seq?: number
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
          visit_date?: string
          visit_reason?: Database["public"]["Enums"]["visit_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "visits_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_walk_in: {
        Args: {
          p_child_dob: string
          p_child_name: string
          p_clinic_id: string
          p_parent_phone: string
          p_visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_token: {
        Args: {
          p_appointment_id: string
          p_child_id: string
          p_clinic_id: string
          p_enforce_parent_id: string
          p_visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      call_visit: {
        Args: { p_visit_id: string }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in: {
        Args: {
          p_appointment_id?: string
          p_child_id: string
          p_visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clinic_today: { Args: { p_clinic_id: string }; Returns: string }
      current_staff_roles: {
        Args: never
        Returns: {
          clinic_id: string
          role: Database["public"]["Enums"]["staff_role"]
        }[]
      }
      default_clinic_id: { Args: never; Returns: string }
      doctor_queue: {
        Args: { p_clinic_id: string }
        Returns: {
          called_at: string
          child_dob: string
          child_id: string
          child_name: string
          created_at: string
          has_appointment: boolean
          is_returning: boolean
          parent_phone: string
          reason: Database["public"]["Enums"]["visit_reason"]
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          visit_id: string
        }[]
      }
      is_clinic_staff: {
        Args: {
          p_clinic_id: string
          p_roles: Database["public"]["Enums"]["staff_role"][]
        }
        Returns: boolean
      }
      is_staff: {
        Args: { roles: Database["public"]["Enums"]["staff_role"][] }
        Returns: boolean
      }
      parent_queue_view: {
        Args: never
        Returns: {
          child_id: string
          child_name: string
          clinic_id: string
          now_serving_seq: number
          patients_ahead: number
          reason: Database["public"]["Enums"]["visit_reason"]
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          visit_date: string
          visit_id: string
        }[]
      }
      remove_visit: {
        Args: { p_visit_id: string }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_children: {
        Args: { p_clinic_id: string; p_query: string }
        Returns: {
          child_id: string
          child_name: string
          dob: string
          last_visit_date: string
          parent_id: string
          parent_name: string
          parent_phone: string
        }[]
      }
      setting_int: {
        Args: { p_clinic_id: string; p_key: string }
        Returns: number
      }
      skip_visit: {
        Args: { p_visit_id: string }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_consultation: {
        Args: { p_visit_id: string }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_parent_profile: {
        Args: { p_name?: string }
        Returns: {
          created_at: string
          id: string
          name: string | null
          phone: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "parents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      staff_role: "doctor" | "pharmacist" | "owner"
      visit_reason: "vaccination" | "general_checkup"
      visit_status:
        | "waiting"
        | "called"
        | "in_consultation"
        | "completed"
        | "skipped"
        | "removed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      staff_role: ["doctor", "pharmacist", "owner"],
      visit_reason: ["vaccination", "general_checkup"],
      visit_status: [
        "waiting",
        "called",
        "in_consultation",
        "completed",
        "skipped",
        "removed",
      ],
    },
  },
} as const
