import type {
  ActivityItem, AutomationAction, AutomationCondition, AutomationRule, AutomationRun, AutomationRunOutput, AutomationRunStatus, CalendarEvent, CalendarEventStatus, CallOutcome, CallRecord, DashboardStats, Goal, GoalMetric, Lead, PipelineStage, Playbook,
  AuditLog, RepositoryHealth, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceSnapshot,
} from '../domain/types'
import { getSupabaseClient } from '../lib/supabase'
import { BACKUP_SCHEMA_VERSION } from '../lib/app-version'
import type { Database } from '../lib/supabase.types'
import type {
  CrmRepository, NewActivityInput, NewAutomationRuleInput, NewAutomationRunInput, NewCalendarEventInput, NewCallInput, NewGoalInput, NewLeadInput, NewPlaybookInput, NewStageInput,
  UpdateActivityInput, UpdateAutomationRuleInput, UpdateCalendarEventInput, UpdateGoalInput, UpdateLeadInput, UpdatePlaybookInput, UpdateStageInput,
} from './crm-repository'

type LeadRow = Database['public']['Tables']['leads']['Row']
type StageRow = Database['public']['Tables']['pipeline_stages']['Row']
type ActivityRow = Database['public']['Tables']['activities']['Row']
type CallRow = Database['public']['Tables']['calls']['Row']
type EventRow = Database['public']['Tables']['calendar_events']['Row']
type PlaybookRow = Database['public']['Tables']['playbooks']['Row']
type GoalRow = Database['public']['Tables']['goals']['Row']
type AutomationRuleRow = Database['public']['Tables']['automation_rules']['Row']
type AutomationRunRow = Database['public']['Tables']['automation_runs']['Row']

const requireClient = () => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase não configurado. Verifique o arquivo .env.')
  return client
}

const mapLead = (row: LeadRow, ownerName = 'Equipe'): Lead => ({
  id: row.id, workspaceId: row.organization_id, name: row.name, company: row.company, phone: row.phone, email: row.email,
  city: row.city, source: row.source, stageId: row.stage_id, status: row.status, temperature: row.temperature,
  priority: row.priority, ownerId: row.owner_id, ownerName, value: Number(row.value), nextActionAt: row.next_action_at, lastContactAt: row.last_contact_at, expectedCloseAt: row.expected_close_at,
  notes: row.notes, tags: row.tags ?? [], createdAt: row.created_at, updatedAt: row.updated_at,
})

const mapStage = (row: StageRow): PipelineStage => ({
  id: row.id, workspaceId: row.organization_id, name: row.name, order: row.stage_order, color: row.color,
  probability: row.probability, isWon: row.is_won, isLost: row.is_lost,
})

const mapActivity = (row: ActivityRow): ActivityItem => ({
  id: row.id, workspaceId: row.organization_id, leadId: row.lead_id, type: row.activity_type, title: row.title,
  description: row.description, dueAt: row.due_at, completedAt: row.completed_at, assignedTo: row.assigned_to,
  sourceType: row.source_type, sourceId: row.source_id, createdAt: row.created_at, updatedAt: row.updated_at,
})

const validOutcomes: CallOutcome[] = ['answered', 'no_answer', 'busy', 'voicemail', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'wrong_person', 'invalid_number', 'not_interested', 'sale_completed', 'other']
const mapCall = (row: CallRow, recordingUrl: string | null = null): CallRecord => ({
  id: row.id, workspaceId: row.organization_id, leadId: row.lead_id, userId: row.user_id,
  outcome: validOutcomes.includes(row.outcome as CallOutcome) ? row.outcome as CallOutcome : 'other',
  durationSeconds: row.duration_seconds, notes: row.notes, transcript: row.transcript, recordingPath: row.recording_path,
  recordingUrl, consentAt: row.consent_at, startedAt: row.started_at, endedAt: row.ended_at, createdAt: row.created_at,
})

const validEventStatuses: CalendarEventStatus[] = ['confirmed', 'tentative', 'completed', 'cancelled']
const mapEvent = (row: EventRow): CalendarEvent => ({
  id: row.id, workspaceId: row.organization_id, leadId: row.lead_id, title: row.title, description: row.description,
  startsAt: row.starts_at, endsAt: row.ends_at, allDay: row.all_day, location: row.location,
  status: validEventStatuses.includes(row.status as CalendarEventStatus) ? row.status as CalendarEventStatus : 'confirmed',
  assignedTo: row.assigned_to, createdAt: row.created_at, updatedAt: row.updated_at,
})



const mapPlaybook = (row: PlaybookRow): Playbook => ({
  id: row.id, workspaceId: row.organization_id, kind: row.kind, title: row.title, category: row.category,
  content: row.content, tags: row.tags ?? [], active: row.active, createdAt: row.created_at, updatedAt: row.updated_at,
})

const validGoalMetrics: GoalMetric[] = ['calls', 'contacts', 'followups', 'meetings', 'proposals', 'wins', 'revenue', 'new_leads']
const mapGoal = (row: GoalRow): Goal => ({
  id: row.id, workspaceId: row.organization_id, userId: row.user_id, userName: row.user_id ? 'Usuário' : 'Equipe',
  metric: validGoalMetrics.includes(row.metric as GoalMetric) ? row.metric as GoalMetric : 'calls', targetValue: Number(row.target_value),
  periodStart: row.period_start, periodEnd: row.period_end, createdAt: row.created_at, updatedAt: row.updated_at,
})

const mapAutomationRule = (row: AutomationRuleRow): AutomationRule => ({
  id: row.id, workspaceId: row.organization_id, name: row.name, enabled: row.enabled,
  triggerType: row.trigger_type as AutomationRule['triggerType'], conditions: (Array.isArray(row.conditions) ? row.conditions : []) as unknown as AutomationCondition[],
  actions: (Array.isArray(row.actions) ? row.actions : []) as unknown as AutomationAction[], createdBy: row.created_by,
  createdAt: row.created_at, updatedAt: row.updated_at,
})

const mapAutomationRun = (row: AutomationRunRow): AutomationRun => ({
  id: row.id, workspaceId: row.organization_id, ruleId: row.rule_id, eventKey: row.event_key,
  status: row.status as AutomationRunStatus, input: (row.input ?? {}) as unknown as Record<string, unknown>,
  output: (row.output ?? {}) as unknown as AutomationRunOutput, errorMessage: row.error_message,
  startedAt: row.started_at, finishedAt: row.finished_at,
})

const recordingExtension = (type: string) => type.includes('ogg') ? 'ogg' : type.includes('mpeg') ? 'mp3' : type.includes('wav') ? 'wav' : 'webm'

export class SupabaseCrmRepository implements CrmRepository {
  readonly mode = 'supabase' as const

  private async syncLeadNextAction(leadId: string | null) {
    if (!leadId) return
    const client = requireClient()
    const { data, error } = await client.from('activities').select('due_at')
      .eq('lead_id', leadId).is('completed_at', null).not('due_at', 'is', null)
      .in('activity_type', ['followup', 'meeting', 'call']).order('due_at').limit(1)
    if (error) throw error
    const { error: updateError } = await client.from('leads').update({ next_action_at: data?.[0]?.due_at ?? null }).eq('id', leadId)
    if (updateError) throw updateError
  }

  async initialize() {
    const client = requireClient(); const { error } = await client.auth.getSession(); if (error) throw error
  }

  async health(): Promise<RepositoryHealth> {
    try {
      const client = requireClient(); const { error } = await client.from('organizations').select('id', { count: 'exact', head: true }); if (error) throw error
      return { mode: this.mode, connected: true, message: 'Conectado ao Supabase com sessão protegida.', checkedAt: new Date().toISOString() }
    } catch (error) {
      return { mode: this.mode, connected: false, message: error instanceof Error ? error.message : 'Falha de conexão.', checkedAt: new Date().toISOString() }
    }
  }

  async listWorkspaces() {
    const client = requireClient()
    const { data, error } = await client.from('organization_members').select('role, organizations!inner(id,name,slug,created_at)').order('created_at', { foreignTable: 'organizations' })
    if (error) throw error
    return (data ?? []).map((item) => {
      const organization = item.organizations as unknown as { id: string; name: string; slug: string; created_at: string }
      return { id: organization.id, name: organization.name, slug: organization.slug, role: item.role, createdAt: organization.created_at } satisfies Workspace
    })
  }

  async createWorkspace(name: string) {
    const client = requireClient(); const { data, error } = await client.rpc('create_organization_with_defaults', { p_name: name.trim() }); if (error) throw error
    const workspace = (await this.listWorkspaces()).find((item) => item.id === data)
    if (!workspace) throw new Error('Workspace criado, mas não foi possível carregá-lo.')
    return workspace
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const client = requireClient()
    const { data, error } = await client.from('organization_members').select('organization_id,user_id,role,created_at,profiles!inner(display_name,email,avatar_url)').eq('organization_id', workspaceId).order('created_at')
    if (error) throw error
    return (data ?? []).map((row) => {
      const profile = row.profiles as unknown as { display_name: string; email: string; avatar_url: string | null }
      return { workspaceId: row.organization_id, userId: row.user_id, displayName: profile.display_name || profile.email.split('@')[0], email: profile.email, avatarUrl: profile.avatar_url, role: row.role, joinedAt: row.created_at }
    })
  }

  async createWorkspaceInvite(workspaceId: string, email: string, role: 'admin' | 'member' | 'viewer'): Promise<WorkspaceInvite> {
    const client = requireClient(); const { data, error } = await client.rpc('create_organization_invite', { p_organization_id: workspaceId, p_email: email.trim().toLowerCase(), p_role: role }); if (error) throw error
    const value = data as unknown as Record<string, unknown>
    return { id: String(value.id), workspaceId, token: String(value.token), email: String(value.email), role: String(value.role) as WorkspaceInvite['role'], expiresAt: String(value.expires_at), acceptedAt: null, revokedAt: null, createdAt: String(value.created_at) }
  }

  async listWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const client = requireClient(); const { data, error } = await client.from('organization_invites').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }); if (error) throw error
    return (data ?? []).map((row) => ({ id: row.id, workspaceId: row.organization_id, token: row.token, email: row.email, role: row.role, expiresAt: row.expires_at, acceptedAt: row.accepted_at, revokedAt: row.revoked_at, createdAt: row.created_at }))
  }

  async revokeWorkspaceInvite(inviteId: string) { const client = requireClient(); const { error } = await client.rpc('revoke_organization_invite', { p_invite_id: inviteId }); if (error) throw error }

  async acceptWorkspaceInvite(token: string) {
    const client = requireClient(); const { data, error } = await client.rpc('accept_organization_invite', { p_token: token }); if (error) throw error
    const workspace = (await this.listWorkspaces()).find((item) => item.id === data); if (!workspace) throw new Error('Convite aceito, mas o workspace não pôde ser carregado.')
    return workspace
  }

  async updateWorkspaceMemberRole(workspaceId: string, userId: string, role: 'admin' | 'member' | 'viewer') { const client = requireClient(); const { error } = await client.rpc('update_organization_member_role', { p_organization_id: workspaceId, p_user_id: userId, p_role: role }); if (error) throw error }

  async removeWorkspaceMember(workspaceId: string, userId: string) { const client = requireClient(); const { error } = await client.rpc('remove_organization_member', { p_organization_id: workspaceId, p_user_id: userId }); if (error) throw error }

  async listAuditLogs(workspaceId: string, limit = 100): Promise<AuditLog[]> {
    const client = requireClient(); const { data, error } = await client.from('audit_logs').select('id,organization_id,user_id,action,entity_type,entity_id,created_at').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(limit); if (error) throw error
    const userIds = Array.from(new Set((data ?? []).map((row) => row.user_id).filter((value): value is string => Boolean(value))))
    const names = new Map<string, string>()
    if (userIds.length) {
      const { data: profiles, error: profilesError } = await client.from('profiles').select('id,display_name').in('id', userIds); if (profilesError) throw profilesError
      for (const profile of profiles ?? []) names.set(profile.id, profile.display_name)
    }
    return (data ?? []).map((row) => ({ id: String(row.id), workspaceId: row.organization_id, userId: row.user_id, userName: row.user_id ? (names.get(row.user_id) ?? 'Usuário') : 'Sistema', action: row.action, entityType: row.entity_type, entityId: row.entity_id, createdAt: row.created_at }))
  }

  async exportWorkspace(workspaceId: string) {
    const [snapshot, members, auditLogs] = await Promise.all([this.getSnapshot(workspaceId), this.listWorkspaceMembers(workspaceId), this.listAuditLogs(workspaceId, 1000)])
    return { version: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), snapshot, members, auditLogs }
  }

  async getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
    const [workspaces, stages, leads, activities, calls, events, playbooks, goals, automationRules, automationRuns] = await Promise.all([
      this.listWorkspaces(), this.listStages(workspaceId), this.listLeads(workspaceId), this.listActivities(workspaceId),
      this.listCalls(workspaceId), this.listCalendarEvents(workspaceId), this.listPlaybooks(workspaceId), this.listGoals(workspaceId),
      this.listAutomationRules(workspaceId), this.listAutomationRuns(workspaceId),
    ])
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (!workspace) throw new Error('Workspace não encontrado ou sem acesso.')
    return { workspace, stages, leads, activities, calls, events, playbooks, goals, automationRules, automationRuns }
  }

  async listLeads(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('leads').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }); if (error) throw error
    return (data ?? []).map((row) => mapLead(row))
  }

  async createLead(input: NewLeadInput) {
    const client = requireClient(); const { data, error } = await client.from('leads').insert({
      organization_id: input.workspaceId, name: input.name.trim(), company: input.company, phone: input.phone, email: input.email,
      city: input.city, source: input.source, stage_id: input.stageId, status: input.status, temperature: input.temperature,
      priority: input.priority, owner_id: input.ownerId, value: input.value, next_action_at: input.nextActionAt, last_contact_at: input.lastContactAt, expected_close_at: input.expectedCloseAt ?? null, notes: input.notes, tags: input.tags,
    }).select().single(); if (error) throw error
    return mapLead(data, input.ownerName)
  }

  async updateLead(leadId: string, input: UpdateLeadInput) {
    const client = requireClient(); const payload: Database['public']['Tables']['leads']['Update'] = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.company !== undefined ? { company: input.company } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}), ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.stageId !== undefined ? { stage_id: input.stageId } : {}), ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.ownerId !== undefined ? { owner_id: input.ownerId } : {}), ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.nextActionAt !== undefined ? { next_action_at: input.nextActionAt } : {}), ...(input.lastContactAt !== undefined ? { last_contact_at: input.lastContactAt } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.expectedCloseAt !== undefined ? { expected_close_at: input.expectedCloseAt } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    }
    const { data, error } = await client.from('leads').update(payload).eq('id', leadId).select().single(); if (error) throw error
    return mapLead(data, input.ownerName)
  }

  async moveLead(leadId: string, stageId: string, lossReason?: string | null) {
    const client = requireClient()
    const { data, error } = await client.rpc('move_lead_with_reason', { p_lead_id: leadId, p_stage_id: stageId, p_loss_reason: lossReason ?? null })
    if (error) throw error
    return mapLead(data)
  }

  async bulkMoveLeads(workspaceId: string, leadIds: string[], stageId: string, lossReason?: string | null) {
    if (!leadIds.length) return []
    const client = requireClient()
    const { data, error } = await client.rpc('bulk_move_leads_with_reason', { p_organization_id: workspaceId, p_lead_ids: leadIds, p_stage_id: stageId, p_loss_reason: lossReason ?? null })
    if (error) throw error
    return (data ?? []).map((row) => mapLead(row))
  }

  async deleteLead(leadId: string) {
    const client = requireClient()
    const { data: calls, error: readError } = await client.from('calls').select('recording_path').eq('lead_id', leadId)
    if (readError) throw readError
    const { error } = await client.from('leads').delete().eq('id', leadId); if (error) throw error
    const paths = (calls ?? []).map((call) => call.recording_path).filter((path): path is string => Boolean(path))
    if (paths.length) await client.storage.from('crm-recordings').remove(paths)
  }

  async mergeLeads(workspaceId: string, primaryLeadId: string, duplicateLeadId: string) {
    const client = requireClient()
    const { data, error } = await client.rpc('merge_duplicate_leads', {
      p_organization_id: workspaceId, p_primary_lead_id: primaryLeadId, p_duplicate_lead_id: duplicateLeadId,
    })
    if (error) throw error
    const { data: lead, error: leadError } = await client.from('leads').select('*').eq('id', String(data)).single()
    if (leadError) throw leadError
    return mapLead(lead)
  }

  async bulkUpdateLeads(workspaceId: string, leadIds: string[], input: UpdateLeadInput) {
    if (!leadIds.length) return 0
    const client = requireClient(); let status = input.status
    if (input.stageId) {
      const { data: stage, error: stageError } = await client.from('pipeline_stages').select('is_won,is_lost').eq('id', input.stageId).eq('organization_id', workspaceId).single(); if (stageError) throw stageError
      status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'active'
    }
    const payload: Database['public']['Tables']['leads']['Update'] = {
      ...(input.stageId !== undefined ? { stage_id: input.stageId } : {}), ...(status !== undefined ? { status } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.ownerId !== undefined ? { owner_id: input.ownerId } : {}), ...(input.nextActionAt !== undefined ? { next_action_at: input.nextActionAt } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}), ...(input.tags !== undefined ? { tags: input.tags } : {}),
    }
    const { data, error } = await client.from('leads').update(payload).eq('organization_id', workspaceId).in('id', leadIds).select('id'); if (error) throw error
    return data?.length ?? 0
  }

  async bulkAddLeadTag(workspaceId: string, leadIds: string[], tag: string) {
    const client = requireClient()
    const { data, error } = await client.rpc('bulk_add_lead_tag', { p_organization_id: workspaceId, p_lead_ids: leadIds, p_tag: tag })
    if (error) throw error
    return Number(data ?? 0)
  }

  async bulkDeleteLeads(workspaceId: string, leadIds: string[]) {
    if (!leadIds.length) return 0
    const client = requireClient()
    const { data: calls, error: readError } = await client.from('calls').select('recording_path').eq('organization_id', workspaceId).in('lead_id', leadIds)
    if (readError) throw readError
    const { data, error } = await client.from('leads').delete().eq('organization_id', workspaceId).in('id', leadIds).select('id'); if (error) throw error
    const paths = (calls ?? []).map((call) => call.recording_path).filter((path): path is string => Boolean(path))
    if (paths.length) await client.storage.from('crm-recordings').remove(paths)
    return data?.length ?? 0
  }

  async listStages(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('pipeline_stages').select('*').eq('organization_id', workspaceId).order('stage_order'); if (error) throw error
    return (data ?? []).map(mapStage)
  }

  async createStage(input: NewStageInput) {
    const client = requireClient(); const { data: existing, error: existingError } = await client.from('pipeline_stages').select('stage_order').eq('organization_id', input.workspaceId).order('stage_order', { ascending: false }).limit(1); if (existingError) throw existingError
    const { data, error } = await client.from('pipeline_stages').insert({
      organization_id: input.workspaceId, name: input.name.trim(), stage_order: input.order ?? ((existing?.[0]?.stage_order ?? 0) + 1),
      color: input.color, probability: input.probability, is_won: input.isWon, is_lost: input.isLost,
    }).select().single(); if (error) throw error
    return mapStage(data)
  }

  async updateStage(stageId: string, input: UpdateStageInput) {
    const client = requireClient(); const { data, error } = await client.from('pipeline_stages').update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.probability !== undefined ? { probability: input.probability } : {}), ...(input.isWon !== undefined ? { is_won: input.isWon } : {}),
      ...(input.isLost !== undefined ? { is_lost: input.isLost } : {}),
    }).eq('id', stageId).select().single(); if (error) throw error
    const stage = mapStage(data); const { error: leadsError } = await client.from('leads').update({ status: stage.isWon ? 'won' : stage.isLost ? 'lost' : 'active' }).eq('stage_id', stageId); if (leadsError) throw leadsError
    return stage
  }

  async deleteStage(stageId: string) {
    const client = requireClient(); const { count, error: countError } = await client.from('leads').select('id', { count: 'exact', head: true }).eq('stage_id', stageId); if (countError) throw countError
    if ((count ?? 0) > 0) throw new Error('Mova os leads desta etapa antes de excluí-la.')
    const { error } = await client.from('pipeline_stages').delete().eq('id', stageId); if (error) throw error
  }

  async listActivities(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('activities').select('*').eq('organization_id', workspaceId).order('due_at', { ascending: true, nullsFirst: false }).limit(1000); if (error) throw error
    return (data ?? []).map(mapActivity)
  }

  async createActivity(input: NewActivityInput) {
    const client = requireClient(); const { data, error } = await client.from('activities').insert({
      organization_id: input.workspaceId, lead_id: input.leadId, activity_type: input.type, title: input.title.trim(), description: input.description,
      due_at: input.dueAt, completed_at: input.completedAt, assigned_to: input.assignedTo, source_type: input.sourceType, source_id: input.sourceId,
    }).select().single(); if (error) throw error
    await this.syncLeadNextAction(input.leadId); return mapActivity(data)
  }

  async createActivities(inputs: NewActivityInput[]) {
    if (!inputs.length) return []
    const client = requireClient()
    const payload = inputs.map((input) => ({
      organization_id: input.workspaceId, lead_id: input.leadId, activity_type: input.type, title: input.title.trim(), description: input.description,
      due_at: input.dueAt, completed_at: input.completedAt, assigned_to: input.assignedTo, source_type: input.sourceType, source_id: input.sourceId,
    }))
    const { data, error } = await client.from('activities').insert(payload).select(); if (error) throw error
    const leadIds = [...new Set(inputs.map((input) => input.leadId).filter((id): id is string => Boolean(id)))]
    await Promise.all(leadIds.map((leadId) => this.syncLeadNextAction(leadId)))
    return (data ?? []).map(mapActivity)
  }

  async updateActivity(activityId: string, input: UpdateActivityInput) {
    const client = requireClient(); const { data: previous, error: previousError } = await client.from('activities').select('lead_id').eq('id', activityId).single(); if (previousError) throw previousError
    const { data, error } = await client.from('activities').update({
      ...(input.leadId !== undefined ? { lead_id: input.leadId } : {}), ...(input.type !== undefined ? { activity_type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueAt !== undefined ? { due_at: input.dueAt } : {}), ...(input.completedAt !== undefined ? { completed_at: input.completedAt } : {}),
      ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
    }).eq('id', activityId).select().single(); if (error) throw error
    await Promise.all([this.syncLeadNextAction(previous.lead_id), this.syncLeadNextAction(data.lead_id)]); return mapActivity(data)
  }

  async deleteActivity(activityId: string) {
    const client = requireClient(); const { data: activity, error: readError } = await client.from('activities').select('lead_id,source_type').eq('id', activityId).single(); if (readError) throw readError
    if (activity.source_type === 'calendar' || activity.source_type === 'call') throw new Error('Esta atividade é gerenciada pelo módulo de origem.')
    const { error } = await client.from('activities').delete().eq('id', activityId); if (error) throw error
    await this.syncLeadNextAction(activity.lead_id)
  }

  async completeActivity(activityId: string, completed: boolean) { return this.updateActivity(activityId, { completedAt: completed ? new Date().toISOString() : null }) }

  async listCalls(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('calls').select('*').eq('organization_id', workspaceId).order('started_at', { ascending: false }).limit(500); if (error) throw error
    return Promise.all((data ?? []).map(async (row) => {
      if (!row.recording_path) return mapCall(row)
      const { data: signed } = await client.storage.from('crm-recordings').createSignedUrl(row.recording_path, 3600)
      return mapCall(row, signed?.signedUrl ?? null)
    }))
  }

  async createCall(input: NewCallInput, recording?: Blob | null) {
    const client = requireClient(); const callId = crypto.randomUUID(); let recordingPath: string | null = null
    if (recording && recording.size) {
      recordingPath = `${input.workspaceId}/${callId}.${recordingExtension(recording.type)}`
      const { error: uploadError } = await client.storage.from('crm-recordings').upload(recordingPath, recording, { contentType: recording.type || 'audio/webm', upsert: false })
      if (uploadError) throw uploadError
    }
    const { data, error } = await client.from('calls').insert({
      id: callId, organization_id: input.workspaceId, lead_id: input.leadId, user_id: input.userId, outcome: input.outcome,
      duration_seconds: input.durationSeconds, notes: input.notes, transcript: input.transcript, recording_path: recordingPath, consent_at: input.consentAt ?? null, consent_text: recordingPath ? 'O participante foi informado e consentiu com a gravação.' : null, consent_by: recordingPath ? input.userId : null,
      started_at: input.startedAt, ended_at: input.endedAt,
    }).select().single()
    if (error) {
      if (recordingPath) await client.storage.from('crm-recordings').remove([recordingPath])
      throw error
    }
    try {
      await client.from('activities').insert({
        organization_id: input.workspaceId, lead_id: input.leadId, activity_type: 'call', title: `Ligação — ${input.outcome}`,
        description: input.notes, due_at: input.startedAt, completed_at: input.endedAt ?? input.startedAt, assigned_to: input.userId,
        source_type: 'call', source_id: callId,
      }).throwOnError()
    } catch (activityError) {
      await client.from('calls').delete().eq('id', callId); if (recordingPath) await client.storage.from('crm-recordings').remove([recordingPath]); throw activityError
    }
    let recordingUrl: string | null = null
    if (recordingPath) recordingUrl = (await client.storage.from('crm-recordings').createSignedUrl(recordingPath, 3600)).data?.signedUrl ?? null
    return mapCall(data, recordingUrl)
  }

  async deleteCall(callId: string) {
    const client = requireClient(); const { data: call, error: readError } = await client.from('calls').select('recording_path').eq('id', callId).single(); if (readError) throw readError
    const { error: activityError } = await client.from('activities').delete().eq('source_type', 'call').eq('source_id', callId); if (activityError) throw activityError
    const { error } = await client.from('calls').delete().eq('id', callId); if (error) throw error
    if (call.recording_path) await client.storage.from('crm-recordings').remove([call.recording_path])
  }

  async listCalendarEvents(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('calendar_events').select('*').eq('organization_id', workspaceId).order('starts_at').limit(1000); if (error) throw error
    return (data ?? []).map(mapEvent)
  }

  async createCalendarEvent(input: NewCalendarEventInput) {
    const client = requireClient(); const { data, error } = await client.from('calendar_events').insert({
      organization_id: input.workspaceId, lead_id: input.leadId, title: input.title.trim(), description: input.description,
      starts_at: input.startsAt, ends_at: input.endsAt, all_day: input.allDay, location: input.location, status: input.status, assigned_to: input.assignedTo,
    }).select().single(); if (error) throw error
    try {
      await client.from('activities').insert({
        organization_id: input.workspaceId, lead_id: input.leadId, activity_type: 'meeting', title: input.title.trim(), description: input.description,
        due_at: input.startsAt, completed_at: input.status === 'completed' || input.status === 'cancelled' ? new Date().toISOString() : null,
        assigned_to: input.assignedTo, source_type: 'calendar', source_id: data.id,
      }).throwOnError()
    } catch (activityError) { await client.from('calendar_events').delete().eq('id', data.id); throw activityError }
    await this.syncLeadNextAction(input.leadId); return mapEvent(data)
  }

  async updateCalendarEvent(eventId: string, input: UpdateCalendarEventInput) {
    const client = requireClient(); const { data: previous, error: previousError } = await client.from('calendar_events').select('lead_id').eq('id', eventId).single(); if (previousError) throw previousError
    const { data, error } = await client.from('calendar_events').update({
      ...(input.leadId !== undefined ? { lead_id: input.leadId } : {}), ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}), ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { ends_at: input.endsAt } : {}), ...(input.allDay !== undefined ? { all_day: input.allDay } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}), ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
    }).eq('id', eventId).select().single(); if (error) throw error
    const completedAt = data.status === 'completed' || data.status === 'cancelled' ? new Date().toISOString() : null
    const { data: updatedActivity, error: activityError } = await client.from('activities').update({
      lead_id: data.lead_id, title: data.title, description: data.description, due_at: data.starts_at, completed_at: completedAt, assigned_to: data.assigned_to,
    }).eq('source_type', 'calendar').eq('source_id', eventId).select('id')
    if (activityError) throw activityError
    if (!updatedActivity?.length) await client.from('activities').insert({
      organization_id: data.organization_id, lead_id: data.lead_id, activity_type: 'meeting', title: data.title, description: data.description,
      due_at: data.starts_at, completed_at: completedAt, assigned_to: data.assigned_to, source_type: 'calendar', source_id: data.id,
    }).throwOnError()
    await Promise.all([this.syncLeadNextAction(previous.lead_id), this.syncLeadNextAction(data.lead_id)]); return mapEvent(data)
  }

  async deleteCalendarEvent(eventId: string) {
    const client = requireClient(); const { data: event, error: readError } = await client.from('calendar_events').select('lead_id').eq('id', eventId).single(); if (readError) throw readError
    const { error: activityError } = await client.from('activities').delete().eq('source_type', 'calendar').eq('source_id', eventId); if (activityError) throw activityError
    const { error } = await client.from('calendar_events').delete().eq('id', eventId); if (error) throw error
    await this.syncLeadNextAction(event.lead_id)
  }


  async listPlaybooks(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('playbooks').select('*').eq('organization_id', workspaceId).order('title'); if (error) throw error
    return (data ?? []).map(mapPlaybook)
  }

  async createPlaybook(input: NewPlaybookInput) {
    const client = requireClient(); const { data, error } = await client.from('playbooks').insert({ organization_id: input.workspaceId, kind: input.kind, title: input.title.trim(), category: input.category.trim(), content: input.content.trim(), tags: input.tags, active: input.active }).select().single(); if (error) throw error
    return mapPlaybook(data)
  }

  async updatePlaybook(playbookId: string, input: UpdatePlaybookInput) {
    const client = requireClient(); const { data, error } = await client.from('playbooks').update({ ...(input.kind !== undefined ? { kind: input.kind } : {}), ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.category !== undefined ? { category: input.category.trim() } : {}), ...(input.content !== undefined ? { content: input.content.trim() } : {}), ...(input.tags !== undefined ? { tags: input.tags } : {}), ...(input.active !== undefined ? { active: input.active } : {}) }).eq('id', playbookId).select().single(); if (error) throw error
    return mapPlaybook(data)
  }

  async deletePlaybook(playbookId: string) { const client = requireClient(); const { error } = await client.from('playbooks').delete().eq('id', playbookId); if (error) throw error }

  async listGoals(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('goals').select('*').eq('organization_id', workspaceId).order('period_start', { ascending: false }); if (error) throw error
    return (data ?? []).map(mapGoal)
  }

  async createGoal(input: NewGoalInput) {
    const client = requireClient(); const { data, error } = await client.from('goals').insert({
      organization_id: input.workspaceId, user_id: input.userId, metric: input.metric, target_value: input.targetValue,
      period_start: input.periodStart, period_end: input.periodEnd,
    }).select().single(); if (error) throw error
    return { ...mapGoal(data), userName: input.userName }
  }

  async updateGoal(goalId: string, input: UpdateGoalInput) {
    const client = requireClient(); const { data, error } = await client.from('goals').update({
      ...(input.userId !== undefined ? { user_id: input.userId } : {}), ...(input.metric !== undefined ? { metric: input.metric } : {}),
      ...(input.targetValue !== undefined ? { target_value: input.targetValue } : {}), ...(input.periodStart !== undefined ? { period_start: input.periodStart } : {}),
      ...(input.periodEnd !== undefined ? { period_end: input.periodEnd } : {}),
    }).eq('id', goalId).select().single(); if (error) throw error
    return { ...mapGoal(data), ...(input.userName !== undefined ? { userName: input.userName } : {}) }
  }

  async deleteGoal(goalId: string) { const client = requireClient(); const { error } = await client.from('goals').delete().eq('id', goalId); if (error) throw error }

  async listAutomationRules(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('automation_rules').select('*').eq('organization_id', workspaceId).order('name'); if (error) throw error
    return (data ?? []).map(mapAutomationRule)
  }

  async createAutomationRule(input: NewAutomationRuleInput) {
    const client = requireClient(); const { data, error } = await client.from('automation_rules').insert({
      organization_id: input.workspaceId, name: input.name.trim(), enabled: input.enabled, trigger_type: input.triggerType,
      conditions: input.conditions as unknown as Database['public']['Tables']['automation_rules']['Insert']['conditions'],
      actions: input.actions as unknown as Database['public']['Tables']['automation_rules']['Insert']['actions'], created_by: input.createdBy,
    }).select().single(); if (error) throw error
    return mapAutomationRule(data)
  }

  async updateAutomationRule(ruleId: string, input: UpdateAutomationRuleInput) {
    const client = requireClient(); const { data, error } = await client.from('automation_rules').update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.triggerType !== undefined ? { trigger_type: input.triggerType } : {}),
      ...(input.conditions !== undefined ? { conditions: input.conditions as unknown as Database['public']['Tables']['automation_rules']['Update']['conditions'] } : {}),
      ...(input.actions !== undefined ? { actions: input.actions as unknown as Database['public']['Tables']['automation_rules']['Update']['actions'] } : {}),
    }).eq('id', ruleId).select().single(); if (error) throw error
    return mapAutomationRule(data)
  }

  async deleteAutomationRule(ruleId: string) { const client = requireClient(); const { error } = await client.from('automation_rules').delete().eq('id', ruleId); if (error) throw error }

  async listAutomationRuns(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('automation_runs').select('*').eq('organization_id', workspaceId).order('started_at', { ascending: false }).limit(300); if (error) throw error
    return (data ?? []).map(mapAutomationRun)
  }

  async startAutomationRun(input: NewAutomationRunInput) {
    const client = requireClient(); const { data, error } = await client.from('automation_runs').insert({
      organization_id: input.workspaceId, rule_id: input.ruleId, event_key: input.eventKey, status: 'running',
      input: input.input as unknown as Database['public']['Tables']['automation_runs']['Insert']['input'], output: {},
    }).select().single()
    if (error && (error as { code?: string }).code === '23505') return null
    if (error) throw error
    return mapAutomationRun(data)
  }

  async finishAutomationRun(runId: string, status: AutomationRunStatus, output: AutomationRunOutput, errorMessage: string | null = null) {
    const client = requireClient(); const { data, error } = await client.from('automation_runs').update({
      status, output: output as unknown as Database['public']['Tables']['automation_runs']['Update']['output'], error_message: errorMessage,
      finished_at: new Date().toISOString(),
    }).eq('id', runId).select().single(); if (error) throw error
    return mapAutomationRun(data)
  }

  async getDashboardStats(workspaceId: string): Promise<DashboardStats> {
    const [leads, activities] = await Promise.all([this.listLeads(workspaceId), this.listActivities(workspaceId)]); const now = new Date()
    const isSameDay = (value: string) => { const date = new Date(value); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate() }
    return {
      activeLeads: leads.filter((lead) => lead.status === 'active').length,
      pipelineValue: leads.filter((lead) => lead.status === 'active').reduce((sum, lead) => sum + lead.value, 0),
      dueToday: activities.filter((activity) => activity.dueAt && !activity.completedAt && isSameDay(activity.dueAt)).length,
      hotLeads: leads.filter((lead) => lead.status === 'active' && lead.temperature === 'hot').length,
      wonThisMonth: leads.filter((lead) => {
        const updated = new Date(lead.updatedAt)
        return lead.status === 'won' && updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear()
      }).length,
    }
  }

  async importLeads(workspaceId: string, leads: Lead[]) {
    const client = requireClient(); if (!leads.length) return 0
    const payload = leads.map((lead) => ({ organization_id: workspaceId, name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, city: lead.city, source: lead.source, stage_id: lead.stageId, status: lead.status, temperature: lead.temperature, priority: lead.priority, owner_id: null, value: lead.value, next_action_at: lead.nextActionAt, notes: lead.notes, tags: lead.tags }))
    const { error } = await client.from('leads').insert(payload); if (error) throw error
    return payload.length
  }
}
