import type { CrmCapabilityExecutionRuntime } from './realtalent-crm-capability-executor'
import { capabilityArg, type CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'

export const uarg = (step: CrmCapabilityPlanStep, name: string) => capabilityArg(step, name)
export const unormalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@.+\-\s]/g, ' ').replace(/\s+/g, ' ').trim()
export const unum = (value: string, fallback = 0) => { const parsed = Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : fallback }
export const ubool = (value: string, fallback = false) => ['1','true','sim','yes','y','on','ativo','enabled'].includes(unormalize(value)) ? true : ['0','false','nao','não','no','off','inativo','disabled'].includes(unormalize(value)) ? false : fallback
export const uiso = (value: string) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : '' }
export const splitQueries = (value: string) => value.split(/[;\n,]+/).map((item) => item.trim()).filter(Boolean)

export const parseJson = <T>(value: string, fallback: T): T => {
  if (!value.trim()) return fallback
  try { return JSON.parse(value) as T } catch { throw new Error('O JSON informado para esta ação é inválido.') }
}

export const ubest = <T>(items: T[], query: string, fields: (item: T) => Array<string | null | undefined>): T | null => {
  if (!items.length) return null
  const q = unormalize(query)
  if (!q) return items.length === 1 ? items[0] : null
  let winner: { item: T; score: number } | null = null
  for (const item of items) {
    const values = fields(item).filter(Boolean).map((value) => unormalize(String(value)))
    let score = 0
    for (const value of values) {
      if (value === q) score = Math.max(score, 100)
      else if (value.startsWith(q) || q.startsWith(value)) score = Math.max(score, 85)
      else if (value.includes(q) || q.includes(value)) score = Math.max(score, 70)
      else {
        const tokens = q.split(' ').filter(Boolean)
        const matched = tokens.filter((token) => value.includes(token)).length
        score = Math.max(score, tokens.length ? Math.round((matched / tokens.length) * 60) : 0)
      }
    }
    if (!winner || score > winner.score) winner = { item, score }
  }
  return winner && winner.score >= 35 ? winner.item : null
}

export const targetQuery = (step: CrmCapabilityPlanStep) => uarg(step, 'record_id') || uarg(step, 'record_query')
export const resolveLeadU = (runtime: CrmCapabilityExecutionRuntime, query: string) => ubest(runtime.snapshot.leads, query, (item) => [item.id, item.name, item.company, item.phone, item.email])
export const resolveContactU = (runtime: CrmCapabilityExecutionRuntime, query: string) => ubest(runtime.snapshot.contacts, query, (item) => [item.id, item.name, item.phone, item.email, item.jobTitle])
export const resolveProposalU = (runtime: CrmCapabilityExecutionRuntime, query: string) => ubest(runtime.snapshot.proposals, query, (item) => [item.id, item.proposalNumber, item.title])
export const resolveProductU = (runtime: CrmCapabilityExecutionRuntime, query: string) => ubest(runtime.snapshot.products, query, (item) => [item.id, item.name, item.sku])
export const resolveActivityU = (runtime: CrmCapabilityExecutionRuntime, query: string) => ubest(runtime.snapshot.activities, query, (item) => [item.id, item.title, item.description])
export const resolveAutomationU = (runtime: CrmCapabilityExecutionRuntime, query: string) => ubest(runtime.snapshot.automationRules, query, (item) => [item.id, item.name])
export const resolveBuyerRoomU = (runtime: CrmCapabilityExecutionRuntime, query: string) => ubest(runtime.snapshot.buyerRooms ?? [], query, (item) => [item.id, item.title, item.shareToken, item.proposalId])

export const resolveLeadsU = (runtime: CrmCapabilityExecutionRuntime, raw: string) => {
  const resolved = splitQueries(raw).map((query) => resolveLeadU(runtime, query)).filter(Boolean) as typeof runtime.snapshot.leads
  return [...new Map(resolved.map((item) => [item.id, item])).values()]
}

export const assertRecordU = (runtime: CrmCapabilityExecutionRuntime, resource: Parameters<CrmCapabilityExecutionRuntime['canTeamAccessRecord']>[0], ownerId?: string | null, teamId?: string | null) => {
  if (!runtime.canTeamAccessRecord(resource, ownerId, teamId)) throw new Error('Este registro está fora do escopo permitido para o seu perfil/equipe.')
}
