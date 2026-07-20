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
          source: string; stage_id: string; status: 'active' | 'won' | 'lost' | 'archived'; temperature: 'cold' | 'warm' | 'hot';
          priority: 'low' | 'medium' | 'high' | 'urgent'; owner_id: string | null; value: number; next_action_at: string | null; last_contact_at: string | null; expected_close_at: string | null;
          cnpj: string; instagram: string; notes: string; tags: string[]; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; organization_id: string; name: string; company?: string; phone?: string; email?: string; city?: string;
          source?: string; stage_id: string; status?: 'active' | 'won' | 'lost' | 'archived'; temperature?: 'cold' | 'warm' | 'hot';
          priority?: 'low' | 'medium' | 'high' | 'urgent'; owner_id?: string | null; value?: number; next_action_at?: string | null; last_contact_at?: string | null; expected_close_at?: string | null;
          cnpj?: string; instagram?: string; notes?: string; tags?: string[]; created_at?: string; updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leads']['Insert']>
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
        Row: { id: string; organization_id: string; kind: 'script' | 'objection'; title: string; category: string; content: string; tags: string[]; active: boolean; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; kind?: 'script' | 'objection'; title: string; category?: string; content: string; tags?: string[]; active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: { kind?: 'script' | 'objection'; title?: string; category?: string; content?: string; tags?: string[]; active?: boolean; updated_at?: string }
        Relationships: []
      }
      goals: {
        Row: { id: string; organization_id: string; user_id: string | null; metric: string; target_value: number; period_start: string; period_end: string; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; user_id?: string | null; metric: string; target_value?: number; period_start: string; period_end: string; created_at?: string; updated_at?: string }
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
      contact_drafts: {
        Row: { id: string; organization_id: string; lead_id: string; channel: string; subject: string; message: string; status: string; source_type: string; source_id: string | null; created_at: string; used_at: string | null }
        Insert: { id?: string; organization_id: string; lead_id: string; channel: string; subject?: string; message: string; status?: string; source_type?: string; source_id?: string | null; created_at?: string; used_at?: string | null }
        Update: Partial<Database['public']['Tables']['contact_drafts']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_organization_with_defaults: { Args: { p_name: string }; Returns: string }
      create_organization_invite: { Args: { p_organization_id: string; p_email: string; p_role: 'admin' | 'member' | 'viewer' }; Returns: Json }
      accept_organization_invite: { Args: { p_token: string }; Returns: string }
      revoke_organization_invite: { Args: { p_invite_id: string }; Returns: boolean }
      update_organization_member_role: { Args: { p_organization_id: string; p_user_id: string; p_role: 'admin' | 'member' | 'viewer' }; Returns: boolean }
      remove_organization_member: { Args: { p_organization_id: string; p_user_id: string }; Returns: boolean }
      production_readiness: { Args: { p_organization_id: string }; Returns: Json }
      merge_duplicate_leads: { Args: { p_organization_id: string; p_primary_lead_id: string; p_duplicate_lead_id: string }; Returns: string }
      rotate_extension_ingest_token: { Args: { p_organization_id: string }; Returns: string }
      revoke_extension_ingest_token: { Args: { p_organization_id: string }; Returns: boolean }
      validate_extension_ingest_token: { Args: { p_token: string }; Returns: string }
      retry_automation_event: { Args: { p_event_id: string }; Returns: boolean }
      cancel_automation_event: { Args: { p_event_id: string }; Returns: boolean }
      retry_failed_automation_events: { Args: { p_organization_id: string }; Returns: number }
      move_lead_with_reason: { Args: { p_lead_id: string; p_stage_id: string; p_loss_reason?: string | null }; Returns: Database['public']['Tables']['leads']['Row'] }
      bulk_move_leads_with_reason: { Args: { p_organization_id: string; p_lead_ids: string[]; p_stage_id: string; p_loss_reason?: string | null }; Returns: Database['public']['Tables']['leads']['Row'][] }
      bulk_add_lead_tag: { Args: { p_organization_id: string; p_lead_ids: string[]; p_tag: string }; Returns: number }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
