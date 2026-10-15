export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string; email: string; avatar_url: string | null; created_at: string; updated_at: string }
        Insert: { id: string; display_name?: string; email?: string; avatar_url?: string | null; created_at?: string; updated_at?: string }
        Update: { display_name?: string; email?: string; avatar_url?: string | null; updated_at?: string }
        Relationships: []
      }
      organizations: {
        Row: { id: string; name: string; slug: string; owner_id: string; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; slug: string; owner_id: string; created_at?: string; updated_at?: string }
        Update: { name?: string; slug?: string; updated_at?: string }
        Relationships: []
      }
      organization_members: {
        Row: { organization_id: string; user_id: string; role: 'owner' | 'admin' | 'member' | 'viewer'; created_at: string }
        Insert: { organization_id: string; user_id: string; role?: 'owner' | 'admin' | 'member' | 'viewer'; created_at?: string }
        Update: { role?: 'owner' | 'admin' | 'member' | 'viewer' }
        Relationships: []
      }
      organization_invites: {
        Row: { id: string; organization_id: string; token: string; email: string; role: 'admin' | 'member' | 'viewer'; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; token?: string; email?: string; role?: 'admin' | 'member' | 'viewer'; expires_at?: string; accepted_at?: string | null; revoked_at?: string | null; created_by?: string | null; created_at?: string }
        Update: { role?: 'admin' | 'member' | 'viewer'; expires_at?: string; accepted_at?: string | null; revoked_at?: string | null }
        Relationships: []
      }
      organization_settings: {
        Row: { organization_id: string; settings: Json; updated_by: string | null; updated_at: string }
        Insert: { organization_id: string; settings?: Json; updated_by?: string | null; updated_at?: string }
        Update: { settings?: Json; updated_by?: string | null; updated_at?: string }
        Relationships: []
      }
      user_experience_preferences: {
        Row: { organization_id: string; user_id: string; preferences: Json; updated_at: string }
        Insert: { organization_id: string; user_id: string; preferences?: Json; updated_at?: string }
        Update: { preferences?: Json; updated_at?: string }
        Relationships: []
      }
      prospecting_leads: {
        Row: { id: string; organization_id: string; batch_id: string | null; lead_id: string | null; name: string; company: string; phone: string; email: string; city: string; address: string; cnpj: string; instagram: string; website: string; booking_url: string; system_name: string; description: string; followers: number | null; source: 'maps' | 'instagram' | 'cnpj' | 'extension' | 'manual'; source_detail: string; status: 'new' | 'analyzing' | 'review' | 'approved' | 'discarded' | 'sent'; confidence: number; duplicate_level: 'none' | 'possible' | 'confirmed'; duplicate_lead_id: string | null; duplicate_reasons: string[]; notes: string; raw_data: Json; created_by: string | null; created_at: string; updated_at: string; analyzed_at: string | null; sent_at: string | null }
        Insert: { id?: string; organization_id: string; batch_id?: string | null; lead_id?: string | null; name?: string; company?: string; phone?: string; email?: string; city?: string; address?: string; cnpj?: string; instagram?: string; website?: string; booking_url?: string; system_name?: string; description?: string; followers?: number | null; source: 'maps' | 'instagram' | 'cnpj' | 'extension' | 'manual'; source_detail?: string; status?: 'new' | 'analyzing' | 'review' | 'approved' | 'discarded' | 'sent'; confidence?: number; duplicate_level?: 'none' | 'possible' | 'confirmed'; duplicate_lead_id?: string | null; duplicate_reasons?: string[]; notes?: string; raw_data?: Json; created_by?: string | null; created_at?: string; updated_at?: string; analyzed_at?: string | null; sent_at?: string | null }
        Update: Partial<Database['public']['Tables']['prospecting_leads']['Insert']>
        Relationships: []
      }
      prospecting_events: {
        Row: { id: string; organization_id: string; prospect_id: string | null; batch_id: string | null; action: string; title: string; description: string; item_count: number; metadata: Json; created_by: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; prospect_id?: string | null; batch_id?: string | null; action: string; title: string; description?: string; item_count?: number; metadata?: Json; created_by?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['prospecting_events']['Insert']>
        Relationships: []
      }
      audit_logs: {
        Row: { id: number; organization_id: string; user_id: string | null; action: string; entity_type: string; entity_id: string | null; before_data: Json | null; after_data: Json | null; created_at: string }
        Insert: { organization_id: string; user_id?: string | null; action: string; entity_type: string; entity_id?: string | null; before_data?: Json | null; after_data?: Json | null; created_at?: string }
        Update: never
        Relationships: []
      }
      pipeline_stages: {
        Row: { id: string; organization_id: string; name: string; stage_order: number; color: string; probability: number; is_won: boolean; is_lost: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; name: string; stage_order: number; color?: string; probability?: number; is_won?: boolean; is_lost?: boolean; created_at?: string; updated_at?: string }
        Update: { name?: string; stage_order?: number; color?: string; probability?: number; is_won?: boolean; is_lost?: boolean; updated_at?: string }
        Relationships: []
      }
      leads: {
        Row: {
          id: string; organization_id: string; name: string; company: string; phone: string; email: string; city: string;
          postal_code: string; street: string; address_number: string; complement: string; district: string; state: string; country: string; formatted_address: string;
          latitude: number | null; longitude: number | null; geocode_status: 'pending' | 'exact' | 'approximate' | 'incomplete' | 'not_found' | 'manual';
          geocode_precision: 'rooftop' | 'range_interpolated' | 'street' | 'district' | 'city' | 'manual' | 'unknown'; geocode_provider: string | null; geocode_place_id: string | null; geocoded_at: string | null; geocode_error: string | null;
          source: string; stage_id: string; status: 'active' | 'won' | 'lost' | 'archived'; temperature: 'cold' | 'warm' | 'hot';
          priority: 'low' | 'medium' | 'high' | 'urgent'; owner_id: string | null; value: number; next_action_at: string | null; last_contact_at: string | null; expected_close_at: string | null;
          cnpj: string; instagram: string; notes: string; tags: string[]; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; organization_id: string; name: string; company?: string; phone?: string; email?: string; city?: string;
          postal_code?: string; street?: string; address_number?: string; complement?: string; district?: string; state?: string; country?: string; formatted_address?: string;
          latitude?: number | null; longitude?: number | null; geocode_status?: 'pending' | 'exact' | 'approximate' | 'incomplete' | 'not_found' | 'manual';
          geocode_precision?: 'rooftop' | 'range_interpolated' | 'street' | 'district' | 'city' | 'manual' | 'unknown'; geocode_provider?: string | null; geocode_place_id?: string | null; geocoded_at?: string | null; geocode_error?: string | null;
          source?: string; stage_id: string; status?: 'active' | 'won' | 'lost' | 'archived'; temperature?: 'cold' | 'warm' | 'hot';
          priority?: 'low' | 'medium' | 'high' | 'urgent'; owner_id?: string | null; value?: number; next_action_at?: string | null; last_contact_at?: string | null; expected_close_at?: string | null;
          cnpj?: string; instagram?: string; notes?: string; tags?: string[]; created_at?: string; updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leads']['Insert']>
        Relationships: []
      }

      products: {
        Row: { id: string; organization_id: string; name: string; sku: string; description: string; category: string; active: boolean; unit_price: number; unit_cost: number; product_kind: 'product' | 'service'; commercial_type: string; unit_label: string; default_discount_percent: number; max_discount_percent: number; min_margin_percent: number; value_proposition: string; target_customer: string; sales_notes: string; pricing_mode: 'fixed' | 'from' | 'quote' | 'free' | 'custom'; lifecycle_status: 'draft' | 'ready' | 'active' | 'archived'; sales_problems: unknown; sales_benefits: unknown; discovery_questions: unknown; objection_notes: unknown; sales_proofs: unknown; competitors: unknown; bundle_items: unknown; billing_type: 'one_time' | 'recurring'; billing_interval: 'month' | 'quarter' | 'year' | null; tax_rate: number; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; name: string; sku?: string; description?: string; category?: string; active?: boolean; unit_price?: number; unit_cost?: number; product_kind?: 'product' | 'service'; commercial_type?: string; unit_label?: string; default_discount_percent?: number; max_discount_percent?: number; min_margin_percent?: number; value_proposition?: string; target_customer?: string; sales_notes?: string; pricing_mode?: 'fixed' | 'from' | 'quote' | 'free' | 'custom'; lifecycle_status?: 'draft' | 'ready' | 'active' | 'archived'; sales_problems?: unknown; sales_benefits?: unknown; discovery_questions?: unknown; objection_notes?: unknown; sales_proofs?: unknown; competitors?: unknown; bundle_items?: unknown; billing_type?: 'one_time' | 'recurring'; billing_interval?: 'month' | 'quarter' | 'year' | null; tax_rate?: number; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
        Relationships: []
      }
      sales_proposals: {
        Row: { id: string; organization_id: string; proposal_group_id: string; version: number; proposal_number: string; lead_id: string; opportunity_id: string | null; company_id: string | null; contact_id: string | null; title: string; status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'cancelled'; forecast_category: 'pipeline' | 'best_case' | 'commit' | 'closed' | 'omitted'; probability: number; currency: 'BRL'; subtotal: number; discount_total: number; tax_total: number; total: number; recurring_monthly_total: number; one_time_total: number; annual_recurring_total: number; total_contract_value: number; is_official: boolean; is_current_version: boolean; superseded_by_id: string | null; expected_close_at: string | null; contract_start_at: string | null; contract_end_at: string | null; contract_term_months: number; auto_renew: boolean; post_sale_start_at: string | null; post_sale_cadence_name: string; closed_won_at: string | null; valid_until: string | null; sent_at: string | null; viewed_at: string | null; accepted_at: string | null; rejected_at: string | null; owner_id: string | null; notes: string; terms: string; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; proposal_group_id?: string; version?: number; proposal_number: string; lead_id: string; opportunity_id?: string | null; company_id?: string | null; contact_id?: string | null; title: string; status?: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'cancelled'; forecast_category?: 'pipeline' | 'best_case' | 'commit' | 'closed' | 'omitted'; probability?: number; currency?: 'BRL'; subtotal?: number; discount_total?: number; tax_total?: number; total?: number; recurring_monthly_total?: number; one_time_total?: number; annual_recurring_total?: number; total_contract_value?: number; is_official?: boolean; is_current_version?: boolean; superseded_by_id?: string | null; expected_close_at?: string | null; contract_start_at?: string | null; contract_end_at?: string | null; contract_term_months?: number; auto_renew?: boolean; post_sale_start_at?: string | null; post_sale_cadence_name?: string; closed_won_at?: string | null; valid_until?: string | null; sent_at?: string | null; viewed_at?: string | null; accepted_at?: string | null; rejected_at?: string | null; owner_id?: string | null; notes?: string; terms?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['sales_proposals']['Insert']>
        Relationships: []
      }
      sales_proposal_items: {
        Row: { id: string; organization_id: string; proposal_id: string; product_id: string | null; item_order: number; name: string; description: string; quantity: number; unit_price: number; discount_percent: number; tax_rate: number; billing_type: 'one_time' | 'recurring'; billing_interval: 'month' | 'quarter' | 'year' | null; line_subtotal: number; line_discount: number; line_tax: number; line_total: number; recurring_monthly_total: number; pricing_source: 'catalog' | 'manual'; catalog_unit_price: number | null; unit_cost_snapshot: number | null; catalog_discount_percent: number | null; pricing_overridden: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; proposal_id: string; product_id?: string | null; item_order?: number; name: string; description?: string; quantity?: number; unit_price?: number; discount_percent?: number; tax_rate?: number; billing_type?: 'one_time' | 'recurring'; billing_interval?: 'month' | 'quarter' | 'year' | null; line_subtotal?: number; line_discount?: number; line_tax?: number; line_total?: number; recurring_monthly_total?: number; pricing_source?: 'catalog' | 'manual'; catalog_unit_price?: number | null; unit_cost_snapshot?: number | null; catalog_discount_percent?: number | null; pricing_overridden?: boolean; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['sales_proposal_items']['Insert']>
        Relationships: []
      }
      revenue_entries: {
        Row: { id: string; organization_id: string; proposal_id: string | null; lead_id: string | null; opportunity_id: string | null; revenue_type: 'one_time' | 'recurring'; status: 'forecast' | 'recognized' | 'cancelled'; amount: number; recurring_monthly_amount: number; recognized_at: string; competence_date: string; service_period_start: string | null; service_period_end: string | null; adjustment_reason: string; description: string; owner_id: string | null; source: 'manual' | 'proposal_schedule'; schedule_key: string | null; installment_index: number | null; installment_count: number | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; proposal_id?: string | null; lead_id?: string | null; opportunity_id?: string | null; revenue_type: 'one_time' | 'recurring'; status?: 'forecast' | 'recognized' | 'cancelled'; amount?: number; recurring_monthly_amount?: number; recognized_at?: string; competence_date: string; service_period_start?: string | null; service_period_end?: string | null; adjustment_reason?: string; description?: string; owner_id?: string | null; source?: 'manual' | 'proposal_schedule'; schedule_key?: string | null; installment_index?: number | null; installment_count?: number | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['revenue_entries']['Insert']>
        Relationships: []
      }
      activities: {
        Row: {
          id: string; organization_id: string; lead_id: string | null; activity_type: 'call' | 'followup' | 'meeting' | 'note' | 'stage_change';
          title: string; description: string; due_at: string | null; completed_at: string | null; assigned_to: string | null;
          source_type: 'manual' | 'calendar' | 'call' | 'system'; source_id: string | null; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; organization_id: string; lead_id?: string | null; activity_type: 'call' | 'followup' | 'meeting' | 'note' | 'stage_change';
          title: string; description?: string; due_at?: string | null; completed_at?: string | null; assigned_to?: string | null;
          source_type?: 'manual' | 'calendar' | 'call' | 'system'; source_id?: string | null; created_at?: string; updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['activities']['Insert']>
        Relationships: []
      }
      calls: {
        Row: {
          id: string; organization_id: string; lead_id: string; user_id: string | null; outcome: string; duration_seconds: number;
          notes: string; transcript: string; recording_path: string | null; consent_at: string | null; consent_text: string | null; consent_by: string | null; started_at: string; ended_at: string | null; created_at: string
        }
        Insert: {
          id?: string; organization_id: string; lead_id: string; user_id?: string | null; outcome?: string; duration_seconds?: number;
          notes?: string; transcript?: string; recording_path?: string | null; consent_at?: string | null; consent_text?: string | null; consent_by?: string | null; started_at?: string; ended_at?: string | null; created_at?: string
        }
        Update: Partial<Database['public']['Tables']['calls']['Insert']>
        Relationships: []
      }
      calendar_events: {
        Row: {
          id: string; organization_id: string; lead_id: string | null; title: string; description: string; starts_at: string; ends_at: string;
          all_day: boolean; location: string; status: string; assigned_to: string | null; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; organization_id: string; lead_id?: string | null; title: string; description?: string; starts_at: string; ends_at: string;
          all_day?: boolean; location?: string; status?: string; assigned_to?: string | null; created_at?: string; updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['calendar_events']['Insert']>
        Relationships: []
      }
      playbooks: {
        Row: { id: string; organization_id: string; kind: 'script' | 'objection' | 'battlecard' | 'checklist'; title: string; category: string; content: string; tags: string[]; guidance: Json; active: boolean; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; kind?: 'script' | 'objection' | 'battlecard' | 'checklist'; title: string; category?: string; content: string; tags?: string[]; guidance?: Json; active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: { kind?: 'script' | 'objection' | 'battlecard' | 'checklist'; title?: string; category?: string; content?: string; tags?: string[]; guidance?: Json; active?: boolean; updated_at?: string }
        Relationships: []
      }
      goals: {
        Row: { id: string; organization_id: string; user_id: string | null; scope: string; team_id: string | null; team_name: string; metric: string; target_value: number; period_start: string; period_end: string; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; user_id?: string | null; scope?: string; team_id?: string | null; team_name?: string; metric: string; target_value?: number; period_start: string; period_end: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['goals']['Insert']>
        Relationships: []
      }
      automation_rules: {
        Row: { id: string; organization_id: string; name: string; enabled: boolean; trigger_type: string; conditions: Json; actions: Json; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; name: string; enabled?: boolean; trigger_type: string; conditions?: Json; actions?: Json; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['automation_rules']['Insert']>
        Relationships: []
      }
      automation_runs: {
        Row: { id: string; organization_id: string; rule_id: string | null; event_key: string; status: string; input: Json; output: Json; error_message: string | null; started_at: string; finished_at: string | null }
        Insert: { id?: string; organization_id: string; rule_id?: string | null; event_key: string; status: string; input?: Json; output?: Json; error_message?: string | null; started_at?: string; finished_at?: string | null }
        Update: Partial<Database['public']['Tables']['automation_runs']['Insert']>
        Relationships: []
      }
      workflow_executions: {
        Row: { id: string; organization_id: string; rule_id: string | null; lead_id: string | null; trigger_type: string; entity_id: string; idempotency_key: string; correlation_id: string; status: 'queued' | 'running' | 'waiting' | 'retrying' | 'succeeded' | 'failed' | 'cancelled'; current_step: number; attempts: number; max_attempts: number; next_run_at: string; locked_at: string | null; input: Json; context: Json; last_error: string | null; created_by: string | null; started_at: string | null; finished_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; rule_id?: string | null; lead_id?: string | null; trigger_type: string; entity_id: string; idempotency_key: string; correlation_id: string; status?: 'queued' | 'running' | 'waiting' | 'retrying' | 'succeeded' | 'failed' | 'cancelled'; current_step?: number; attempts?: number; max_attempts?: number; next_run_at?: string; locked_at?: string | null; input?: Json; context?: Json; last_error?: string | null; created_by?: string | null; started_at?: string | null; finished_at?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['workflow_executions']['Insert']>
        Relationships: []
      }
      workflow_step_runs: {
        Row: { id: string; organization_id: string; execution_id: string; step_index: number; step_type: 'action' | 'wait' | 'branch'; action_type: string | null; status: 'pending' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'skipped'; attempt: number; branch_result: boolean | null; scheduled_for: string | null; input: Json; output: Json; error_message: string | null; started_at: string | null; finished_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; execution_id: string; step_index: number; step_type: 'action' | 'wait' | 'branch'; action_type?: string | null; status?: 'pending' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'skipped'; attempt?: number; branch_result?: boolean | null; scheduled_for?: string | null; input?: Json; output?: Json; error_message?: string | null; started_at?: string | null; finished_at?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['workflow_step_runs']['Insert']>
        Relationships: []
      }
      realtalent_connect_devices: {
        Row: { id: string; organization_id: string; user_id: string; device_key: string; device_name: string; platform: string; app_version: string; status: 'connected' | 'paused' | 'revoked' | 'error'; last_seen_at: string; last_sync_at: string | null; pending_items: number; last_error: string | null; metadata: Json; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; user_id: string; device_key: string; device_name: string; platform?: string; app_version: string; status?: 'connected' | 'paused' | 'revoked' | 'error'; last_seen_at?: string; last_sync_at?: string | null; pending_items?: number; last_error?: string | null; metadata?: Json; created_at?: string; updated_at?: string }
        Update: { device_name?: string; platform?: string; app_version?: string; status?: 'connected' | 'paused' | 'revoked' | 'error'; last_seen_at?: string; last_sync_at?: string | null; pending_items?: number; last_error?: string | null; metadata?: Json; updated_at?: string }
        Relationships: []
      }
      realtalent_connect_call_commands: {
        Row: { id: string; organization_id: string; device_id: string; requested_by: string; lead_id: string | null; phone: string; lead_name: string; status: 'queued' | 'claimed' | 'dialing' | 'connected' | 'completed' | 'failed' | 'cancelled' | 'expired'; requested_at: string; claimed_at: string | null; started_at: string | null; ended_at: string | null; expires_at: string; failure_reason: string | null; metadata: Json; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; device_id: string; requested_by: string; lead_id?: string | null; phone: string; lead_name?: string; status?: 'queued' | 'claimed' | 'dialing' | 'connected' | 'completed' | 'failed' | 'cancelled' | 'expired'; requested_at?: string; claimed_at?: string | null; started_at?: string | null; ended_at?: string | null; expires_at?: string; failure_reason?: string | null; metadata?: Json; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['realtalent_connect_call_commands']['Insert']>
        Relationships: []
      }
      extension_installations: {
        Row: { id: string; organization_id: string; user_id: string | null; product_key: string; installation_key: string; display_name: string; browser: string; browser_version: string; platform: string; app_version: string; manifest_version: number; status: string; permissions: string[]; capabilities: string[]; last_seen_at: string; last_sync_at: string | null; pending_items: number; captured_today: number; captured_on: string; total_captured: number; last_error: string | null; metadata: Json; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; user_id?: string | null; product_key: string; installation_key: string; display_name?: string; browser?: string; browser_version?: string; platform?: string; app_version?: string; manifest_version?: number; status?: string; permissions?: string[]; capabilities?: string[]; last_seen_at?: string; last_sync_at?: string | null; pending_items?: number; captured_today?: number; captured_on?: string; total_captured?: number; last_error?: string | null; metadata?: Json; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['extension_installations']['Insert']>
        Relationships: []
      }
      extension_product_settings: {
        Row: { organization_id: string; product_key: string; enabled: boolean; destination: string; require_confirmation: boolean; duplicate_policy: string; minimum_version: string; recommended_version: string; max_batch_size: number; process_interval_ms: number; close_tab_after_analysis: boolean; allowed_sources: string[]; settings: Json; config_version: number; updated_by: string | null; updated_at: string }
        Insert: { organization_id: string; product_key: string; enabled?: boolean; destination?: string; require_confirmation?: boolean; duplicate_policy?: string; minimum_version?: string; recommended_version?: string; max_batch_size?: number; process_interval_ms?: number; close_tab_after_analysis?: boolean; allowed_sources?: string[]; settings?: Json; config_version?: number; updated_by?: string | null; updated_at?: string }
        Update: Partial<Database['public']['Tables']['extension_product_settings']['Insert']>
        Relationships: []
      }
      extension_capture_jobs: {
        Row: { id: string; organization_id: string; installation_id: string | null; user_id: string | null; product_key: string; source: string; source_url: string | null; external_id: string | null; status: string; attempts: number; max_attempts: number; available_at: string; idempotency_key: string; item_count: number; payload: Json; result: Json; last_error: string | null; started_at: string | null; completed_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; installation_id?: string | null; user_id?: string | null; product_key: string; source?: string; source_url?: string | null; external_id?: string | null; status?: string; attempts?: number; max_attempts?: number; available_at?: string; idempotency_key: string; item_count?: number; payload?: Json; result?: Json; last_error?: string | null; started_at?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['extension_capture_jobs']['Insert']>
        Relationships: []
      }
      extension_events: {
        Row: { id: string; organization_id: string; installation_id: string | null; job_id: string | null; event_type: string; status: string; correlation_id: string | null; payload: Json; created_at: string }
        Insert: { id?: string; organization_id: string; installation_id?: string | null; job_id?: string | null; event_type: string; status?: string; correlation_id?: string | null; payload?: Json; created_at?: string }
        Update: Partial<Database['public']['Tables']['extension_events']['Insert']>
        Relationships: []
      }
      integration_connected_accounts: {
        Row: { id: string; organization_id: string; provider: string; external_account_id: string; display_name: string; status: string; scopes: string[]; has_credential: boolean; token_expires_at: string | null; last_sync_at: string | null; next_sync_at: string | null; sync_cursor: string | null; last_error: string | null; connected_by_user_id: string | null; metadata: Json; access_mode: string; allowed_user_ids: string[]; allowed_roles: string[]; capabilities: Json; connection_mode: string; credential_version: number; token_refreshed_at: string | null; revoked_at: string | null; last_tested_at: string | null; last_test_status: string | null; last_test_latency_ms: number | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; provider: string; external_account_id: string; display_name: string; status?: string; scopes?: string[]; has_credential?: boolean; token_expires_at?: string | null; last_sync_at?: string | null; next_sync_at?: string | null; sync_cursor?: string | null; last_error?: string | null; connected_by_user_id?: string | null; metadata?: Json; access_mode?: string; allowed_user_ids?: string[]; allowed_roles?: string[]; capabilities?: Json; connection_mode?: string; credential_version?: number; token_refreshed_at?: string | null; revoked_at?: string | null; last_tested_at?: string | null; last_test_status?: string | null; last_test_latency_ms?: number | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['integration_connected_accounts']['Insert']>
        Relationships: []
      }
      integration_sync_jobs: {
        Row: { id: string; organization_id: string; account_id: string | null; provider: string; job_type: string; worker_key: string | null; status: string; priority: number; attempts: number; max_attempts: number; available_at: string; locked_at: string | null; locked_by: string | null; lease_expires_at: string | null; recovered_count: number; completed_at: string | null; idempotency_key: string; payload: Json; last_error: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; account_id?: string | null; provider: string; job_type: string; worker_key?: string | null; status?: string; priority?: number; attempts?: number; max_attempts?: number; available_at?: string; locked_at?: string | null; locked_by?: string | null; lease_expires_at?: string | null; recovered_count?: number; completed_at?: string | null; idempotency_key: string; payload?: Json; last_error?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['integration_sync_jobs']['Insert']>
        Relationships: []
      }
      integration_sync_attempts: {
        Row: { id: string; organization_id: string; job_id: string; attempt_number: number; status: string; response_code: number | null; duration_ms: number | null; error_message: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; job_id: string; attempt_number: number; status: string; response_code?: number | null; duration_ms?: number | null; error_message?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['integration_sync_attempts']['Insert']>
        Relationships: []
      }
      integration_diagnostics: {
        Row: { id: string; organization_id: string; account_id: string | null; provider: string; run_id: string; check_key: string; status: string; message: string; latency_ms: number | null; details: Json; created_at: string }
        Insert: { id?: string; organization_id: string; account_id?: string | null; provider: string; run_id: string; check_key: string; status: string; message: string; latency_ms?: number | null; details?: Json; created_at?: string }
        Update: Partial<Database['public']['Tables']['integration_diagnostics']['Insert']>
        Relationships: []
      }
      integration_audit_events: {
        Row: { id: string; organization_id: string; account_id: string | null; provider: string; event_type: string; severity: string; actor_user_id: string | null; correlation_id: string | null; message: string; metadata: Json; source_table: string | null; source_id: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; account_id?: string | null; provider: string; event_type: string; severity?: string; actor_user_id?: string | null; correlation_id?: string | null; message?: string; metadata?: Json; source_table?: string | null; source_id?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['integration_audit_events']['Insert']>
        Relationships: []
      }
      integration_connections: {
        Row: { id: string; organization_id: string; provider: string; status: string; enabled: boolean; settings: Json; has_credential: boolean; last_received_at: string | null; last_tested_at: string | null; last_error: string | null; received_count: number; error_count: number; client_version: string | null; connection_name: string | null; last_batch_id: string | null; last_latency_ms: number | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; provider: string; status?: string; enabled?: boolean; settings?: Json; has_credential?: boolean; last_received_at?: string | null; last_tested_at?: string | null; last_error?: string | null; received_count?: number; error_count?: number; client_version?: string | null; connection_name?: string | null; last_batch_id?: string | null; last_latency_ms?: number | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['integration_connections']['Insert']>
        Relationships: []
      }
      integration_events: {
        Row: { id: string; organization_id: string; connection_id: string | null; provider: string; direction: string; event_type: string; status: string; external_id: string | null; item_count: number; error_message: string | null; metadata: Json; created_at: string; processed_at: string | null }
        Insert: { id?: string; organization_id: string; connection_id?: string | null; provider: string; direction?: string; event_type: string; status?: string; external_id?: string | null; item_count?: number; error_message?: string | null; metadata?: Json; created_at?: string; processed_at?: string | null }
        Update: Partial<Database['public']['Tables']['integration_events']['Insert']>
        Relationships: []
      }
      automation_events: {
        Row: { id: string; organization_id: string; trigger_type: string; entity_id: string; lead_id: string | null; payload: Json; status: string; attempts: number; max_attempts: number; priority: number; source: string; batch_id: string | null; available_at: string; locked_at: string | null; last_attempt_at: string | null; dead_lettered_at: string | null; last_error: string | null; created_at: string; processed_at: string | null }
        Insert: { id?: string; organization_id: string; trigger_type: string; entity_id: string; lead_id?: string | null; payload?: Json; status?: string; attempts?: number; max_attempts?: number; priority?: number; source?: string; batch_id?: string | null; available_at?: string; locked_at?: string | null; last_attempt_at?: string | null; dead_lettered_at?: string | null; last_error?: string | null; created_at?: string; processed_at?: string | null }
        Update: Partial<Database['public']['Tables']['automation_events']['Insert']>
        Relationships: []
      }
      seller_notifications: {
        Row: { id: string; organization_id: string; user_id: string | null; lead_id: string | null; title: string; body: string; severity: string; status: string; action_route: string; source_type: string; source_id: string | null; created_at: string; read_at: string | null }
        Insert: { id?: string; organization_id: string; user_id?: string | null; lead_id?: string | null; title: string; body?: string; severity?: string; status?: string; action_route?: string; source_type?: string; source_id?: string | null; created_at?: string; read_at?: string | null }
        Update: Partial<Database['public']['Tables']['seller_notifications']['Insert']>
        Relationships: []
      }
      automation_webhooks: {
        Row: { id: string; organization_id: string; name: string; url: string; method: 'POST' | 'PUT' | 'PATCH'; enabled: boolean; secret_token: string; has_secret: boolean; timeout_seconds: number; max_attempts: number; headers: Json; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; name: string; url: string; method?: 'POST' | 'PUT' | 'PATCH'; enabled?: boolean; secret_token?: string; timeout_seconds?: number; max_attempts?: number; headers?: Json; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['automation_webhooks']['Insert']>
        Relationships: []
      }
      webhook_deliveries: {
        Row: { id: string; organization_id: string; webhook_id: string; automation_run_id: string | null; rule_id: string | null; lead_id: string | null; event_type: string; correlation_id: string; status: 'pending' | 'sending' | 'success' | 'failed' | 'cancelled' | 'simulated'; attempts: number; request_body: Json; response_status: number | null; response_body: string; error_message: string; next_attempt_at: string; last_attempt_at: string | null; created_at: string; finished_at: string | null }
        Insert: { id?: string; organization_id: string; webhook_id: string; automation_run_id?: string | null; rule_id?: string | null; lead_id?: string | null; event_type: string; correlation_id: string; status?: 'pending' | 'sending' | 'success' | 'failed' | 'cancelled' | 'simulated'; attempts?: number; request_body?: Json; response_status?: number | null; response_body?: string; error_message?: string; next_attempt_at?: string; last_attempt_at?: string | null; created_at?: string; finished_at?: string | null }
        Update: Partial<Database['public']['Tables']['webhook_deliveries']['Insert']>
        Relationships: []
      }
      buyer_rooms: {
        Row: { id: string; organization_id: string; lead_id: string; opportunity_id: string | null; proposal_id: string; company_id: string | null; title: string; welcome_message: string; status: 'draft' | 'shared' | 'active' | 'completed' | 'archived'; share_token: string; share_enabled: boolean; expires_at: string | null; last_opened_at: string | null; view_count: number; participants: Json; steps: Json; documents: Json; activity: Json; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; lead_id: string; opportunity_id?: string | null; proposal_id: string; company_id?: string | null; title: string; welcome_message?: string; status?: 'draft' | 'shared' | 'active' | 'completed' | 'archived'; share_token: string; share_enabled?: boolean; expires_at?: string | null; last_opened_at?: string | null; view_count?: number; participants?: Json; steps?: Json; documents?: Json; activity?: Json; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['buyer_rooms']['Insert']>
        Relationships: []
      }
      communication_events: {
        Row: { id: string; organization_id: string; thread_id: string | null; lead_id: string | null; contact_id: string | null; account_id: string | null; channel: 'email' | 'whatsapp' | 'instagram' | 'facebook' | 'linkedin' | 'calendar' | 'call' | 'meeting' | 'note' | 'system'; direction: 'inbound' | 'outbound' | 'internal'; event_type: 'message' | 'email' | 'calendar_event' | 'delivery_status' | 'internal_note'; status: 'queued' | 'sent' | 'delivered' | 'read' | 'received' | 'failed' | 'cancelled'; external_message_id: string | null; idempotency_key: string | null; sender_address: string; recipient_addresses: string[]; subject: string; body_text: string; occurred_at: string; metadata: Json; created_at: string }
        Insert: { id?: string; organization_id: string; thread_id?: string | null; lead_id?: string | null; contact_id?: string | null; account_id?: string | null; channel: 'email' | 'whatsapp' | 'instagram' | 'facebook' | 'linkedin' | 'calendar' | 'call' | 'meeting' | 'note' | 'system'; direction: 'inbound' | 'outbound' | 'internal'; event_type: 'message' | 'email' | 'calendar_event' | 'delivery_status' | 'internal_note'; status?: 'queued' | 'sent' | 'delivered' | 'read' | 'received' | 'failed' | 'cancelled'; external_message_id?: string | null; idempotency_key?: string | null; sender_address?: string; recipient_addresses?: string[]; subject?: string; body_text?: string; occurred_at?: string; metadata?: Json; created_at?: string }
        Update: Partial<Database['public']['Tables']['communication_events']['Insert']>
        Relationships: []
      }
      companies: {
        Row: { id: string; organization_id: string; name: string; legal_name: string; cnpj: string; domain: string; website: string; segment: string; phone: string; city: string; state: string; status: 'prospect' | 'customer' | 'inactive'; lead_ids: string[]; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; name: string; legal_name?: string; cnpj?: string; domain?: string; website?: string; segment?: string; phone?: string; city?: string; state?: string; status?: 'prospect' | 'customer' | 'inactive'; lead_ids?: string[]; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
        Relationships: []
      }
      contacts: {
        Row: { id: string; organization_id: string; company_id: string | null; name: string; job_title: string; phone: string; email: string; decision_role: 'decision_maker' | 'influencer' | 'user' | 'gatekeeper' | 'champion' | 'blocker' | 'unknown'; influence_level: number; consent_status: 'unknown' | 'legitimate_interest' | 'consented' | 'opted_out'; do_not_contact: boolean; do_not_contact_reason: string; lead_ids: string[]; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; company_id?: string | null; name: string; job_title?: string; phone?: string; email?: string; decision_role?: 'decision_maker' | 'influencer' | 'user' | 'gatekeeper' | 'champion' | 'blocker' | 'unknown'; influence_level?: number; consent_status?: 'unknown' | 'legitimate_interest' | 'consented' | 'opted_out'; do_not_contact?: boolean; do_not_contact_reason?: string; lead_ids?: string[]; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>
        Relationships: []
      }
      contact_relationships: {
        Row: { id: string; organization_id: string; company_id: string; from_contact_id: string; to_contact_id: string; relationship_type: 'reports_to' | 'partner' | 'co_owner' | 'referred_by' | 'works_with' | 'influences' | 'other'; strength: number; notes: string; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; company_id: string; from_contact_id: string; to_contact_id: string; relationship_type?: 'reports_to' | 'partner' | 'co_owner' | 'referred_by' | 'works_with' | 'influences' | 'other'; strength?: number; notes?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['contact_relationships']['Insert']>
        Relationships: []
      }
      opportunities: {
        Row: { id: string; organization_id: string; company_id: string | null; primary_contact_id: string | null; lead_id: string; title: string; stage_id: string; status: 'active' | 'won' | 'lost' | 'archived'; value: number; owner_id: string | null; expected_close_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; company_id?: string | null; primary_contact_id?: string | null; lead_id: string; title: string; stage_id: string; status?: 'active' | 'won' | 'lost' | 'archived'; value?: number; owner_id?: string | null; expected_close_at?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['opportunities']['Insert']>
        Relationships: []
      }
      social_profiles: {
        Row: { id: string; organization_id: string; entity_type: 'lead' | 'company' | 'contact'; entity_id: string; network: 'instagram' | 'linkedin' | 'facebook' | 'whatsapp' | 'x' | 'youtube' | 'tiktok' | 'other'; username: string; url: string; external_id: string | null; verified: boolean; source: string; confidence: number; last_checked_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; entity_type: 'lead' | 'company' | 'contact'; entity_id: string; network: 'instagram' | 'linkedin' | 'facebook' | 'whatsapp' | 'x' | 'youtube' | 'tiktok' | 'other'; username?: string; url: string; external_id?: string | null; verified?: boolean; source?: string; confidence?: number; last_checked_at?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['social_profiles']['Insert']>
        Relationships: []
      }
      contact_drafts: {
        Row: { id: string; organization_id: string; lead_id: string; channel: string; subject: string; message: string; status: string; source_type: string; source_id: string | null; created_at: string; used_at: string | null }
        Insert: { id?: string; organization_id: string; lead_id: string; channel: string; subject?: string; message: string; status?: string; source_type?: string; source_id?: string | null; created_at?: string; used_at?: string | null }
        Update: Partial<Database['public']['Tables']['contact_drafts']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {

      add_buyer_room_public_comment: { Args: { p_share_token: string; p_message: string; p_actor_name?: string }; Returns: boolean }
      append_buyer_room_activity: { Args: { p_room_id: string; p_event: Json }; Returns: string }
      enqueue_calendar_backfill: { Args: { p_organization_id: string; p_account_id: string; p_limit?: number }; Returns: number }
      merge_duplicate_leads_v10066: { Args: { p_organization_id: string; p_primary_lead_id: string; p_duplicate_lead_id: string }; Returns: string }
      resolve_default_integration_account: { Args: { p_organization_id: string; p_capability: string }; Returns: string | null }
      resolve_integration_sync_conflict: { Args: { p_conflict_id: string; p_resolution: string }; Returns: boolean }
      rotate_buyer_room_token: { Args: { p_room_id: string; p_new_token: string }; Returns: string }
      set_default_integration_account: { Args: { p_organization_id: string; p_capability: string; p_account_id: string; p_scope?: string }; Returns: string }
      sync_commercial_structure: { Args: { p_organization_id: string }; Returns: Json }
      track_buyer_room_public_document: { Args: { p_share_token: string; p_document_id: string; p_actor_name?: string }; Returns: boolean }
      update_buyer_room_public_step: { Args: { p_share_token: string; p_step_id: string; p_completed: boolean; p_actor_name?: string }; Returns: Json }
      update_calendar_integration_settings: { Args: { p_organization_id: string; p_account_id: string; p_calendar_id: string; p_calendar_name?: string; p_sync_direction?: string; p_sync_enabled?: boolean }; Returns: Json }
      clear_organization_operational_data: { Args: { p_organization_id: string }; Returns: Json }
      next_sales_proposal_number: { Args: { p_organization_id: string }; Returns: string }
      save_sales_proposal: { Args: { p_organization_id: string; p_proposal_id: string | null; p_lead_id: string; p_title: string; p_forecast_category: string; p_probability: number; p_valid_until: string | null; p_expected_close_at: string | null; p_contract_start_at: string | null; p_contract_end_at: string | null; p_contract_term_months: number; p_auto_renew: boolean; p_post_sale_start_at: string | null; p_post_sale_cadence_name: string; p_notes: string; p_terms: string; p_items: Json }; Returns: string }
      create_sales_proposal_revision: { Args: { p_organization_id: string; p_proposal_id: string }; Returns: string }
      set_official_sales_proposal: { Args: { p_organization_id: string; p_proposal_id: string }; Returns: string }
      set_sales_proposal_status: { Args: { p_organization_id: string; p_proposal_id: string; p_status: string }; Returns: string }
      close_opportunity_from_proposal: { Args: { p_organization_id: string; p_proposal_id: string }; Returns: string }
      create_organization_with_defaults: { Args: { p_name: string }; Returns: string }
      create_organization_invite: { Args: { p_organization_id: string; p_email: string; p_role: 'admin' | 'member' | 'viewer' }; Returns: Json }
      accept_organization_invite: { Args: { p_token: string }; Returns: string }
      revoke_organization_invite: { Args: { p_invite_id: string }; Returns: boolean }
      update_organization_member_role: { Args: { p_organization_id: string; p_user_id: string; p_role: 'admin' | 'member' | 'viewer' }; Returns: boolean }
      remove_organization_member: { Args: { p_organization_id: string; p_user_id: string }; Returns: boolean }
      production_readiness: { Args: { p_organization_id: string }; Returns: Json }
      merge_duplicate_leads: { Args: { p_organization_id: string; p_primary_lead_id: string; p_duplicate_lead_id: string }; Returns: string }
      enqueue_integration_sync_job: { Args: { p_organization_id: string; p_account_id: string; p_job_type: string; p_idempotency_key: string; p_payload: Json }; Returns: string }
      retry_integration_sync_job: { Args: { p_job_id: string }; Returns: boolean }
      update_integration_account_status: { Args: { p_account_id: string; p_action: 'pause' | 'resume' | 'disconnect' }; Returns: boolean }
      update_integration_account_access: { Args: { p_account_id: string; p_access_mode: string; p_allowed_user_ids: string[]; p_allowed_roles: string[] }; Returns: boolean }
      can_use_integration_account: { Args: { p_account_id: string }; Returns: boolean }
      integration_foundation_health: { Args: { p_organization_id: string }; Returns: Json }
      ensure_extension_product_settings: { Args: { p_organization_id: string; p_product_key: string }; Returns: Json }
      register_extension_installation: { Args: { p_organization_id: string; p_product_key: string; p_installation_key: string; p_display_name: string; p_browser: string; p_browser_version: string; p_platform: string; p_app_version: string; p_manifest_version?: number; p_permissions?: string[]; p_capabilities?: string[]; p_metadata?: Json }; Returns: Json }
      heartbeat_extension_installation: { Args: { p_organization_id: string; p_installation_id: string; p_pending_items?: number; p_captured_delta?: number; p_last_error?: string | null }; Returns: Json }
      update_extension_installation_status: { Args: { p_installation_id: string; p_action: 'pause' | 'resume' | 'revoke' }; Returns: boolean }
      save_extension_product_settings: { Args: { p_organization_id: string; p_product_key: string; p_enabled: boolean; p_destination: 'garimpo' | 'crm'; p_require_confirmation: boolean; p_duplicate_policy: 'skip' | 'update' | 'create'; p_minimum_version: string; p_recommended_version: string; p_max_batch_size: number; p_process_interval_ms: number; p_close_tab_after_analysis: boolean; p_allowed_sources: string[]; p_settings?: Json }; Returns: Json }
      retry_extension_capture_job: { Args: { p_job_id: string }; Returns: boolean }
      register_realtalent_connect_device: { Args: { p_organization_id: string; p_device_key: string; p_device_name: string; p_platform: string; p_app_version: string; p_metadata?: Json }; Returns: Json }
      heartbeat_realtalent_connect_device: { Args: { p_organization_id: string; p_device_id: string; p_pending_items?: number; p_last_error?: string | null }; Returns: Json }
      get_realtalent_connect_queue: { Args: { p_organization_id: string; p_limit?: number }; Returns: Json }
      enqueue_realtalent_connect_call: { Args: { p_organization_id: string; p_device_id: string; p_lead_id: string | null; p_phone: string; p_lead_name?: string; p_metadata?: Json }; Returns: Json }
      claim_realtalent_connect_call_commands: { Args: { p_organization_id: string; p_device_id: string; p_limit?: number }; Returns: Json }
      update_realtalent_connect_call_command: { Args: { p_organization_id: string; p_device_id: string; p_command_id: string; p_status: 'claimed' | 'dialing' | 'connected' | 'completed' | 'failed' | 'cancelled'; p_failure_reason?: string | null; p_metadata?: Json }; Returns: Json }
      rotate_extension_ingest_token: { Args: { p_organization_id: string }; Returns: string }
      revoke_extension_ingest_token: { Args: { p_organization_id: string }; Returns: boolean }
      validate_extension_ingest_token: { Args: { p_token: string }; Returns: string }
      retry_automation_event: { Args: { p_event_id: string }; Returns: boolean }
      cancel_automation_event: { Args: { p_event_id: string }; Returns: boolean }
      retry_failed_automation_events: { Args: { p_organization_id: string }; Returns: number }
      enqueue_workflow_execution: { Args: { p_organization_id: string; p_rule_id: string; p_trigger_type: string; p_entity_id: string; p_lead_id?: string | null; p_idempotency_key: string; p_correlation_id: string; p_input?: Json; p_context?: Json }; Returns: string }
      retry_workflow_execution: { Args: { p_execution_id: string }; Returns: boolean }
      cancel_workflow_execution: { Args: { p_execution_id: string }; Returns: boolean }
      move_lead_with_reason: { Args: { p_lead_id: string; p_stage_id: string; p_loss_reason?: string | null }; Returns: Database['public']['Tables']['leads']['Row'] }
      bulk_move_leads_with_reason: { Args: { p_organization_id: string; p_lead_ids: string[]; p_stage_id: string; p_loss_reason?: string | null }; Returns: Database['public']['Tables']['leads']['Row'][] }
      bulk_add_lead_tag: { Args: { p_organization_id: string; p_lead_ids: string[]; p_tag: string }; Returns: number }
      register_commercial_call_outcome: { Args: { p_organization_id: string; p_call_id: string; p_lead_id: string; p_outcome: string; p_duration_seconds: number; p_notes: string; p_transcript: string; p_recording_path: string | null; p_consent_at: string | null; p_started_at: string; p_ended_at: string | null; p_schedule_next: boolean; p_next_at: string | null; p_meeting_duration_minutes?: number }; Returns: Json }
      register_commercial_activity_outcome: { Args: { p_organization_id: string; p_activity_id: string; p_outcome: string; p_result_title: string; p_result_description: string; p_create_next: boolean; p_next_type: string | null; p_next_title: string | null; p_next_description: string | null; p_next_at: string | null; p_stage_id: string | null }; Returns: Json }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
