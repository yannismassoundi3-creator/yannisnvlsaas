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
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
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
      ad_campaigns: {
        Row: {
          created_at: string;
          external_id: string | null;
          id: string;
          import_job_id: string | null;
          match_key: string | null;
          name: string;
          organization_id: string;
          platform: string;
          product_id: string | null;
          store_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          external_id?: string | null;
          id?: string;
          import_job_id?: string | null;
          match_key?: never;
          name: string;
          organization_id: string;
          platform: string;
          product_id?: string | null;
          store_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          external_id?: string | null;
          id?: string;
          import_job_id?: string | null;
          match_key?: never;
          name?: string;
          organization_id?: string;
          platform?: string;
          product_id?: string | null;
          store_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_campaigns_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "ad_campaigns_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_campaigns_product_id_organization_id_fkey";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "ad_campaigns_store_id_organization_id_fkey";
            columns: ["store_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      ad_spend_daily: {
        Row: {
          campaign_id: string;
          clicks: number;
          conversion_value_minor: number;
          conversions: number;
          created_at: string;
          id: string;
          import_job_id: string | null;
          impressions: number;
          organization_id: string;
          source: string;
          spend_date: string;
          spend_minor: number;
          store_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          campaign_id: string;
          clicks?: number;
          conversion_value_minor?: number;
          conversions?: number;
          created_at?: string;
          id?: string;
          import_job_id?: string | null;
          impressions?: number;
          organization_id: string;
          source?: string;
          spend_date: string;
          spend_minor: number;
          store_id: string;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string;
          clicks?: number;
          conversion_value_minor?: number;
          conversions?: number;
          created_at?: string;
          id?: string;
          import_job_id?: string | null;
          impressions?: number;
          organization_id?: string;
          source?: string;
          spend_date?: string;
          spend_minor?: number;
          store_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ad_spend_daily_campaign_id_organization_id_fkey";
            columns: ["campaign_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "ad_campaigns";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "ad_spend_daily_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_spend_daily_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "ad_spend_daily_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_spend_daily_store_id_organization_id_fkey";
            columns: ["store_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: number;
          metadata: NonNullable<Json>;
          organization_id: string | null;
          target_id: string | null;
          target_type: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          organization_id?: string | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          organization_id?: string | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_customers: {
        Row: {
          created_at: string;
          organization_id: string;
          stripe_customer_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          organization_id: string;
          stripe_customer_id: string;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          stripe_customer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_customers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "billing_customers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_events: {
        Row: {
          error: string | null;
          id: string;
          organization_id: string | null;
          processed_at: string | null;
          received_at: string;
          status: string;
          stripe_created_at: string;
          summary: NonNullable<Json>;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          error?: string | null;
          id: string;
          organization_id?: string | null;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
          stripe_created_at: string;
          summary?: NonNullable<Json>;
          type: string;
        };
        Update: {
          error?: string | null;
          id?: string;
          organization_id?: string | null;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
          stripe_created_at?: string;
          summary?: NonNullable<Json>;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "billing_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount_minor: number;
          category: string;
          created_at: string;
          description: string | null;
          fingerprint: string | null;
          id: string;
          import_job_id: string | null;
          incurred_on: string;
          kind: string;
          organization_id: string;
          source: string;
          store_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          category: string;
          created_at?: string;
          description?: string | null;
          fingerprint?: never;
          id?: string;
          import_job_id?: string | null;
          incurred_on: string;
          kind: string;
          organization_id: string;
          source?: string;
          store_id: string;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          category?: string;
          created_at?: string;
          description?: string | null;
          fingerprint?: never;
          id?: string;
          import_job_id?: string | null;
          incurred_on?: string;
          kind?: string;
          organization_id?: string;
          source?: string;
          store_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "expenses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_store_id_organization_id_fkey";
            columns: ["store_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      feedback: {
        Row: {
          created_at: string;
          id: number;
          kind: string;
          message: string;
          organization_id: string | null;
          page: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          kind: string;
          message: string;
          organization_id?: string | null;
          page?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          kind?: string;
          message?: string;
          organization_id?: string | null;
          page?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "feedback_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      import_jobs: {
        Row: {
          committed_at: string | null;
          created_at: string;
          created_by: string | null;
          duplicate_rows: number;
          error_message: string | null;
          file_name: string;
          file_size_bytes: number | null;
          id: string;
          inserted_count: number;
          invalid_rows: number;
          kind: string;
          mapping: NonNullable<Json>;
          options: NonNullable<Json>;
          organization_id: string;
          rolled_back_at: string | null;
          skipped_count: number;
          status: string;
          store_id: string;
          total_rows: number;
          updated_at: string;
          updated_count: number;
          valid_rows: number;
          validated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          committed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          duplicate_rows?: number;
          error_message?: string | null;
          file_name: string;
          file_size_bytes?: number | null;
          id?: string;
          inserted_count?: number;
          invalid_rows?: number;
          kind: string;
          mapping?: NonNullable<Json>;
          options?: NonNullable<Json>;
          organization_id: string;
          rolled_back_at?: string | null;
          skipped_count?: number;
          status?: string;
          store_id: string;
          total_rows?: number;
          updated_at?: string;
          updated_count?: number;
          valid_rows?: number;
          validated_at?: string | null;
        };
        Update: {
          committed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          duplicate_rows?: number;
          error_message?: string | null;
          file_name?: string;
          file_size_bytes?: number | null;
          id?: string;
          inserted_count?: number;
          invalid_rows?: number;
          kind?: string;
          mapping?: NonNullable<Json>;
          options?: NonNullable<Json>;
          organization_id?: string;
          rolled_back_at?: string | null;
          skipped_count?: number;
          status?: string;
          store_id?: string;
          total_rows?: number;
          updated_at?: string;
          updated_count?: number;
          valid_rows?: number;
          validated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "import_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "import_jobs_store_id_organization_id_fkey";
            columns: ["store_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      import_rows: {
        Row: {
          chunk: number | null;
          data: Json | null;
          dedupe_key: string | null;
          errors: NonNullable<Json>;
          id: number;
          import_job_id: string;
          organization_id: string;
          previous: Json | null;
          raw: NonNullable<Json>;
          row_number: number;
          status: string;
          warnings: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          chunk?: number | null;
          data?: Json | null;
          dedupe_key?: string | null;
          errors?: NonNullable<Json>;
          id?: never;
          import_job_id: string;
          organization_id: string;
          previous?: Json | null;
          raw: NonNullable<Json>;
          row_number: number;
          status: string;
          warnings?: NonNullable<Json>;
        };
        Update: {
          chunk?: number | null;
          data?: Json | null;
          dedupe_key?: string | null;
          errors?: NonNullable<Json>;
          id?: never;
          import_job_id?: string;
          organization_id?: string;
          previous?: Json | null;
          raw?: NonNullable<Json>;
          row_number?: number;
          status?: string;
          warnings?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "import_rows_import_job_id_organization_id_fkey";
            columns: ["import_job_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "import_rows_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "import_rows_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          discount_minor: number;
          gross_minor: number;
          id: string;
          name: string;
          order_id: string;
          organization_id: string;
          position: number;
          product_id: string | null;
          quantity: number;
          sku: string | null;
          unit_cost_e4: number | null;
        };
        ComputedFields: never;
        Insert: {
          discount_minor?: number;
          gross_minor: number;
          id?: string;
          name: string;
          order_id: string;
          organization_id: string;
          position: number;
          product_id?: string | null;
          quantity: number;
          sku?: string | null;
          unit_cost_e4?: number | null;
        };
        Update: {
          discount_minor?: number;
          gross_minor?: number;
          id?: string;
          name?: string;
          order_id?: string;
          organization_id?: string;
          position?: number;
          product_id?: string | null;
          quantity?: number;
          sku?: string | null;
          unit_cost_e4?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_organization_id_fkey";
            columns: ["order_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "order_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "order_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_organization_id_fkey";
            columns: ["product_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      orders: {
        Row: {
          converted_from_tax_inclusive: boolean;
          created_at: string;
          external_id: string;
          id: string;
          import_job_id: string | null;
          note: string | null;
          ordered_at: string;
          organization_id: string;
          sales_channel: string | null;
          shipping_charged_minor: number;
          shipping_cost_minor: number | null;
          source: string;
          store_id: string;
          taxes_minor: number;
          transaction_fees_minor: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          converted_from_tax_inclusive?: boolean;
          created_at?: string;
          external_id: string;
          id?: string;
          import_job_id?: string | null;
          note?: string | null;
          ordered_at: string;
          organization_id: string;
          sales_channel?: string | null;
          shipping_charged_minor?: number;
          shipping_cost_minor?: number | null;
          source?: string;
          store_id: string;
          taxes_minor?: number;
          transaction_fees_minor?: number | null;
          updated_at?: string;
        };
        Update: {
          converted_from_tax_inclusive?: boolean;
          created_at?: string;
          external_id?: string;
          id?: string;
          import_job_id?: string | null;
          note?: string | null;
          ordered_at?: string;
          organization_id?: string;
          sales_channel?: string | null;
          shipping_charged_minor?: number;
          shipping_cost_minor?: number | null;
          source?: string;
          store_id?: string;
          taxes_minor?: number;
          transaction_fees_minor?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_store_id_organization_id_fkey";
            columns: ["store_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          trial_ends_at: string;
          trial_started_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          trial_ends_at?: string;
          trial_started_at?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          trial_ends_at?: string;
          trial_started_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_events: {
        Row: {
          created_at: string;
          event: string;
          id: number;
          organization_id: string | null;
          properties: NonNullable<Json>;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event: string;
          id?: never;
          organization_id?: string | null;
          properties?: NonNullable<Json>;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          event?: string;
          id?: never;
          organization_id?: string | null;
          properties?: NonNullable<Json>;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "product_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          acquired_on: string | null;
          archived_at: string | null;
          created_at: string;
          id: string;
          import_job_id: string | null;
          match_key: string | null;
          name: string;
          organization_id: string;
          price_minor: number | null;
          sku: string | null;
          source: string;
          store_id: string;
          unit_cost_e4: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          acquired_on?: string | null;
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          import_job_id?: string | null;
          match_key?: never;
          name: string;
          organization_id: string;
          price_minor?: number | null;
          sku?: string | null;
          source?: string;
          store_id: string;
          unit_cost_e4?: number | null;
          updated_at?: string;
        };
        Update: {
          acquired_on?: string | null;
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          import_job_id?: string | null;
          match_key?: never;
          name?: string;
          organization_id?: string;
          price_minor?: number | null;
          sku?: string | null;
          source?: string;
          store_id?: string;
          unit_cost_e4?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_store_id_organization_id_fkey";
            columns: ["store_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      refunds: {
        Row: {
          amount_minor: number;
          created_at: string;
          date_estimated: boolean;
          external_id: string | null;
          id: string;
          import_job_id: string | null;
          order_id: string | null;
          organization_id: string;
          reason: string | null;
          refunded_at: string;
          source: string;
          store_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          created_at?: string;
          date_estimated?: boolean;
          external_id?: string | null;
          id?: string;
          import_job_id?: string | null;
          order_id?: string | null;
          organization_id: string;
          reason?: string | null;
          refunded_at: string;
          source?: string;
          store_id: string;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          date_estimated?: boolean;
          external_id?: string | null;
          id?: string;
          import_job_id?: string | null;
          order_id?: string | null;
          organization_id?: string;
          reason?: string | null;
          refunded_at?: string;
          source?: string;
          store_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refunds_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_order_id_organization_id_fkey";
            columns: ["order_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "refunds_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "refunds_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_store_id_organization_id_fkey";
            columns: ["store_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      stores: {
        Row: {
          business_model: string;
          created_at: string;
          currency: string;
          default_shipping_cost_minor: number | null;
          fee_rule_bps: number | null;
          fee_rule_fixed_minor: number | null;
          id: string;
          is_demo: boolean;
          minor_digits: number;
          name: string;
          organization_id: string;
          platform: string;
          prices_include_tax: boolean;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          business_model?: string;
          created_at?: string;
          currency: string;
          default_shipping_cost_minor?: number | null;
          fee_rule_bps?: number | null;
          fee_rule_fixed_minor?: number | null;
          id?: string;
          is_demo?: boolean;
          minor_digits: number;
          name: string;
          organization_id: string;
          platform?: string;
          prices_include_tax?: boolean;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          business_model?: string;
          created_at?: string;
          currency?: string;
          default_shipping_cost_minor?: number | null;
          fee_rule_bps?: number | null;
          fee_rule_fixed_minor?: number | null;
          id?: string;
          is_demo?: boolean;
          minor_digits?: number;
          name?: string;
          organization_id?: string;
          platform?: string;
          prices_include_tax?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "stores_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          cancel_at: string | null;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          ended_at: string | null;
          id: string;
          organization_id: string;
          past_due_since: string | null;
          plan: string;
          price_id: string | null;
          status: string;
          stripe_event_at: string;
          trial_end: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cancel_at?: string | null;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          ended_at?: string | null;
          id: string;
          organization_id: string;
          past_due_since?: string | null;
          plan?: string;
          price_id?: string | null;
          status: string;
          stripe_event_at: string;
          trial_end?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at?: string | null;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          ended_at?: string | null;
          id?: string;
          organization_id?: string;
          past_due_since?: string | null;
          plan?: string;
          price_id?: string | null;
          status?: string;
          stripe_event_at?: string;
          trial_end?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_entitlements";
            referencedColumns: ["organization_id"];
          },
          {
            foreignKeyName: "subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      organization_entitlements: {
        Row: {
          access: string | null;
          cancel_at: string | null;
          cancel_at_period_end: boolean | null;
          current_period_end: string | null;
          grace_ends_at: string | null;
          organization_id: string | null;
          past_due_since: string | null;
          subscription_id: string | null;
          subscription_status: string | null;
          trial_ends_at: string | null;
          trial_started_at: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      consume_rate_limit: { Args: { p_key: string; p_limit: number; p_window_seconds: number }; Returns: boolean };
      create_organization_with_store: {
        Args: {
          p_business_model?: string;
          p_currency: string;
          p_minor_digits: number;
          p_organization_name: string;
          p_platform: string;
          p_prices_include_tax: boolean;
          p_store_name: string;
          p_timezone: string;
        };
        Returns: {
          organization_id: string;
          store_id: string;
        }[];
      };
      import_commit_batch: { Args: { p_job: string; p_limit?: number }; Returns: Json };
      import_finalize: { Args: { p_job: string }; Returns: Json };
      import_rollback: { Args: { p_job: string }; Returns: Json };
      prune_abandoned_imports: { Args: Record<PropertyKey, never>; Returns: number };
      prune_rate_limits: { Args: Record<PropertyKey, never>; Returns: number };
      report_ad_daily: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          conversion_value: number;
          day: string;
          platform: string;
          spend: number;
        }[];
      };
      report_campaign_breakdown: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          campaign_id: string;
          clicks: number;
          conversion_value: number;
          conversions: number;
          impressions: number;
          name: string;
          platform: string;
          product_id: string;
          spend: number;
        }[];
      };
      report_channel_breakdown: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          cogs: number;
          lines_without_cost: number;
          margin: number;
          net_revenue: number;
          orders: number;
          sales_channel: string;
          shipping_costs: number;
          transaction_fees: number;
          units: number;
        }[];
      };
      report_daily_totals: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          ad_spend: number;
          cogs: number;
          day: string;
          discounts: number;
          fixed_costs: number;
          gross_sales: number;
          lines_without_cost: number;
          orders: number;
          orders_without_fees: number;
          orders_without_shipping_cost: number;
          other_variable_costs: number;
          product_sales_after_discounts: number;
          refunds: number;
          sales_without_cost: number;
          shipping_charged: number;
          shipping_costs: number;
          shipping_costs_estimated: number;
          transaction_fees: number;
          transaction_fees_estimated: number;
          units: number;
        }[];
      };
      report_order_list: {
        Args: { p_from: string; p_search?: string; p_store_id: string; p_to: string };
        Returns: {
          cogs: number;
          converted_from_tax_inclusive: boolean;
          day: string;
          discounts: number;
          external_id: string;
          fees: number;
          fees_estimated: boolean;
          gross: number;
          line_count: number;
          lines_without_cost: number;
          net: number;
          order_id: string;
          ordered_at: string;
          refunds: number;
          shipping_charged: number;
          shipping_cost: number;
          shipping_estimated: boolean;
          source: string;
          taxes: number;
          units: number;
        }[];
      };
      report_product_breakdown: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          ad_spend: number;
          archived: boolean;
          cogs: number;
          discounts: number;
          gross_sales: number;
          lines_without_cost: number;
          name: string;
          product_id: string;
          refunds: number;
          shipping_charged: number;
          shipping_costs: number;
          sku: string;
          transaction_fees: number;
          unit_cost_e4: number;
          units: number;
        }[];
      };
      report_product_catalog: {
        Args: { p_filter?: string; p_from: string; p_search?: string; p_store_id: string; p_to: string };
        Returns: {
          ad_spend: number;
          archived: boolean;
          cogs: number;
          contribution_margin: number;
          contribution_margin_rate: number;
          created_at: string;
          discounts: number;
          gross_sales: number;
          lines_without_cost: number;
          name: string;
          net_revenue: number;
          net_sales: number;
          price_minor: number;
          product_id: string;
          refunds: number;
          shipping_charged: number;
          shipping_costs: number;
          sku: string;
          source: string;
          transaction_fees: number;
          unit_cost_e4: number;
          units: number;
        }[];
      };
      report_product_daily: {
        Args: { p_from: string; p_product_id: string; p_store_id: string; p_to: string };
        Returns: {
          day: string;
          sales: number;
          units: number;
        }[];
      };
      report_unallocated: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          ad_spend: number;
          refunds: number;
          variable_expenses: number;
        }[];
      };
      reseller_items: {
        Args: { p_search?: string; p_status?: string; p_store_id: string };
        Returns: {
          acquired_on: string;
          archived: boolean;
          created_at: string;
          fees: number;
          item_cost: number;
          margin: number;
          name: string;
          order_external_id: string;
          order_id: string;
          ordered_at: string;
          product_id: string;
          refunds: number;
          sale_price: number;
          sales_channel: string;
          shipping_charged: number;
          shipping_cost: number;
          sold_on: string;
          status: string;
          stocked_on: string;
          unit_cost_e4: number;
        }[];
      };
      reseller_stock_summary: {
        Args: { p_stale_before: string; p_store_id: string };
        Returns: {
          cost_minor: number;
          items: number;
          items_without_cost: number;
          stale_items: number;
        }[];
      };
    };
    Enums: {
      member_role: "owner" | "admin" | "member";
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
      member_role: ["owner", "admin", "member"],
    },
  },
} as const;
