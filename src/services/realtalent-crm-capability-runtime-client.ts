import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'
import { universalCrmCapabilityById as crmCapabilityById, universalCrmCapabilityCatalogForModel as crmCapabilityCatalogForModel } from './realtalent-crm-universal-registry'
import { crmCapabilitySlotRulesForModel } from './realtalent-crm-universal-slot-filling'
import type {
  CrmCapabilityArgument,
  CrmCapabilityPlan,
  CrmCapabilityPlanStep,
  CrmCapabilityPlanningContext,
  CrmCapabilityPlanningResult,
} from './realtalent-crm-capability-planner'

const AGENT_URL = env.agentGatewayUrl
const CAPABILITY_TIMEOUT_MS = 120_000

const cleanText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)

const allowedArgumentNames = (capabilityId: string) => {
  const definition = crmCapabilityById(capabilityId)
  const names = new Set<string>(definition?.argumentHints ?? [])
  for (const rule of crmCapabilitySlotRulesForModel(capabilityId)) {
    for (const accepted of rule.accepts) names.add(accepted)
  }
  return names
}

const sanitizeArgs = (capabilityId: string, value: unknown): CrmCapabilityArgument[] => {
  const allowed = allowedArgumentNames(capabilityId)
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const name = cleanText((item as { name?: unknown })?.name, 80)
    const argValue = cleanText((item as { value?: unknown })?.value, 1200)
    if (!name || !argValue || !allowed.has(name)) return []
    return [{ name, value: argValue }]
  }).slice(0, 24)
}

const normalizePlan = (value: unknown): CrmCapabilityPlan => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : []
  const steps: CrmCapabilityPlanStep[] = rawSteps.flatMap((entry, index) => {
    const step = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const capabilityId = cleanText(step.capabilityId, 160)
    const definition = crmCapabilityById(capabilityId)
    if (!definition || definition.execution !== 'native') return []
    return [{
      id: cleanText(step.id, 100) || `capability-step-${index + 1}`,
      capabilityId: definition.id,
      title: cleanText(step.title, 180) || definition.title,
      reason: cleanText(step.reason, 400),
      risk: definition.risk,
      args: sanitizeArgs(definition.id, step.args),
    }]
  }).slice(0, 8)

  const confidence = Number(raw.confidence)
  const pendingCapabilityId = cleanText(raw.pendingCapabilityId, 160)
  const pendingId = crmCapabilityById(pendingCapabilityId)?.id || steps[0]?.capabilityId || ''
  const knownArgs = pendingId ? sanitizeArgs(pendingId, raw.knownArgs) : []

  return {
    version: '3.7',
    goal: cleanText(raw.goal, 500),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    needsClarification: Boolean(raw.needsClarification),
    clarification: cleanText(raw.clarification, 400),
    pendingCapabilityId,
    missingSlots: Array.isArray(raw.missingSlots)
      ? raw.missingSlots.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 12)
      : [],
    knownArgs,
    steps,
  }
}

export async function planCrmCapabilitiesViaAgent(
  prompt: string,
  context: CrmCapabilityPlanningContext = {},
): Promise<CrmCapabilityPlanningResult | null> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), CAPABILITY_TIMEOUT_MS)
  try {
    const response = await runtimeFetch(`${AGENT_URL}/capabilities/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        context: {
          currentRoute: context.currentRoute ?? null,
          focusLeadId: context.focusLeadId ?? null,
          focusProposalId: context.focusProposalId ?? null,
          previousLeadIds: context.previousLeadIds?.slice(0, 8) ?? [],
          now: (context.now ?? new Date()).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
          conversation_context: context.conversationContext ?? '',
          pending_capability: context.pendingCapability ?? null,
        },
        capabilities: crmCapabilityCatalogForModel().map((capability) => ({
          ...capability,
          requiredSlots: crmCapabilitySlotRulesForModel(capability.id),
        })),
      }),
    })
    if (!response.ok) return null
    const payload = await response.json() as {
      ok?: boolean
      plan?: unknown
      decision?: CrmCapabilityPlanningResult['decision']
      provider?: string
      model?: string
    }
    if (!payload.ok || !payload.plan || !payload.decision) return null
    return {
      plan: normalizePlan(payload.plan),
      decision: payload.decision,
      provider: payload.provider ?? 'ollama',
      model: payload.model ?? 'crm-capability-planner',
    }
  } catch {
    return null
  } finally {
    globalThis.clearTimeout(timer)
  }
}
