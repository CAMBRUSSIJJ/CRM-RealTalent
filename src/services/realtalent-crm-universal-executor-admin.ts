import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import type { CrmCapabilityExecutionRuntime, CrmCapabilityStepResult } from './realtalent-crm-capability-executor'
import { targetQuery, uarg, ubest } from './realtalent-crm-universal-executor-helpers'

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

  if (step.capabilityId === 'calls.recording_url') {
    const call = ubest(snapshot.calls, targetQuery(step), (item) => [item.id, item.notes, item.outcome, item.startedAt])
    if (!call) throw new Error('Não encontrei a ligação.')
    const url = await actions.resolveCallRecordingUrl(call.id)
    return { ok: true, summary: url ? `Gravação disponível: ${url}` : 'Esta ligação não possui gravação disponível.' }
  }

  return null
}
