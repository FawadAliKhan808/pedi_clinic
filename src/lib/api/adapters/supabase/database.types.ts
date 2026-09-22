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
      fees: {
        Row: {
          consultation: number
          created_at: string
          other: number
          updated_at: string
          vaccination: number
          visit_id: string
        }
        Insert: {
          consultation?: number
          created_at?: string
          other?: number
          updated_at?: string
          vaccination?: number
          visit_id: string
        }
        Update: {
          consultation?: number
          created_at?: string
          other?: number
          updated_at?: string
          vaccination?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fees_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      medicines: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          stock: number
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name: string
          stock?: number
          unit: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          stock?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicines_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          medicine_id: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          medicine_id: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          medicine_id?: string
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_orders"
            referencedColumns: ["id"]
          },
        ]
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
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["payment_mode"]
          visit_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          mode: Database["public"]["Enums"]["payment_mode"]
          visit_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["payment_mode"]
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_orders: {
        Row: {
          clinic_id: string
          created_at: string
          dispensed_at: string | null
          id: string
          status: Database["public"]["Enums"]["pharmacy_order_status"]
          total: number
          updated_at: string
          visit_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          dispensed_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["pharmacy_order_status"]
          total?: number
          updated_at?: string
          visit_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          dispensed_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["pharmacy_order_status"]
          total?: number
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_orders_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_orders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_images: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          storage_key: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order: number
          storage_key: string
          visit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          storage_key?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_images_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          created_at: string
          stars: number
          visit_id: string
        }
        Insert: {
          created_at?: string
          stars: number
          visit_id: string
        }
        Update: {
          created_at?: string
          stars?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
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
      add_medicine: {
        Args: {
          p_clinic_id: string
          p_initial_stock: number
          p_low_stock_threshold: number
          p_name: string
          p_unit: string
          p_unit_price: number
        }
        Returns: {
          clinic_id: string
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          stock: number
          unit: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "medicines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      can_access_visit: { Args: { p_visit_id: string }; Returns: boolean }
      can_edit_visit: { Args: { p_visit_id: string }; Returns: boolean }
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
      child_visit_history: {
        Args: { p_child_id: string }
        Returns: {
          completed_at: string
          fee_total: number
          follow_up_date: string
          reason: Database["public"]["Enums"]["visit_reason"]
          status: Database["public"]["Enums"]["visit_status"]
          storage_keys: string[]
          visit_date: string
          visit_id: string
        }[]
      }
      clinic_today: { Args: { p_clinic_id: string }; Returns: string }
      complete_visit: {
        Args: {
          p_consultation: number
          p_follow_up_date?: string
          p_other: number
          p_payments: Json
          p_prescription_keys?: string[]
          p_vaccination: number
          p_visit_id: string
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
      current_staff_roles: {
        Args: never
        Returns: {
          clinic_id: string
          role: Database["public"]["Enums"]["staff_role"]
        }[]
      }
      default_clinic_id: { Args: never; Returns: string }
      dispense_order: {
        Args: { p_items: Json; p_visit_id: string }
        Returns: {
          clinic_id: string
          created_at: string
          dispensed_at: string | null
          id: string
          status: Database["public"]["Enums"]["pharmacy_order_status"]
          total: number
          updated_at: string
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pharmacy_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      is_own_child: { Args: { p_child_id: string }; Returns: boolean }
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
      pharmacy_feed: {
        Args: { p_clinic_id: string }
        Returns: {
          child_dob: string
          child_name: string
          completed_at: string
          order_id: string
          reason: Database["public"]["Enums"]["visit_reason"]
          seq: number
          storage_keys: string[]
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
      restock_medicine: {
        Args: { p_medicine_id: string; p_quantity: number }
        Returns: {
          clinic_id: string
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          stock: number
          unit: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "medicines"
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
      skip_pharmacy_order: {
        Args: { p_visit_id: string }
        Returns: {
          clinic_id: string
          created_at: string
          dispensed_at: string | null
          id: string
          status: Database["public"]["Enums"]["pharmacy_order_status"]
          total: number
          updated_at: string
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pharmacy_orders"
          isOneToOne: true
          isSetofReturn: false
        }
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
      visit_id_from_storage_path: { Args: { p_name: string }; Returns: string }
      visit_summary: {
        Args: { p_visit_id: string }
        Returns: {
          child_id: string
          child_name: string
          completed_at: string
          fee_total: number
          follow_up_date: string
          rating_stars: number
          reason: Database["public"]["Enums"]["visit_reason"]
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          storage_keys: string[]
          visit_date: string
          visit_id: string
        }[]
      }
    }
    Enums: {
      payment_mode: "cash" | "upi" | "card"
      pharmacy_order_status: "pending" | "dispensed" | "skipped"
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
      payment_mode: ["cash", "upi", "card"],
      pharmacy_order_status: ["pending", "dispensed", "skipped"],
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
