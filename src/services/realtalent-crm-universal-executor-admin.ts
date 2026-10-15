import { createId } from '../lib/id'
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import type { CrmCapabilityExecutionRuntime, CrmCapabilityStepResult } from './realtalent-crm-capability-executor'
import { parseJson, targetQuery, uarg, ubest, ubool } from './realtalent-crm-universal-executor-helpers'

export async function executeUniversalAdmin(step: CrmCapabilityPlanStep, runtime: CrmCapabilityExecutionRuntime): Promise<CrmCapabilityStepResult | null> {
  const { actions, snapshot } = runtime

  if (step.capabilityId === 'teams.create_member') {
    const displayName = uarg(step, 'display_name').trim()
    if (!displayName) throw new Error('Informe o nome do membro.')
    const member = await actions.createWorkspaceMember({ displayName, email: uarg(step, 'email') || undefined, role: (uarg(step, 'role') || 'member') as any })
    return { ok: true, summary: `Membro ${member.displayName || member.email} criado no workspace.` }
  }

  if (step.capabilityId === 'teams.revoke_invite') {
    const invites = await actions.listWorkspaceInvites()
    const invite = ubest(invites, uarg(step, 'invite_query'), (item) => [item.id, item.email, item.role])
    if (!invite) throw new Error('Não encontrei o convite que você quer revogar.')
    await actions.revokeWorkspaceInvite(invite.id)
    return { ok: true, summary: `Convite de ${invite.email} revogado.` }
  }

  if (step.capabilityId === 'automations.update') {
    const rule = ubest(snapshot.automationRules, targetQuery(step), (item) => [item.id, item.name])
    if (!rule) throw new Error('Não encontrei a automação que você quer atualizar.')
    const patch: Record<string, unknown> = {}
    if (uarg(step, 'name')) patch.name = uarg(step, 'name')
    if (uarg(step, 'trigger_type')) patch.triggerType = uarg(step, 'trigger_type')
    if (uarg(step, 'enabled')) patch.enabled = ubool(uarg(step, 'enabled'))
    if (uarg(step, 'conditions_json')) patch.conditions = parseJson<any[]>(uarg(step, 'conditions_json'), []).map((item) => ({ ...item, id: item.id || createId('condition') }))
    if (uarg(step, 'actions_json')) patch.actions = parseJson<any[]>(uarg(step, 'actions_json'), []).map((item) => ({ ...item, id: item.id || createId('action') }))
    if (!Object.keys(patch).length) throw new Error('Informe o que você quer alterar na automação.')
    const updated = await actions.updateAutomationRule(rule.id, patch as any)
    return { ok: true, summary: `Automação “${updated.name}” atualizada.` }
  }

  if (step.capabilityId === 'calls.recording_url') {
    const call = ubest(snapshot.calls, targetQuery(step), (item) => [item.id, item.notes, item.outcome, item.startedAt])
    if (!call) throw new Error('Não encontrei a ligação.')
    const url = await actions.resolveCallRecordingUrl(call.id)
    return { ok: true, summary: url ? `Gravação disponível: ${url}` : 'Esta ligação não possui gravação disponível.' }
  }

  return null
}
