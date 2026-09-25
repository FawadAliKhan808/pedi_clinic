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
      appointments: {
        Row: {
          appointment_date: string
          cancelled_at: string | null
          child_id: string
          created_at: string
          id: string
          session_id: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        Insert: {
          appointment_date: string
          cancelled_at?: string | null
          child_id: string
          created_at?: string
          id?: string
          session_id: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        Update: {
          appointment_date?: string
          cancelled_at?: string | null
          child_id?: string
          created_at?: string
          id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          visit_reason?: Database["public"]["Enums"]["visit_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "availability_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_sessions: {
        Row: {
          cancelled_at: string | null
          clinic_id: string
          created_at: string
          date: string
          end_time: string
          id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          clinic_id: string
          created_at?: string
          date: string
          end_time: string
          id?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          clinic_id?: string
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_sessions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
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
      installs: {
        Row: {
          installed_at: string
          notifications_enabled_at: string | null
          parent_id: string
        }
        Insert: {
          installed_at?: string
          notifications_enabled_at?: string | null
          parent_id: string
        }
        Update: {
          installed_at?: string
          notifications_enabled_at?: string | null
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
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
      notifications: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          payload: Json
          push_attempted_at: string | null
          read_at: string | null
          sent_at: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          visit_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          push_attempted_at?: string | null
          read_at?: string | null
          sent_at?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          visit_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          push_attempted_at?: string | null
          read_at?: string | null
          sent_at?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          created_at: string
          parent_id: string
          stars: number
          visit_id: string
        }
        Insert: {
          created_at?: string
          parent_id: string
          stars: number
          visit_id: string
        }
        Update: {
          created_at?: string
          parent_id?: string
          stars?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_job_runs: {
        Row: {
          clinic_id: string
          job: string
          ran_at: string
          run_date: string
        }
        Insert: {
          clinic_id: string
          job: string
          ran_at?: string
          run_date: string
        }
        Update: {
          clinic_id?: string
          job?: string
          ran_at?: string
          run_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_job_runs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
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
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
          consultation_started_at?: string | null
          created_at?: string
          follow_up_date?: string | null
          id?: string
          seq: number
          source?: Database["public"]["Enums"]["visit_source"]
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
          consultation_started_at?: string | null
          created_at?: string
          follow_up_date?: string | null
          id?: string
          seq?: number
          source?: Database["public"]["Enums"]["visit_source"]
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
          visit_date?: string
          visit_reason?: Database["public"]["Enums"]["visit_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "visits_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
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
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
      appointment_sessions: {
        Args: { p_clinic_id: string; p_from: string; p_to: string }
        Returns: {
          booked_count: number
          clinic_id: string
          date: string
          end_time: string
          session_id: string
          start_time: string
        }[]
      }
      assert_session_bookable: {
        Args: {
          p_enforce_window: boolean
          p_session: Database["public"]["Tables"]["availability_sessions"]["Row"]
        }
        Returns: undefined
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
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
      book_appointment: {
        Args: {
          p_child_id: string
          p_session_id: string
          p_visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        Returns: {
          appointment_date: string
          cancelled_at: string | null
          child_id: string
          created_at: string
          id: string
          session_id: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      booking_window: {
        Args: never
        Returns: {
          clinic_id: string
          from_date: string
          session_presets: Json
          to_date: string
          today: string
        }[]
      }
      broadcast_appointments_change: {
        Args: { p_clinic_id: string }
        Returns: undefined
      }
      call_visit: {
        Args: { p_visit_id: string }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
      cancel_session: { Args: { p_session_id: string }; Returns: number }
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
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
      child_visit_timeline: {
        Args: { p_child_id: string }
        Returns: {
          called_at: string
          completed_at: string
          consultation: number
          follow_up_date: string
          from_appointment: boolean
          medicines: Json
          other: number
          payments: Json
          pharmacy_status: Database["public"]["Enums"]["pharmacy_order_status"]
          pharmacy_total: number
          reason: Database["public"]["Enums"]["visit_reason"]
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          storage_keys: string[]
          vaccination: number
          visit_date: string
          visit_id: string
        }[]
      }
      claim_pending_pushes: {
        Args: { p_limit?: number }
        Returns: {
          appointment_id: string | null
          created_at: string
          id: string
          payload: Json
          push_attempted_at: string | null
          read_at: string | null
          sent_at: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          visit_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clinic_appointments: {
        Args: { p_clinic_id: string; p_from: string; p_to: string }
        Returns: {
          appointment_id: string
          appointment_status: Database["public"]["Enums"]["appointment_status"]
          booked_count: number
          child_dob: string
          child_id: string
          child_name: string
          date: string
          end_time: string
          parent_name: string
          parent_phone: string
          session_id: string
          start_time: string
          token_seq: number
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }[]
      }
      clinic_local_time: { Args: { p_clinic_id: string }; Returns: string }
      clinic_patients_on: {
        Args: { p_clinic_id: string; p_date: string }
        Returns: {
          child_dob: string
          child_id: string
          child_name: string
          parent_name: string
          parent_phone: string
          reason: Database["public"]["Enums"]["visit_reason"]
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          visit_count: number
          visit_id: string
        }[]
      }
      clinic_today: { Args: { p_clinic_id: string }; Returns: string }
      close_day: {
        Args: { p_clinic_id: string; p_date: string }
        Returns: number
      }
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
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
      configure_notification_dispatch: {
        Args: { p_secret: string; p_url: string }
        Returns: undefined
      }
      copy_week: {
        Args: {
          p_clinic_id: string
          p_from_week_start: string
          p_to_week_start: string
        }
        Returns: number
      }
      create_session: {
        Args: {
          p_clinic_id: string
          p_date: string
          p_end_time: string
          p_start_time: string
        }
        Returns: {
          cancelled_at: string | null
          clinic_id: string
          created_at: string
          date: string
          end_time: string
          id: string
          start_time: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "availability_sessions"
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
      delete_child: { Args: { p_child_id: string }; Returns: undefined }
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
      doctor_analytics: {
        Args: { p_clinic_id: string; p_from: string; p_to: string }
        Returns: Json
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
          parent_name: string
          parent_phone: string
          reason: Database["public"]["Enums"]["visit_reason"]
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          visit_id: string
        }[]
      }
      end_of_day_summary: {
        Args: { p_clinic_id: string; p_date: string }
        Returns: Json
      }
      has_rated_app: { Args: never; Returns: boolean }
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
      mark_missed_appointments: {
        Args: { p_clinic_id: string; p_today: string }
        Returns: number
      }
      mark_notifications_read: {
        Args: { p_ids?: string[] }
        Returns: undefined
      }
      mark_pushes_sent: { Args: { p_ids: string[] }; Returns: undefined }
      minutes_of_day: { Args: { p_time: string }; Returns: number }
      my_appointments: {
        Args: never
        Returns: {
          appointment_id: string
          child_id: string
          child_name: string
          date: string
          end_time: string
          session_id: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          visit_reason: Database["public"]["Enums"]["visit_reason"]
        }[]
      }
      notify_appointment_change: {
        Args: { p_appointment_id: string; p_change: string }
        Returns: undefined
      }
      notify_booking_request: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      owner_overview: { Args: never; Returns: Json }
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
      record_install: {
        Args: never
        Returns: {
          installed_at: string
          notifications_enabled_at: string | null
          parent_id: string
        }
        SetofOptions: {
          from: "*"
          to: "installs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_notifications_enabled: {
        Args: never
        Returns: {
          installed_at: string
          notifications_enabled_at: string | null
          parent_id: string
        }
        SetofOptions: {
          from: "*"
          to: "installs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: undefined
      }
      remove_visit: {
        Args: { p_visit_id: string }
        Returns: {
          appointment_id: string | null
          called_at: string | null
          child_id: string
          clinic_id: string
          completed_at: string | null
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
      request_push_dispatch: { Args: never; Returns: undefined }
      reset_clinic_data: { Args: never; Returns: Json }
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
      run_scheduled_jobs: { Args: never; Returns: Json }
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
      search_consulted_children: {
        Args: { p_clinic_id: string; p_query: string }
        Returns: {
          child_id: string
          child_name: string
          consultation_count: number
          dob: string
          last_consultation_date: string
          parent_name: string
          parent_phone: string
        }[]
      }
      send_appointment_reminders: {
        Args: {
          p_clinic_id: string
          p_date: string
          p_kind: Database["public"]["Enums"]["notification_type"]
        }
        Returns: number
      }
      send_follow_up_reminders: {
        Args: { p_clinic_id: string; p_today: string }
        Returns: number
      }
      setting_int: {
        Args: { p_clinic_id: string; p_key: string }
        Returns: number
      }
      setting_text: {
        Args: { p_clinic_id: string; p_key: string }
        Returns: string
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
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
          consultation_started_at: string | null
          created_at: string
          follow_up_date: string | null
          id: string
          seq: number
          source: Database["public"]["Enums"]["visit_source"]
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
      submit_app_rating: {
        Args: { p_stars: number; p_visit_id: string }
        Returns: {
          created_at: string
          parent_id: string
          stars: number
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_child: {
        Args: { p_child_id: string; p_dob: string; p_name: string }
        Returns: {
          created_at: string
          dob: string
          id: string
          name: string
          parent_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "children"
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
      appointment_status:
        | "pending"
        | "booked"
        | "cancelled"
        | "missed"
        | "attended"
        | "rejected"
      notification_type:
        | "third_in_line"
        | "your_turn"
        | "follow_up_reminder"
        | "appointment_tomorrow"
        | "appointment_today"
        | "appointment_changed"
        | "booking_request"
        | "booking_update"
        | "token_skipped"
        | "token_removed"
      payment_mode: "cash" | "upi" | "card"
      pharmacy_order_status: "pending" | "dispensed" | "skipped"
      staff_role: "doctor" | "pharmacist" | "owner"
      visit_reason: "vaccination" | "general_checkup"
      visit_source: "app" | "walk_in"
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
      appointment_status: [
        "pending",
        "booked",
        "cancelled",
        "missed",
        "attended",
        "rejected",
      ],
      notification_type: [
        "third_in_line",
        "your_turn",
        "follow_up_reminder",
        "appointment_tomorrow",
        "appointment_today",
        "appointment_changed",
        "booking_request",
        "booking_update",
        "token_skipped",
        "token_removed",
      ],
      payment_mode: ["cash", "upi", "card"],
      pharmacy_order_status: ["pending", "dispensed", "skipped"],
      staff_role: ["doctor", "pharmacist", "owner"],
      visit_reason: ["vaccination", "general_checkup"],
      visit_source: ["app", "walk_in"],
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
