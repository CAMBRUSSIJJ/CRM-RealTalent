import type { WorkspaceSnapshot } from '../domain/types'
import { appendRealTalentAiAudit } from './realtalent-ai-audit'
import { buildRealTalentAiContext, type RealTalentAiContextEnvelope } from './realtalent-ai-context'
import { hybridRealTalentAssistantProvider } from './realtalent-assistant-provider'
import type { AssistantAnswer, AssistantContext } from './realtalent-assistant'

export interface RealTalentAiGatewayResult {
  answer: AssistantAnswer
  context: RealTalentAiContextEnvelope
  trace: {
    providerId: string
    mode: 'local-orchestration' | 'openai-planning'
    sendsDataExternally: boolean
    durationMs: number
    writeAuthority: false
  }
}

const toolsForAnswer = (answer: AssistantAnswer) => {
  if (answer.plan?.kind === 'crm_capabilities') return [...new Set(answer.plan.steps.map((step) => step.capabilityId))]
  if (answer.plan?.kind === 'move_opportunity') return ['read_pipeline', 'move_opportunity']
  if (answer.plan?.kind === 'create_task') return ['read_pipeline', 'create_task']
  if (answer.plan?.kind === 'complete_task') return ['read_tasks', 'complete_task']
  if (answer.plan?.kind === 'update_lead_profile') return ['read_pipeline', 'update_lead_profile']
  if (answer.plan?.kind === 'create_goal') return ['read_goals', 'create_goal']
  if (answer.plan?.kind === 'create_proposal') return ['read_pipeline', 'read_catalog', 'create_proposal']
  if (answer.intent === 'create_followups') return ['read_pipeline', 'create_followup']
  if (answer.intent === 'best_contacts') return ['read_contacts', 'lead_scoring']
  if (answer.intent === 'prepare_call') return ['read_pipeline', 'read_history', 'read_account', 'prepare_call']
  if (answer.intent === 'suggest_message') return ['read_history', 'draft_message']
  if (answer.intent === 'forecast') return ['read_forecast']
  if (answer.intent === 'meeting_summary' || answer.intent === 'activity_summary') return ['read_history']
  return ['read_pipeline']
}

export const realTalentAiGateway = {
  id: 'realtalent-ai-gateway-v2-agent',
  async answer(prompt: string, snapshot: WorkspaceSnapshot, assistantContext: AssistantContext = {}): Promise<RealTalentAiGatewayResult> {
    const started = Date.now()
    const context = buildRealTalentAiContext(snapshot, assistantContext)
    try {
      const providerResult = await hybridRealTalentAssistantProvider.answer(prompt, snapshot, assistantContext)
      const answer = providerResult.answer
      const durationMs = Math.max(0, Date.now() - started)
      appendRealTalentAiAudit({
        id: `ai:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: snapshot.workspace.id,
        providerId: providerResult.providerId,
        intent: answer.intent,
        focusLeadId: context.focusLeadId,
        route: context.route,
        toolIds: toolsForAnswer(answer),
        outcome: 'success',
        durationMs,
        generatedAt: new Date().toISOString(),
      })
      return { answer, context, trace: { providerId: providerResult.providerId, mode: providerResult.mode, sendsDataExternally: providerResult.sendsDataExternally, durationMs, writeAuthority: false } }
    } catch (error) {
      const durationMs = Math.max(0, Date.now() - started)
      appendRealTalentAiAudit({ id: `ai:${Date.now()}:error`, workspaceId: snapshot.workspace.id, providerId: hybridRealTalentAssistantProvider.id, intent: 'error', focusLeadId: context.focusLeadId, route: context.route, toolIds: [], outcome: 'error', durationMs, generatedAt: new Date().toISOString(), note: error instanceof Error ? error.message.slice(0, 180) : 'Falha desconhecida' })
      throw error
    }
  },
}
