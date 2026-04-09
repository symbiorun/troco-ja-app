/**
 * Tipos gerados manualmente para o Supabase.
 * Para regenerar automaticamente use: npx supabase gen types typescript --project-id <id>
 *
 * Mantemos um subset dos tipos mais usados.
 * O tipo Database é necessário para tipagem do createBrowserClient / createServerClient.
 */
export type Database = {
  public: {
    Tables: {
      applications: {
        Row: {
          id: string;
          user_id: string | null;
          customer_name: string | null;
          customer_email: string | null;
          customer_cpf: string | null;
          customer_phone: string | null;
          pix_amount: number;
          card_total: number;
          fee_pct: number;
          profit_margin_pct: number;
          installments: number;
          channel: "online_link" | "machine_delivery";
          pix_key: string | null;
          pix_key_type: string | null;
          pix_bank_name: string | null;
          pix_recipient_name: string | null;
          same_holder: boolean;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["applications"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Insert"]>;
      };

      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: "client" | "operator" | "admin";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };

      payments: {
        Row: {
          id: string;
          application_id: string;
          provider: string;
          external_id: string | null;
          amount: number;
          installments: number;
          status: string;
          checkout_url: string | null;
          confirmed_at: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payments"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
      };

      application_logs: {
        Row: {
          id: string;
          application_id: string;
          event_type: string;
          previous_status: string | null;
          new_status: string | null;
          changed_by: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["application_logs"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };

      contracts: {
        Row: {
          id: string;
          version: string;
          content_html: string;
          content_hash: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["contracts"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contracts"]["Insert"]>;
      };

      contract_acceptances: {
        Row: {
          id: string;
          application_id: string;
          contract_id: string;
          contract_version: string;
          user_id: string;
          accepted_at: string;
          ip_address: string | null;
          user_agent: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["contract_acceptances"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never; // IMMUTABLE
      };

      payment_webhooks: {
        Row: {
          id: string;
          idempotency_key: string;
          event_type: string;
          external_payment_id: string;
          raw_payload: Record<string, unknown>;
          processed_at: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payment_webhooks"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never; // Webhooks are immutable
      };

      admin_configs: {
        Row: {
          key: string;
          value: string;
          value_type: string;
          description: string | null;
          updated_at: string;
        };
        Insert: Database["public"]["Tables"]["admin_configs"]["Row"];
        Update: Partial<Database["public"]["Tables"]["admin_configs"]["Row"]>;
      };

      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
