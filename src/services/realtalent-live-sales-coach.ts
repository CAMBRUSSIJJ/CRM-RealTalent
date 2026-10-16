import type { CallOutcome, CallRecord, Lead, WorkspaceSnapshot } from '../domain/types'
import type { AssistantAnswer, AssistantContext } from './realtalent-assistant'
import { analyzeLiveConversation, type LiveConversationSignal, type LiveSignalId } from './calling-intelligence-workspace'
import { callSessionStorageKey, storedCallSessionMatchesScope } from './call-session-storage-v10151'
import { buildSalesCoachingPlan } from './realtalent-sales-coaching'
import { buildSalesAgentContext } from './realtalent-sales-intelligence-agent'

export type LiveSalesCoachPhase = 'during' | 'after'

export interface ActiveLiveCallSession {
  leadId: string
  session: string
  transcript: string
  notes: string
  outcome: CallOutcome | null
  startedAt: string | null
}

export interface LiveSalesCoachInput {
  lead: Lead
  snapshot: WorkspaceSnapshot
  phase: LiveSalesCoachPhase
  call?: CallRecord | null
  transcript?: string
  notes?: string
  outcome?: CallOutcome | null
  now?: Date
}

export interface LiveSalesCoachSignal {
  source: 'transcript' | 'notes' | 'outcome'
  kind: LiveSignalId | 'callback' | 'meeting' | 'proposal_request' | 'wrong_person' | 'no_interest' | 'sale'
  label: string
  evidence: string
  confidence: 'explicit' | 'structured'
}

export interface LiveSalesCoachRecommendation {
  kind: 'ask' | 'clarify' | 'advance' | 'schedule' | 'map_stakeholder' | 'proposal' | 'close' | 'review'
  title: string
  reason: string
  suggestedQuestion: string
  suggestedCapabilityId: string | null
}

export interface LiveSalesCoachResult {
  leadId: string
  phase: LiveSalesCoachPhase
  callId: string | null
  signals: LiveSalesCoachSignal[]
  recommendation: LiveSalesCoachRecommendation
  deal: { healthScore: number; realTalentProbability: number; nextBestAction: string }
  postCall: { persistedByCallOutcome: string[]; suggestedUpdates: string[]; requiresUserAction: boolean }
  grounding: string
  generatedAt: string
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9@.+\-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const compact = (value: string, max = 220) => value.replace(/\s+/g, ' ').trim().slice(0, max)
const recentText = (value: string, max: number) => {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(-max) : clean
}

export const readActiveLiveCallSession = (workspaceId: string, userId: string | null | undefined): ActiveLiveCallSession | null => {
  try {
    const storage = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
    if (!storage) return null
    const raw = storage.getItem(callSessionStorageKey(workspaceId, userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!storedCallSessionMatchesScope(parsed, workspaceId, userId)) return null
    const leadId = typeof parsed.leadId === 'string' ? parsed.leadId : ''
    const session = typeof parsed.session === 'string' ? parsed.session : 'idle'
    if (!leadId || session === 'idle' || session === 'finished') return null
    return {
      leadId,
      session,
      transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '',
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      outcome: typeof parsed.outcome === 'string' ? parsed.outcome as CallOutcome : null,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
    }
  } catch {
    return null
  }
}

export const resolveLiveSalesCoachCall = (lead: Lead, snapshot: WorkspaceSnapshot, phase: LiveSalesCoachPhase) => {
  const rows = snapshot.calls.filter((call) => call.leadId === lead.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  if (phase === 'during') return rows.find((call) => !call.endedAt) ?? rows[0] ?? null
  return rows[0] ?? null
}

const textSignals = (text: string, source: 'transcript' | 'notes'): LiveSalesCoachSignal[] => analyzeLiveConversation(text).map((signal: LiveConversationSignal) => ({
  source,
  kind: signal.id,
  label: signal.label,
  evidence: compact(signal.excerpt),
  confidence: 'explicit',
}))

const outcomeSignal = (outcome: CallOutcome | null | undefined): LiveSalesCoachSignal | null => {
  if (!outcome) return null
  const rows: Partial<Record<CallOutcome, Omit<LiveSalesCoachSignal, 'source' | 'confidence'>>> = {
    callback_requested: { kind: 'callback', label: 'Retorno solicitado', evidence: 'O resultado estruturado da ligação registra pedido de retorno.' },
    meeting_scheduled: { kind: 'meeting', label: 'Reunião agendada', evidence: 'O resultado estruturado da ligação registra reunião agendada.' },
    proposal_requested: { kind: 'proposal_request', label: 'Proposta solicitada', evidence: 'O resultado estruturado da ligação registra solicitação de proposta.' },
    proposal_sent: { kind: 'proposal_request', label: 'Proposta enviada', evidence: 'O resultado estruturado da ligação registra proposta enviada.' },
    wrong_person: { kind: 'wrong_person', label: 'Contato incorreto', evidence: 'O resultado estruturado indica que a pessoa contatada não é o interlocutor adequado.' },
    not_interested: { kind: 'no_interest', label: 'Sem interesse', evidence: 'O resultado estruturado registra falta de interesse.' },
    sale_completed: { kind: 'sale', label: 'Venda concluída', evidence: 'O resultado estruturado registra venda concluída.' },
  }
  const row = rows[outcome]
  return row ? { source: 'outcome', confidence: 'structured', ...row } as LiveSalesCoachSignal : null
}

const persistedEffects = (outcome: CallOutcome | null | undefined, call: CallRecord | null) => {
  if (!outcome || !call) return [] as string[]
  if (outcome === 'sale_completed') return ['O fluxo comercial da ligação pode marcar a oportunidade como ganha quando esse desfecho foi salvo por registerCallOutcome.']
  if (outcome === 'not_interested') return ['O fluxo comercial da ligação pode marcar a oportunidade como perdida quando esse desfecho foi salvo por registerCallOutcome.']
  if (['no_answer','busy','voicemail','callback_requested','interested','meeting_scheduled','proposal_requested','proposal_sent','wrong_person'].includes(outcome)) {
    return ['O fluxo comercial exige próximo passo ao salvar esse desfecho; não crie outro compromisso sem verificar o registro existente.']
  }
  return ['A ligação foi registrada no histórico comercial; qualquer nova mutação deve ser confirmada separadamente.']
}

const strongest = (signals: LiveSalesCoachSignal[]) => {
  const rank: LiveSalesCoachSignal['kind'][] = ['sale','proposal_request','meeting','callback','wrong_person','no_interest','price','budget','objection','competitor','decision_maker','timing','next_step','interest','pain','impact','existing_solution']
  const score = (kind: LiveSalesCoachSignal['kind']) => { const i = rank.indexOf(kind); return i < 0 ? 999 : i }
  return [...signals].sort((a, b) => score(a.kind) - score(b.kind))[0] ?? null
}

const recommend = (phase: LiveSalesCoachPhase, signals: LiveSalesCoachSignal[], fallbackQuestion: string, nba: string): LiveSalesCoachRecommendation => {
  const signal = strongest(signals)
  if (signal?.kind === 'sale') return { kind: 'close', title: 'Confirmar fechamento e próximos passos', reason: signal.evidence, suggestedQuestion: 'Antes de encerrar, podemos confirmar responsáveis, início e próximos marcos?', suggestedCapabilityId: null }
  if (signal?.kind === 'proposal_request') return { kind: 'proposal', title: 'Validar critérios antes da proposta', reason: signal.evidence, suggestedQuestion: 'Antes de eu formalizar, quais escopo, critérios de decisão e pessoas precisam estar refletidos na proposta?', suggestedCapabilityId: 'proposals.create' }
  if (signal?.kind === 'meeting') return { kind: 'schedule', title: 'Consolidar a reunião', reason: signal.evidence, suggestedQuestion: 'Quem precisa participar e qual resultado precisamos obter nessa reunião?', suggestedCapabilityId: 'calendar.create' }
  if (signal?.kind === 'callback') return { kind: 'schedule', title: 'Confirmar retorno', reason: signal.evidence, suggestedQuestion: 'Qual dia e horário são melhores para retomarmos com contexto suficiente para decidir o próximo passo?', suggestedCapabilityId: 'activities.create_followup' }
  if (signal?.kind === 'wrong_person' || signal?.kind === 'decision_maker') return { kind: 'map_stakeholder', title: 'Mapear quem decide', reason: signal.evidence, suggestedQuestion: 'Quem participa da decisão e quem dá a aprovação final?', suggestedCapabilityId: null }
  if (signal?.kind === 'no_interest') return { kind: 'clarify', title: 'Entender a causa antes de insistir', reason: signal.evidence, suggestedQuestion: 'O que especificamente faz este tema não ser prioridade agora?', suggestedCapabilityId: null }
  if (signal?.kind === 'price' || signal?.kind === 'budget') return { kind: 'clarify', title: 'Diagnosticar o critério financeiro', reason: signal.evidence, suggestedQuestion: 'Quando você fala de valor, qual critério está usando para avaliar se o investimento faz sentido?', suggestedCapabilityId: null }
  if (signal?.kind === 'competitor') return { kind: 'clarify', title: 'Entender o critério de comparação', reason: signal.evidence, suggestedQuestion: 'Quais critérios são mais importantes nessa comparação e onde a alternativa atual atende ou deixa lacunas?', suggestedCapabilityId: null }
  if (signal?.kind === 'objection') return { kind: 'clarify', title: 'Explorar a objeção antes de responder', reason: signal.evidence, suggestedQuestion: 'O que está por trás dessa preocupação e o que precisaria ser verdade para você se sentir confortável em avançar?', suggestedCapabilityId: null }
  if (signal?.kind === 'timing' || signal?.kind === 'next_step') return { kind: 'advance', title: 'Transformar timing em compromisso', reason: signal.evidence, suggestedQuestion: 'Qual é o próximo compromisso concreto, quem fica responsável e em que data?', suggestedCapabilityId: 'activities.create_followup' }
  if (signal?.kind === 'interest') return { kind: 'advance', title: 'Converter interesse em próximo passo', reason: signal.evidence, suggestedQuestion: 'Qual é o passo mais lógico agora para avançarmos sem perder esse contexto?', suggestedCapabilityId: null }
  return { kind: phase === 'during' ? 'ask' : 'review', title: phase === 'during' ? 'Continuar descoberta com uma pergunta grounded' : `Revisar a ligação e ${nba.toLowerCase()}`, reason: 'Não há sinal explícito suficiente para inferir uma objeção ou compromisso novo.', suggestedQuestion: fallbackQuestion, suggestedCapabilityId: null }
}

export const buildLiveSalesCoach = (input: LiveSalesCoachInput): LiveSalesCoachResult => {
  const now = input.now ?? new Date()
  const call = input.call ?? resolveLiveSalesCoachCall(input.lead, input.snapshot, input.phase)
  const transcript = recentText(input.transcript ?? call?.transcript ?? '', 12000)
  const notes = recentText(input.notes ?? call?.notes ?? '', 6000)
  const outcome = input.outcome ?? call?.outcome ?? null
  const structured = outcomeSignal(outcome)
  const signals = [...(structured ? [structured] : []), ...textSignals(transcript, 'transcript'), ...textSignals(notes, 'notes')]
    .filter((item, index, rows) => rows.findIndex((candidate) => candidate.kind === item.kind && candidate.evidence === item.evidence) === index)
    .slice(0, 12)
  const coaching = buildSalesCoachingPlan(input.lead, input.snapshot, 'ligação', now)
  const sales = buildSalesAgentContext(input.lead, input.snapshot, now)
  const recommendation = recommend(input.phase, signals, coaching.questions[0] ?? 'Qual é o próximo passo concreto e quem precisa participar da decisão?', sales.nextBestAction.title)
  const persistedByCallOutcome = persistedEffects(outcome, call)
  const suggestedUpdates = input.phase === 'after'
    ? [
        ...(recommendation.suggestedCapabilityId ? [`Próxima ação candidata: ${recommendation.title}. Execute somente após confirmar que o fluxo da ligação ainda não criou esse compromisso.`] : []),
        ...(!signals.length ? ['Não há evidência explícita suficiente para criar objeção, stakeholder, proposta ou compromisso automaticamente.'] : []),
      ]
    : []
  return {
    leadId: input.lead.id,
    phase: input.phase,
    callId: call?.id ?? null,
    signals,
    recommendation,
    deal: { healthScore: sales.health.score, realTalentProbability: sales.health.realTalentProbability, nextBestAction: sales.nextBestAction.title },
    postCall: { persistedByCallOutcome, suggestedUpdates, requiresUserAction: suggestedUpdates.length > 0 },
    grounding: 'Somente resultado estruturado, transcrição/notas disponíveis e sinais atuais do CRM são considerados. Texto livre não marca negócio como ganho/perdido, não cria proposta, contato, reunião ou follow-up e não inventa objeções, datas, pessoas ou compromissos.',
    generatedAt: now.toISOString(),
  }
}

const list = (rows: string[], empty: string) => rows.length ? rows.map((row, index) => `${index + 1}. ${row}`).join('\n') : empty

export const formatLiveSalesCoach = (input: LiveSalesCoachInput) => {
  const result = buildLiveSalesCoach(input)
  return [
    `Live Sales Coach · ${result.phase === 'during' ? 'durante a ligação' : 'pós-ligação'} · ${input.lead.company || input.lead.name}.`,
    `Próximo movimento: ${result.recommendation.title}.`,
    `Por quê: ${result.recommendation.reason}`,
    `Pergunta sugerida: ${result.recommendation.suggestedQuestion}`,
    `Sinais explícitos:\n${list(result.signals.map((signal) => `${signal.label} [${signal.source}] — ${signal.evidence}`), 'Nenhum sinal explícito detectado ainda.')}`,
    `Contexto comercial: Deal Health ${result.deal.healthScore}/100; probabilidade RealTalent ${result.deal.realTalentProbability}%; NBA ${result.deal.nextBestAction}.`,
    ...(result.phase === 'after' ? [`Já tratado pelo fluxo da ligação:\n${list(result.postCall.persistedByCallOutcome, 'Nenhuma mutação automática adicional identificada.')}`, `Sugestões pós-ligação:\n${list(result.postCall.suggestedUpdates, 'Nenhuma atualização adicional deve ser criada sem nova evidência.')}`] : []),
    `Base de verdade: ${result.grounding}`,
  ].join('\n')
}

export const liveSalesCoachPhaseForPrompt = (prompt: string): LiveSalesCoachPhase | null => {
  const text = normalize(prompt)
  if (/\b(analise|revis|resum|depois|apos|pos)\w*.*\b(ultima |essa |a )?ligacao\b|\b(ultima|essa) ligacao\b.*\b(analise|revis|resultado|aprend|proximo passo|o que faco)\b/.test(text)) return 'after'
  if (/\b(o que digo agora|o que falo agora|qual pergunta faco agora|qual a proxima pergunta|me ajude nessa ligacao|coach (?:ao vivo|dessa ligacao)|durante a ligacao|nessa ligacao agora|como respondo essa objecao|sinal detectado nessa ligacao)\b/.test(text)) return 'during'
  return null
}

const visibleLeadIds = (snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  if (snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin') return new Set(snapshot.leads.map((lead) => lead.id))
  if (!context.currentUserId) return new Set<string>()
  return new Set(snapshot.leads.filter((lead) => lead.ownerId === context.currentUserId).map((lead) => lead.id))
}

const bestVisibleLead = (prompt: string, snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  const ids = visibleLeadIds(snapshot, context)
  const visible = snapshot.leads.filter((lead) => ids.has(lead.id))
  const text = normalize(prompt)
  let best: { lead: Lead; score: number } | null = null
  for (const lead of visible) {
    const fields = [lead.id, lead.name, lead.company, lead.email, lead.phone].filter(Boolean).map((value) => normalize(String(value))).filter((value) => value.length >= 3)
    let score = 0
    for (const field of fields) {
      if (text.includes(field)) score = Math.max(score, 100 + Math.min(40, field.length))
      const tokens = field.split(' ').filter((token) => token.length >= 4)
      const matched = tokens.filter((token) => text.includes(token)).length
      if (tokens.length && matched) score = Math.max(score, Math.round((matched / tokens.length) * 80))
    }
    if (!best || score > best.score) best = { lead, score }
  }
  if (best && best.score >= 55) return best.lead
  if (context.focusLeadId) {
    const focused = visible.find((lead) => lead.id === context.focusLeadId)
    if (focused) return focused
  }
  if (context.previousLeadIds?.length === 1) return visible.find((lead) => lead.id === context.previousLeadIds?.[0]) ?? null
  return null
}

export const buildLiveSalesCoachAssistantAnswer = (prompt: string, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): AssistantAnswer | null => {
  const phase = liveSalesCoachPhaseForPrompt(prompt)
  if (!phase) return null
  const active = phase === 'during' ? readActiveLiveCallSession(snapshot.workspace.id, context.currentUserId) : null
  const allowed = visibleLeadIds(snapshot, context)
  const activeLead = active && allowed.has(active.leadId) ? snapshot.leads.find((lead) => lead.id === active.leadId) ?? null : null
  const lead = bestVisibleLead(prompt, snapshot, context) ?? activeLead
  if (!lead) return null
  const now = context.now ?? new Date()
  const call = resolveLiveSalesCoachCall(lead, snapshot, phase)
  const useActive = phase === 'during' && active?.leadId === lead.id
  const liveInput: LiveSalesCoachInput = { lead, snapshot, phase, call, transcript: useActive ? active.transcript : undefined, notes: useActive ? active.notes : undefined, outcome: useActive ? active.outcome : undefined, now }
  const live = buildLiveSalesCoach(liveInput)
  return {
    id: `live-sales-coach:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    intent: 'prepare_call',
    title: `${phase === 'during' ? 'Live Sales Coach' : 'Revisão pós-ligação'} · ${lead.company || lead.name}`,
    text: formatLiveSalesCoach(liveInput),
    items: [{ id: `deal:${lead.id}`, kind: 'deal', leadId: lead.id, title: lead.company || lead.name, subtitle: `${lead.name} · ${live.deal.healthScore}/100 · ${live.signals.length} sinal(is) explícito(s)`, score: live.deal.healthScore, value: lead.value, reason: live.recommendation.reason, route: 'calls', action: live.recommendation.kind }],
    facts: [
      `Próximo movimento: ${live.recommendation.title}.`,
      `${live.signals.length} sinal(is) explícito(s) considerado(s); nenhum fato ausente foi inferido.`,
      phase === 'after' ? `${live.postCall.persistedByCallOutcome.length} efeito(s) do fluxo da ligação foram separados para evitar duplicação.` : 'A leitura durante a ligação usa somente transcrição finalizada e notas que já estejam disponíveis na sessão ativa.',
      live.grounding,
    ],
    suggestedPrompts: phase === 'during' ? ['Qual pergunta faço agora?', 'Como respondo essa objeção?', 'Qual é o objetivo mínimo desta ligação?'] : ['Qual é o próximo movimento?', 'O que já foi salvo automaticamente?', 'Faça a próxima ação necessária'],
    focus: { leadId: lead.id, title: lead.company || lead.name, subtitle: lead.name, stageName: snapshot.stages.find((stage) => stage.id === lead.stageId)?.name ?? 'Sem etapa', healthScore: live.deal.healthScore, value: lead.value, route: 'calls' },
    generatedAt: now.toISOString(),
  }
}
