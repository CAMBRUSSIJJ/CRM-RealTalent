import type { AppRoute } from '../domain/types'
import { crmCapabilityById, crmCapabilityCatalogForModel, type CrmCapabilityRisk } from './realtalent-crm-capabilities'
import { crmCapabilitySlotRulesForModel } from './realtalent-crm-slot-filling'
import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'

// legacy audit marker: const AGENT_URL = 'http://127.0.0.1:8791'
const AGENT_URL = env.agentGatewayUrl

export interface CrmCapabilityArgument {
  name: string
  value: string
}

export interface CrmCapabilityPlanStep {
  id: string
  capabilityId: string
  title: string
  reason: string
  risk: CrmCapabilityRisk
  args: CrmCapabilityArgument[]
}

export interface CrmCapabilityPlan {
  version: string
  goal: string
  confidence: number
  needsClarification: boolean
  clarification: string
  pendingCapabilityId: string
  missingSlots: string[]
  knownArgs: CrmCapabilityArgument[]
  steps: CrmCapabilityPlanStep[]
}

export interface CrmCapabilityPlanningContext {
  currentRoute?: AppRoute | null
  focusLeadId?: string | null
  focusProposalId?: string | null
  previousLeadIds?: string[]
  now?: Date
  conversationContext?: string
  pendingCapability?: {
    capabilityId: string
    capabilityTitle?: string
    originalRequest?: string
    knownArgs?: CrmCapabilityArgument[]
    missingSlots?: string[]
    clarification?: string
  } | null
}

export interface CrmCapabilityPlanningResult {
  plan: CrmCapabilityPlan
  decision: 'execute' | 'clarify' | 'fallback'
  provider: string
  model: string
}

export const capabilityArg = (step: CrmCapabilityPlanStep, name: string) => step.args.find((item) => item.name === name)?.value.trim() ?? ''
export const capabilityArgs = (step: CrmCapabilityPlanStep, name: string) => step.args.filter((item) => item.name === name).map((item) => item.value.trim()).filter(Boolean)

const normalizePlan = (value: CrmCapabilityPlan): CrmCapabilityPlan => {
  const steps = Array.isArray(value.steps) ? value.steps.flatMap((step, index) => {
    const definition = crmCapabilityById(step.capabilityId)
    if (!definition || definition.execution !== 'native') return []
    const args = Array.isArray(step.args)
      ? step.args.filter((item) => item && typeof item.name === 'string' && typeof item.value === 'string').slice(0, 24).map((item) => ({ name: item.name.trim().slice(0, 80), value: item.value.trim().slice(0, 1200) }))
      : []
    return [{
      id: typeof step.id === 'string' && step.id.trim() ? step.id.trim().slice(0, 100) : `capability-step-${index + 1}`,
      capabilityId: definition.id,
      title: typeof step.title === 'string' && step.title.trim() ? step.title.trim().slice(0, 180) : definition.title,
      reason: typeof step.reason === 'string' ? step.reason.trim().slice(0, 400) : '',
      risk: definition.risk,
      args,
    } satisfies CrmCapabilityPlanStep]
  }) : []
  return {
    version: '3.4',
    goal: typeof value.goal === 'string' ? value.goal.trim().slice(0, 500) : '',
    confidence: Number.isFinite(Number(value.confidence)) ? Math.max(0, Math.min(1, Number(value.confidence))) : 0,
    needsClarification: Boolean(value.needsClarification),
    clarification: typeof value.clarification === 'string' ? value.clarification.trim().slice(0, 400) : '',
    pendingCapabilityId: typeof value.pendingCapabilityId === 'string' ? value.pendingCapabilityId.trim().slice(0, 160) : '',
    missingSlots: Array.isArray(value.missingSlots) ? value.missingSlots.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim().slice(0, 80)).slice(0, 12) : [],
    knownArgs: Array.isArray(value.knownArgs) ? value.knownArgs.filter((item) => item && typeof item.name === 'string' && typeof item.value === 'string').map((item) => ({ name: item.name.trim().slice(0, 80), value: item.value.trim().slice(0, 1200) })).slice(0, 24) : [],
    steps: steps.slice(0, 8),
  }
}


const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const relativeDateArg = (text: string, now = new Date()) => {
  const explicitBr = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/)
  if (explicitBr) {
    const day = Number(explicitBr[1]); const month = Number(explicitBr[2]); const year = Number(explicitBr[3])
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0)
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) return dateKey(parsed)
  }
  const explicitIso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (explicitIso) {
    const year = Number(explicitIso[1]); const month = Number(explicitIso[2]); const day = Number(explicitIso[3])
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0)
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) return dateKey(parsed)
  }
  const base = new Date(now); base.setHours(12, 0, 0, 0)
  if (/\bamanha\b/.test(text)) { base.setDate(base.getDate() + 1); return dateKey(base) }
  if (/\bhoje\b/.test(text)) return dateKey(base)
  const weekdays: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }
  for (const [name, day] of Object.entries(weekdays)) if (new RegExp(`\\b${name}(?: feira)?\\b`).test(text)) {
    let delta = (day - base.getDay() + 7) % 7; if (delta === 0) delta = 7
    base.setDate(base.getDate() + delta); return dateKey(base)
  }
  return ''
}
const goalMetricFromText = (text: string) => {
  if (/\b(ligacoes|ligacao|calls?)\b/.test(text)) return 'calls'
  if (/\b(follow ?ups?|retornos?)\b/.test(text)) return 'followups'
  if (/\b(reunioes|reuniao|meetings?)\b/.test(text)) return 'meetings'
  if (/\b(propostas?|proposals?)\b/.test(text)) return 'proposals'
  if (/\b(vendas?|ganhos?|wins?)\b/.test(text)) return 'wins'
  if (/\b(receita|faturamento|revenue)\b/.test(text)) return 'revenue'
  if (/\b(novos? leads?|novos? contatos?|new leads?)\b/.test(text)) return 'new_leads'
  if (/\b(contatos?|contacts?)\b/.test(text)) return 'contacts'
  return ''
}

export const localCapabilityFallback = (prompt: string, context: CrmCapabilityPlanningContext): CrmCapabilityPlanningResult | null => {
  const text = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s,.-]/g, ' ').replace(/\s+/g, ' ').trim()
  const make = (capabilityId: string, goal: string, args: CrmCapabilityArgument[] = []): CrmCapabilityPlanningResult | null => {
    const definition = crmCapabilityById(capabilityId); if (!definition) return null
    return { provider: 'local-resilience', model: 'capability-fallback-v3.4', decision: 'execute', plan: { version: '3.4', goal, confidence: 0.96, needsClarification: false, clarification: '', pendingCapabilityId: '', missingSlots: [], knownArgs: [], steps: [{ id: `local:${capabilityId}`, capabilityId, title: definition.title, reason: 'Fallback local de resiliência para uma ação operacional inequívoca.', risk: definition.risk, args }] } }
  }
  const clarify = (capabilityId: string, goal: string, question: string, missingSlots: string[], args: CrmCapabilityArgument[] = []): CrmCapabilityPlanningResult | null => {
    const definition = crmCapabilityById(capabilityId); if (!definition) return null
    return { provider: 'local-resilience', model: 'capability-fallback-v3.4', decision: 'clarify', plan: { version: '3.4', goal, confidence: 0.94, needsClarification: true, clarification: question, pendingCapabilityId: capabilityId, missingSlots, knownArgs: args, steps: [{ id: `local:${capabilityId}`, capabilityId, title: definition.title, reason: 'A intenção está clara, mas falta um dado obrigatório para executar com segurança.', risk: definition.risk, args }] } }
  }

  const goalVerb = /\b(cri|coloc|defin|estabelec|quero|bota|faz)\w*/.test(text)
  const mentionsGoal = /\b(metas?|objetivos?|alvos?)\b/.test(text)
  const hasGoalMetric = Boolean(goalMetricFromText(text))
  const hasGoalNumber = /\b\d+(?:[.,]\d+)?\b/.test(text)
  const looksLikeReadQuestion = /\b(qual|quais|quanto|quantas|como|onde|quem|por que|porque|mostre|mostrar|ver|veja|consulte|consultar)\b/.test(text)
  const declarativeGoal = mentionsGoal && hasGoalMetric && hasGoalNumber && !looksLikeReadQuestion
  const implicitGoalOnGoalsPage = context.currentRoute === 'goals' && goalVerb && hasGoalMetric && hasGoalNumber
  const goalIntent = (mentionsGoal && goalVerb) || declarativeGoal || implicitGoalOnGoalsPage
  if (goalIntent) {
    const metric = goalMetricFromText(text)
    const target = text.match(/(?:meta|objetivo|alvo)(?:\s+de)?\s+(?:r\$\s*)?(\d+(?:[.,]\d+)?)/)?.[1]
      || text.match(/\b(\d+(?:[.,]\d+)?)\s+(?:metas?\b|ligacoes|ligacao|calls?|follow ?ups?|retornos?|reunioes|reuniao|propostas?|vendas?|contatos?)/)?.[1]
      || ''
    const day = relativeDateArg(text, context.now ?? new Date())
    const args: CrmCapabilityArgument[] = [{ name: 'scope', value: 'user' }]
    if (metric) args.push({ name: 'metric', value: metric })
    if (target) args.push({ name: 'target_value', value: target.replace(',', '.') })
    if (day) { args.push({ name: 'period_start', value: day }, { name: 'period_end', value: day }) }
    if (!metric && target) return clarify('goals.create', `Criar meta comercial com objetivo ${target}${day ? ` para ${day}` : ''}`, 'Qual tipo de meta você quer criar? Ligações, contatos, follow-ups, reuniões, propostas, vendas, receita, novos leads ou outra métrica?', ['metric'], args)
    if (metric && !target) return clarify('goals.create', `Criar meta de ${metric}${day ? ` para ${day}` : ''}`, 'Qual é o valor ou quantidade dessa meta?', ['target_value'], args)
    if (metric && target) return make('goals.create', `Criar meta comercial de ${target} ${metric}${day ? ` para ${day}` : ''}`, args)
  }

  const prospectingSearchIntent = /\b(garimp|prospect|encontr|buscar|busque|procure|achar)\w*/.test(text) && /\b(empresas?|negocios?|clinicas?|barbearias?|restaurantes?|academias?|lojas?|escritorios?)\b/.test(text)
  if (prospectingSearchIntent) {
    const quantity = text.match(/\b(\d{1,3})\s+(?:empresas?|negocios?|clinicas?|barbearias?|restaurantes?|academias?|lojas?|escritorios?)\b/)?.[1] || '20'
    let segment = ''
    const explicit = text.match(/(?:empresas?\s+de|negocios?\s+de|encontre|buscar|busque|procure|achar)\s+(?:ate\s+)?(?:\d{1,3}\s+)?(.+?)(?:\s+em\s+|\s+na\s+cidade\s+de\s+|\s+no\s+municipio\s+de\s+|$)/)?.[1] || ''
    segment = explicit.replace(/^(empresas?|negocios?)\s+(?:de\s+)?/, '').trim()
    const city = text.match(/(?:\s+em|cidade de|municipio de)\s+([a-z0-9 .'-]+?)(?=\s+(?:com|que|sem|usando|num|em um raio|raio|ate)\b|$)/)?.[1]?.trim() || ''
    if (segment && city) return make('prospecting.search', `Garimpar ${quantity} empresa(s) de ${segment} em ${city}`, [
      { name: 'segment', value: segment }, { name: 'city', value: city }, { name: 'quantity', value: quantity }, { name: 'search_mode', value: 'coverage' }, { name: 'category_mode', value: 'exact' },
    ])
  }
  if (/\b(icp|cliente ideal|perfil de cliente ideal)\b/.test(text)) return make('prospecting.build_icp', 'Analisar o perfil de cliente ideal do CRM')
  if (/\b(garimpo|prospectos?|empresas?)\b/.test(text) && /\b(melhores|prioriz|ranking|ranque|score|mais potencial)\w*/.test(text)) return make('prospecting.rank', 'Priorizar as melhores empresas do Garimpo', [{ name: 'limit', value: '10' }])
  const mentionsNotifications = /(notific|notification|\bavisos?\b|campainha)/.test(text)
  if (mentionsNotifications && /\b(restaur|volt|trazer de volta|reexib|mostrar novamente)/.test(text)) return make('notifications.restore_all', 'Restaurar as notificações ocultadas')
  if (mentionsNotifications && /\b(limp|zer|tir|sum|ocult|remov)/.test(text)) return make('notifications.dismiss_all', 'Limpar as notificações visíveis')
  if (/^(desfaz|desfaca|undo|volta a ultima|voltar a ultima)/.test(text)) return make('agent.undo_last', 'Desfazer a última ação da Agent')
  const routes: Array<[RegExp, AppRoute]> = [[/\bagenda\b/,'agenda'],[/\btarefas?\b/,'tasks'],[/\bpipeline\b/,'pipeline'],[/\bcontatos?\b/,'leads'],[/\bpropostas?\b/,'proposals'],[/\bligacoes?\b/,'calls'],[/\bcomunicac/,'communications'],[/\bgarimpo\b/,'prospecting'],[/\bmetas?\b/,'goals'],[/\bequipes?\b/,'teams'],[/\bconfigurac/,'settings']]
  if (/\b(abrir|abra|ir para|me leva|mostrar tela|va para|vai para)\b/.test(text)) {
    const route = routes.find(([pattern]) => pattern.test(text))?.[1]
    if (route) return make('navigation.open', `Abrir ${route}`, [{ name: 'route', value: route }])
  }
  return null
}

export async function planCrmCapabilities(prompt: string, context: CrmCapabilityPlanningContext = {}): Promise<CrmCapabilityPlanningResult | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15_000)
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
    if (!response.ok) return localCapabilityFallback(prompt, context)
    const payload = await response.json() as { ok?: boolean; plan?: CrmCapabilityPlan; decision?: CrmCapabilityPlanningResult['decision']; provider?: string; model?: string }
    if (!payload.ok || !payload.plan || !payload.decision) return null
    return {
      plan: normalizePlan(payload.plan),
      decision: payload.decision,
      provider: payload.provider ?? 'runtime',
      model: payload.model ?? 'crm-capability-planner',
    }
  } catch {
    return localCapabilityFallback(prompt, context)
  } finally {
    window.clearTimeout(timer)
  }
}
