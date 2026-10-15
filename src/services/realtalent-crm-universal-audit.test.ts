import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REALTALENT_UNIVERSAL_CAPABILITIES } from './realtalent-crm-universal-registry'

const appContextSource = fs.readFileSync(path.resolve(process.cwd(), 'src/app/app-context-types.ts'), 'utf8')
const baseExecutor = fs.readFileSync(path.resolve(process.cwd(), 'src/services/realtalent-crm-capability-executor.ts'), 'utf8')
const universalExecutor = fs.readFileSync(path.resolve(process.cwd(), 'src/services/realtalent-crm-universal-executor.ts'), 'utf8')
const universalContacts = fs.readFileSync(path.resolve(process.cwd(), 'src/services/realtalent-crm-universal-executor-contacts.ts'), 'utf8')
const universalAdmin = fs.readFileSync(path.resolve(process.cwd(), 'src/services/realtalent-crm-universal-executor-admin.ts'), 'utf8')
const executorSource = [baseExecutor, universalExecutor, universalContacts, universalAdmin].join('\n')

const interfaceBlock = appContextSource.split('export interface AppContextValue {')[1]?.split('\n}')[0] ?? ''
const appMethods = [...interfaceBlock.matchAll(/^\s{2}([A-Za-z0-9_]+)\(/gm)].map((match) => match[1])

const METHOD_CAPABILITY: Record<string, string> = {
  setCurrentWorkspace: 'workspace.select', createWorkspace: 'workspace.create', listWorkspaceMembers: 'workspace.members', createWorkspaceMember: 'teams.create_member',
  createWorkspaceInvite: 'teams.invite', listWorkspaceInvites: 'workspace.invites', revokeWorkspaceInvite: 'teams.revoke_invite', updateWorkspaceMemberRole: 'teams.update_role', removeWorkspaceMember: 'teams.remove_member',
  listAuditLogs: 'workspace.audit_logs', exportWorkspace: 'workspace.export', clearOperationalData: 'workspace.clear_operational_data', synchronizeCommercialStructure: 'workspace.sync_structure',
  createCompany: 'companies.create', updateCompany: 'companies.update', createContact: 'contacts.create', updateContact: 'contacts.update', deleteContact: 'contacts.delete',
  createContactRelationship: 'contacts.relationship_create', updateContactRelationship: 'contacts.relationship_update', deleteContactRelationship: 'contacts.relationship_delete',
  createLead: 'leads.create', updateLead: 'leads.update', moveLead: 'pipeline.move', bulkMoveLeads: 'leads.bulk_move', mergeLeads: 'leads.merge', deleteLead: 'leads.delete', bulkUpdateLeads: 'leads.bulk_update', reclassifyLeads: 'leads.reclassify', bulkAddLeadTag: 'leads.bulk_tag', bulkDeleteLeads: 'leads.bulk_delete',
  createStage: 'pipeline.create_stage', updateStage: 'pipeline.update_stage', deleteStage: 'pipeline.delete_stage',
  updateActivity: 'activities.update', completeActivity: 'activities.complete', registerActivityOutcome: 'activities.register_outcome', deleteActivity: 'activities.delete', createCadence: 'cadences.create', updateCadenceState: 'cadences.update_state',
  createCall: 'calls.log_outcome', registerCallOutcome: 'calls.register_outcome', deleteCall: 'calls.delete', resolveCallRecordingUrl: 'calls.recording_url',
  createCalendarEvent: 'calendar.create', updateCalendarEvent: 'calendar.update', deleteCalendarEvent: 'calendar.delete',
  createPlaybook: 'playbooks.create', updatePlaybook: 'playbooks.update', deletePlaybook: 'playbooks.delete',
  createProduct: 'catalog.create_product', updateProduct: 'catalog.update_product', reconcileProposalItems: 'catalog.reconcile_proposal_items', deleteProduct: 'catalog.delete_product',
  createProposal: 'proposals.create', updateProposal: 'proposals.update', createProposalRevision: 'proposals.create_revision', updateProposalStatus: 'proposals.update_status', setOfficialProposal: 'proposals.make_official', closeOpportunityFromProposal: 'proposals.close_opportunity', deleteProposal: 'proposals.delete',
  createBuyerRoom: 'buyer_rooms.create', updateBuyerRoom: 'buyer_rooms.update', rotateBuyerRoomToken: 'buyer_rooms.rotate_token', deleteBuyerRoom: 'buyer_rooms.delete',
  createRevenueEntry: 'revenue.create', updateRevenueEntryStatus: 'revenue.update_status', createGoal: 'goals.create', updateGoal: 'goals.update', deleteGoal: 'goals.delete',
  createAutomationRule: 'automations.create', updateAutomationRule: 'automations.toggle', deleteAutomationRule: 'automations.delete', simulateAutomationRule: 'automations.simulate', runAutomationRule: 'automations.run', runAutomationChecks: 'automations.run_checks', undoAutomationRun: 'automations.undo_run',
  restoreWorkspaceBackup: 'backup.restore_workspace', importLegacyBackup: 'backup.import_legacy', importLeadFile: 'backup.import_leads',
}

const EQUIVALENT = new Set(['createActivity','createActivities','createCalendarEvents'])
const INTERNAL = new Set([
  'setRoute','navigate','clearRouteContext','can','canTeamAccess','teamAccessScope','canTeamAccessRecord','dismissToast','confirmAction','promptAction','resolveActionDialog',
  'refresh','refreshAgentExecutionState','reinitialize','loadOlderCalls','recordBuyerRoomActivity','notify',
])

const directCapabilityIds = new Set(REALTALENT_UNIVERSAL_CAPABILITIES.map((item) => item.id))
const nativeCapabilities = REALTALENT_UNIVERSAL_CAPABILITIES.filter((item) => item.execution === 'native')

const groupedWitnesses: Record<string, string> = {
  'proposals.update_status': 'actions.updateProposalStatus(proposal.id, status)', 'catalog.update_product': 'actions.updateProduct(product.id, patch as any)', 'goals.update': 'actions.updateGoal(goal.id, patch as any)',
  'playbooks.update': 'actions.updatePlaybook(playbook.id, patch as any)', 'automations.run': 'actions.runAutomationRule(rule.id, lead.id)', 'teams.update_role': 'actions.updateWorkspaceMemberRole(member.userId, role)', 'revenue.update_status': 'actions.updateRevenueEntryStatus(entry.id, status)',
}

const hasExecutorWitness = (id: string) => executorSource.includes(`'${id}'`) || executorSource.includes(`\"${id}\"`) || Boolean(groupedWitnesses[id] && executorSource.includes(groupedWitnesses[id])) || id === 'agent.undo_last'

describe('RealTalent Agent — auditoria universal do CRM', () => {
  it('classifica toda função exposta pelo AppContext sem deixar lacunas silenciosas', () => {
    const gaps = appMethods.filter((method) => !METHOD_CAPABILITY[method] && !EQUIVALENT.has(method) && !INTERNAL.has(method))
    expect(gaps, `Funções do CRM ainda não classificadas para o Agent: ${gaps.join(', ')}`).toEqual([])
  })

  it('mantém capability correspondente para toda função conversacional direta', () => {
    const missing = Object.entries(METHOD_CAPABILITY).filter(([, capability]) => !directCapabilityIds.has(capability)).map(([method, capability]) => `${method} -> ${capability}`)
    expect(missing, `Funções sem capability correspondente: ${missing.join(', ')}`).toEqual([])
  })

  it('mantém executor real para toda capability nativa universal', () => {
    const missing = nativeCapabilities.map((item) => item.id).filter((id) => !hasExecutorWitness(id))
    expect(missing, `Capabilities nativas universais sem executor: ${missing.join(', ')}`).toEqual([])
  })

  it('não envia capabilities guiadas por arquivo para execução automática do Ollama', () => {
    const guided = REALTALENT_UNIVERSAL_CAPABILITIES.filter((item) => item.execution === 'guided')
    expect(guided.map((item) => item.id).sort()).toEqual(expect.arrayContaining(['backup.import_leads','backup.import_legacy','backup.restore_workspace','workspace.export']))
  })
})
