import type { AppRoute } from '../domain/types'
import type { SemanticSalesInterpretation } from './realtalent-sales-language'
import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'

// legacy audit marker: const AGENT_URL = 'http://127.0.0.1:8791'
const AGENT_URL = env.agentGatewayUrl

export interface SemanticLanguageContext {
  currentRoute?: AppRoute | null
  focusLeadId?: string | null
  focusProposalId?: string | null
  previousLeadIds?: string[]
  now?: Date
  conversationContext?: string
}

export interface SemanticLanguageResult {
  interpretation: SemanticSalesInterpretation
  decision: 'execute' | 'clarify' | 'fallback'
  provider: string
  model: string
}

export async function interpretSalesLanguage(prompt: string, context: SemanticLanguageContext = {}): Promise<SemanticLanguageResult | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 28_000)
  try {
    const response = await runtimeFetch(`${AGENT_URL}/language/interpret`, {
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
        },
      }),
    })
    if (!response.ok) return null
    const payload = await response.json() as { ok?: boolean; interpretation?: SemanticSalesInterpretation; decision?: SemanticLanguageResult['decision']; provider?: string; model?: string }
    if (!payload.ok || !payload.interpretation || !payload.decision) return null
    return { interpretation: payload.interpretation, decision: payload.decision, provider: payload.provider ?? 'runtime', model: payload.model ?? 'semantic-language' }
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}
