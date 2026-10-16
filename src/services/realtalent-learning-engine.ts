import { safeStorage } from '../lib/storage'
import type { CrmCapabilityArgument, CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'

const EXPERIENCE_PREFIX = 'realtalent:agent-learning:v1:'
const PLAN_PREFIX = 'realtalent:agent-learning-plans:v1:'
const MAX_EXPERIENCES = 240
const MAX_PLANS = 30
const MAX_RECEIPTS_PER_EXPERIENCE = 8

const STOP_WORDS = new Set([
  'a','ao','aos','as','o','os','um','uma','uns','umas','de','da','das','do','dos','e','em','no','nos','na','nas','para','por','com','que','me','eu','voce','voces','se','isso','essa','esse','esta','este','pra','pro','pela','pelo','ser','seja','como','mais','apenas','so',
])

type LearningAction = 'create' | 'execute' | 'delete' | 'update' | 'read'

const ACTION_ALIASES: Record<string, LearningAction> = {
  crie: 'create', criar: 'create', cria: 'create', criado: 'create', criada: 'create',
  adicione: 'create', adicionar: 'create', cadastre: 'create', cadastrar: 'create', registre: 'create', registrar: 'create',
  faca: 'execute', fazer: 'execute', faz: 'execute', execute: 'execute', executar: 'execute',
  exclua: 'delete', excluir: 'delete', delete: 'delete', deletar: 'delete', apague: 'delete', apagar: 'delete', remova: 'delete', remover: 'delete',
  atualize: 'update', atualizar: 'update', edite: 'update', editar: 'update', altere: 'update', alterar: 'update', mude: 'update', mudar: 'update',
  consulte: 'read', consultar: 'read', liste: 'read', listar: 'read', mostre: 'read', mostrar: 'read', veja: 'read', verifique: 'read', verificar: 'read',
}

const TEMPORAL_ARGUMENTS = new Set([
  'period_start','period_end','starts_at','ends_at','due_at','first_due_at','next_at','ended_at','started_at','valid_until','expected_close_at','contract_start_at','contract_end_at','expires_at',
])
const SECRET_ARGUMENT = /(password|senha|secret|token|api[_-]?key|authorization|credential|cookie)/i

export type RealTalentLearningKind = 'verified_execution' | 'correction'
export type RealTalentLearningStatus = 'verified' | 'corrected'

export interface RealTalentLearningExperience {
  id: string
  workspaceId: string
  kind: RealTalentLearningKind
  status: RealTalentLearningStatus
  prompt: string
  normalizedPrompt: string
  capabilityId?: string
  args: CrmCapabilityArgument[]
  summary: string
  correction?: string
  sourcePlanId?: string
  sourceReceiptIds: string[]
  uses: number
  createdAt: string
  updatedAt: string
}

interface LearningPlanStage {
  planId: string
  prompt: string
  normalizedPrompt: string
  steps: Array<Pick<CrmCapabilityPlanStep, 'capabilityId' | 'args' | 'title'>>
  createdAt: string
  syncedReceiptId?: string
}

export interface MinimalExecutionReceipt {
  id: string
  workspaceId: string
  planId: string
  status: 'verified' | 'partial' | 'failed' | 'rolled_back'
  steps: Array<{ capabilityId: string; status: string; summary?: string }>
}

export interface RankedLearningExperience extends RealTalentLearningExperience {
  similarity: number
}

const experienceKey = (workspaceId: string) => `${EXPERIENCE_PREFIX}${workspaceId}`
const planKey = (workspaceId: string) => `${PLAN_PREFIX}${workspaceId}`

const compact = (value: unknown, max = 600) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export const normalizeLearningText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9@._+-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const redactSecrets = (value: string) => value
  .replace(/\bsk-[a-z0-9_-]{12,}\b/gi, '[redacted]')
  .replace(/\bBearer\s+[a-z0-9._~+\/-]{12,}\b/gi, 'Bearer [redacted]')
  .replace(/\b(senha|password|api[_ -]?key|secret|token)\s*[:=]\s*\S+/gi, '$1=[redacted]')

const safePrompt = (value: string) => compact(redactSecrets(value), 700)
const safeSummary = (value: string) => compact(redactSecrets(value), 500)

const sanitizeArgs = (args: CrmCapabilityArgument[] = []) => args
  .filter((item) => item && typeof item.name === 'string' && typeof item.value === 'string')
  .slice(0, 24)
  .map((item) => ({
    name: compact(item.name, 80),
    value: SECRET_ARGUMENT.test(item.name) ? '[redacted]' : compact(redactSecrets(item.value), 300),
  }))
  .filter((item) => item.name && item.value)

const readExperiences = (workspaceId: string): RealTalentLearningExperience[] => {
  if (!workspaceId) return []
  try {
    const raw = JSON.parse(safeStorage.getItem(experienceKey(workspaceId)) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is RealTalentLearningExperience => Boolean(
      item && typeof item === 'object' && typeof (item as RealTalentLearningExperience).id === 'string'
      && typeof (item as RealTalentLearningExperience).normalizedPrompt === 'string',
    ))
  } catch { return [] }
}

const saveExperiences = (workspaceId: string, rows: RealTalentLearningExperience[]) => {
  safeStorage.setItem(experienceKey(workspaceId), JSON.stringify(rows.slice(-MAX_EXPERIENCES)))
}

const readPlans = (workspaceId: string): LearningPlanStage[] => {
  if (!workspaceId) return []
  try {
    const raw = JSON.parse(safeStorage.getItem(planKey(workspaceId)) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is LearningPlanStage => Boolean(item && typeof item === 'object' && typeof (item as LearningPlanStage).planId === 'string'))
  } catch { return [] }
}

const savePlans = (workspaceId: string, rows: LearningPlanStage[]) => {
  safeStorage.setItem(planKey(workspaceId), JSON.stringify(rows.slice(-MAX_PLANS)))
}

const semanticToken = (token: string) => {
  if (/^[+-]?\d+(?:[.,]\d+)?$/.test(token)) return '__number__'
  if (/^\d{1,4}(?:[-/]\d{1,2}){1,2}$/.test(token)) return '__date__'
  const action = ACTION_ALIASES[token]
  return action ? `__action_${action}__` : token
}

const tokenSet = (value: string) => new Set(
  normalizeLearningText(value)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .map(semanticToken),
)

const actionFromTokens = (tokens: Set<string>): LearningAction | null => {
  for (const action of ['create','execute','delete','update','read'] as const) {
    if (tokens.has(`__action_${action}__`)) return action
  }
  return null
}

export const learningSimilarity = (left: string, right: string) => {
  const aText = normalizeLearningText(left)
  const bText = normalizeLearningText(right)
  if (!aText || !bText) return 0
  if (aText === bText) return 1
  const a = tokenSet(aText)
  const b = tokenSet(bText)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  const union = new Set([...a, ...b]).size
  const jaccard = union ? intersection / union : 0
  const containment = intersection / Math.max(1, Math.min(a.size, b.size))
  const prefix = aText.startsWith(bText) || bText.startsWith(aText) ? 0.08 : 0
  let score = jaccard * 0.58 + containment * 0.34 + prefix

  const aAction = actionFromTokens(a)
  const bAction = actionFromTokens(b)
  if (aAction && bAction && aAction !== bAction) {
    const genericCompatible = (aAction === 'execute' || bAction === 'execute') && aAction !== 'delete' && bAction !== 'delete'
    if (genericCompatible) score += 0.12
    else score *= 0.35
  }

  return Math.max(0, Math.min(1, score))
}

export const listRealTalentLearningExperiences = (workspaceId: string) => readExperiences(workspaceId)

export const rememberLearningPlan = (
  workspaceId: string,
  prompt: string,
  plan: { id: string; steps: Array<Pick<CrmCapabilityPlanStep, 'capabilityId' | 'args' | 'title'>> },
) => {
  if (!workspaceId || !plan.id || !plan.steps.length) return
  const cleanPrompt = safePrompt(prompt)
  if (!cleanPrompt) return
  const stage: LearningPlanStage = {
    planId: plan.id,
    prompt: cleanPrompt,
    normalizedPrompt: normalizeLearningText(cleanPrompt),
    steps: plan.steps.slice(0, 8).map((step) => ({
      capabilityId: compact(step.capabilityId, 160),
      title: compact(step.title, 180),
      args: sanitizeArgs(step.args),
    })),
    createdAt: new Date().toISOString(),
  }
  const existing = readPlans(workspaceId).filter((item) => item.planId !== stage.planId)
  savePlans(workspaceId, [...existing, stage])
}

const recordVerifiedExperience = (
  workspaceId: string,
  input: { prompt: string; capabilityId: string; args: CrmCapabilityArgument[]; summary: string; planId: string; receiptId: string },
) => {
  const now = new Date().toISOString()
  const prompt = safePrompt(input.prompt)
  const normalizedPrompt = normalizeLearningText(prompt)
  if (!workspaceId || !normalizedPrompt || !input.capabilityId) return
  const args = sanitizeArgs(input.args)
  const signature = `${normalizedPrompt}|${input.capabilityId}|${JSON.stringify(args)}`
  const rows = readExperiences(workspaceId)
  const index = rows.findIndex((item) => item.kind === 'verified_execution' && `${item.normalizedPrompt}|${item.capabilityId}|${JSON.stringify(item.args)}` === signature)
  if (index >= 0) {
    const current = rows[index]
    if (current.sourceReceiptIds.includes(input.receiptId)) return
    rows[index] = {
      ...current,
      status: 'verified',
      summary: safeSummary(input.summary) || current.summary,
      sourcePlanId: input.planId,
      sourceReceiptIds: [...current.sourceReceiptIds, input.receiptId].slice(-MAX_RECEIPTS_PER_EXPERIENCE),
      uses: current.uses + 1,
      updatedAt: now,
    }
    saveExperiences(workspaceId, rows)
    return
  }
  saveExperiences(workspaceId, [...rows, {
    id: `learn:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    kind: 'verified_execution',
    status: 'verified',
    prompt,
    normalizedPrompt,
    capabilityId: compact(input.capabilityId, 160),
    args,
    summary: safeSummary(input.summary),
    sourcePlanId: input.planId,
    sourceReceiptIds: [input.receiptId],
    uses: 1,
    createdAt: now,
    updatedAt: now,
  }])
}

export const syncVerifiedLearningFromReceipt = (workspaceId: string, receipt: MinimalExecutionReceipt | null | undefined) => {
  if (!workspaceId || !receipt || receipt.workspaceId !== workspaceId || receipt.status !== 'verified') return 0
  const plans = readPlans(workspaceId)
  const index = plans.findIndex((item) => item.planId === receipt.planId)
  if (index < 0 || plans[index].syncedReceiptId === receipt.id) return 0
  const stage = plans[index]
  let learned = 0
  for (const evidence of receipt.steps) {
    if (evidence.status !== 'verified' && evidence.status !== 'read') continue
    const step = stage.steps.find((item) => item.capabilityId === evidence.capabilityId)
    if (!step) continue
    recordVerifiedExperience(workspaceId, {
      prompt: stage.prompt,
      capabilityId: step.capabilityId,
      args: step.args,
      summary: evidence.summary || step.title,
      planId: stage.planId,
      receiptId: receipt.id,
    })
    learned += 1
  }
  plans[index] = { ...stage, syncedReceiptId: receipt.id }
  savePlans(workspaceId, plans)
  return learned
}

export const isLearningCorrection = (prompt: string) => {
  const text = normalizeLearningText(prompt)
  return /\b(nao foi isso|nao era isso|esta errado|ta errado|errado|entendeu errado|voce entendeu errado|eu pedi|eu queria|quis dizer|era para|era pra|deveria ser|corrija isso|corrige isso)\b/.test(text)
}

export const recordLearningCorrection = (workspaceId: string, correctionText: string) => {
  if (!workspaceId || !isLearningCorrection(correctionText)) return null
  const plans = readPlans(workspaceId)
  const previous = [...plans].reverse().find((item) => item.prompt && item.normalizedPrompt !== normalizeLearningText(correctionText))
  if (!previous) return null
  const now = new Date().toISOString()
  const capabilityIds = new Set(previous.steps.map((step) => step.capabilityId))
  const rows = readExperiences(workspaceId).map((item) => (
    item.kind === 'verified_execution' && item.normalizedPrompt === previous.normalizedPrompt && item.capabilityId && capabilityIds.has(item.capabilityId)
      ? { ...item, status: 'corrected' as const, updatedAt: now }
      : item
  ))
  const correction = safePrompt(correctionText)
  const existingIndex = rows.findIndex((item) => item.kind === 'correction' && item.normalizedPrompt === previous.normalizedPrompt && item.correction === correction)
  const correctionRow: RealTalentLearningExperience = {
    id: existingIndex >= 0 ? rows[existingIndex].id : `correction:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    kind: 'correction',
    status: 'corrected',
    prompt: previous.prompt,
    normalizedPrompt: previous.normalizedPrompt,
    capabilityId: previous.steps[0]?.capabilityId,
    args: [],
    summary: 'O usuário corrigiu a interpretação anterior; não reutilizar como exemplo positivo.',
    correction,
    sourcePlanId: previous.planId,
    sourceReceiptIds: [],
    uses: existingIndex >= 0 ? rows[existingIndex].uses + 1 : 1,
    createdAt: existingIndex >= 0 ? rows[existingIndex].createdAt : now,
    updatedAt: now,
  }
  if (existingIndex >= 0) rows[existingIndex] = correctionRow
  else rows.push(correctionRow)
  saveExperiences(workspaceId, rows)
  return correctionRow
}

export const findRelevantLearningExperiences = (workspaceId: string, prompt: string, limit = 5): RankedLearningExperience[] => {
  const rows = readExperiences(workspaceId)
  return rows
    .map((item) => ({ ...item, similarity: learningSimilarity(prompt, item.prompt) }))
    .filter((item) => item.similarity >= (item.kind === 'correction' ? 0.20 : 0.24))
    .sort((a, b) => b.similarity - a.similarity || b.uses - a.uses || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.max(1, Math.min(8, limit)))
}

const displayArgs = (args: CrmCapabilityArgument[]) => args.slice(0, 10).map((item) => {
  if (TEMPORAL_ARGUMENTS.has(item.name)) return `${item.name}=<recalcular pela mensagem atual>`
  return `${item.name}=${compact(item.value, 100)}`
}).join(', ')

export const formatLearningContext = (ranked: RankedLearningExperience[]) => {
  if (!ranked.length) return ''
  const positives = ranked.filter((item) => item.kind === 'verified_execution' && item.status === 'verified')
  const corrections = ranked.filter((item) => item.kind === 'correction' || item.status === 'corrected')
  const lines = [
    'APRENDIZADO LOCAL REALTALENT — use apenas como evidência auxiliar; o pedido atual sempre tem prioridade.',
  ]
  const top = positives[0]
  if (top?.capabilityId && top.similarity >= 0.72) lines.push(`[RT_LEARNING_HINT capability=${top.capabilityId} score=${top.similarity.toFixed(3)}]`)
  for (const item of positives.slice(0, 3)) {
    lines.push(`SUCESSO VERIFICADO (similaridade ${item.similarity.toFixed(2)}): pedido="${compact(item.prompt, 220)}" → ${item.capabilityId}${item.args.length ? ` (${displayArgs(item.args)})` : ''}. Não copie datas/valores temporais; extraia-os novamente do pedido atual.`)
  }
  for (const item of corrections.slice(0, 2)) {
    lines.push(`CORREÇÃO DO USUÁRIO: para pedido anterior="${compact(item.prompt, 180)}", o usuário disse="${compact(item.correction || item.summary, 220)}". Não repita a interpretação anterior sem confirmar o novo sentido.`)
  }
  return lines.join('\n').slice(0, 2600)
}

export const learningStats = (workspaceId: string) => {
  const rows = readExperiences(workspaceId)
  return {
    total: rows.length,
    verified: rows.filter((item) => item.kind === 'verified_execution' && item.status === 'verified').length,
    corrected: rows.filter((item) => item.kind === 'correction' || item.status === 'corrected').length,
  }
}

export const clearRealTalentLearning = (workspaceId: string) => {
  safeStorage.removeItem(experienceKey(workspaceId))
  safeStorage.removeItem(planKey(workspaceId))
}