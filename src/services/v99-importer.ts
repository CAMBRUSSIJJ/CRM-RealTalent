import type { Lead, PipelineStage, V99ImportResult } from '../domain/types'
import { createId } from '../lib/id'

const LEAD_KEYS = ['leads', 'crm_leads', 'crm.v99.leads', 'outbounder_leads', 'crmLeads', 'dadosLeads']

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const asString = (value: unknown) => value == null ? '' : String(value).trim()
const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = asString(value).replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean)
  return asString(value).split(/[,;|]/).map((item) => item.trim()).filter(Boolean)
}

const findLeadArray = (root: unknown): { items: unknown[]; key: string } | null => {
  if (Array.isArray(root)) return { items: root, key: 'root' }
  const object = asObject(root)
  if (!object) return null

  const directSnapshot = asObject(object.snapshot)
  if (Array.isArray(directSnapshot?.leads)) return { items: directSnapshot.leads, key: 'snapshot.leads' }
  const workspaceBackup = asObject(object.workspace)
  const workspaceSnapshot = asObject(workspaceBackup?.snapshot)
  if (Array.isArray(workspaceSnapshot?.leads)) return { items: workspaceSnapshot.leads, key: 'workspace.snapshot.leads' }
  if (Array.isArray(workspaceBackup?.leads)) return { items: workspaceBackup.leads, key: 'workspace.leads' }

  for (const key of LEAD_KEYS) {
    const value = object[key]
    if (Array.isArray(value)) return { items: value, key }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown
        if (Array.isArray(parsed)) return { items: parsed, key }
      } catch { /* continua */ }
    }
  }

  for (const [key, value] of Object.entries(object)) {
    if (Array.isArray(value) && value.some((item) => {
      const candidate = asObject(item)
      return candidate && ('nome' in candidate || 'name' in candidate || 'empresa' in candidate || 'company' in candidate)
    })) return { items: value, key }
    const nested = asObject(value)
    if (nested) {
      const result = findLeadArray(nested)
      if (result) return { items: result.items, key: `${key}.${result.key}` }
    }
  }
  return null
}

const normalizeTemperature = (value: unknown): Lead['temperature'] => {
  const normalized = asString(value).toLowerCase()
  if (normalized.includes('quente') || normalized === 'hot') return 'hot'
  if (normalized.includes('morno') || normalized === 'warm') return 'warm'
  return 'cold'
}

const normalizePriority = (value: unknown): Lead['priority'] => {
  const normalized = asString(value).toLowerCase()
  if (normalized.includes('urgent')) return 'urgent'
  if (normalized.includes('alta') || normalized === 'high') return 'high'
  if (normalized.includes('média') || normalized.includes('media') || normalized === 'medium') return 'medium'
  return 'low'
}

const normalizeStatus = (value: unknown): Lead['status'] => {
  const normalized = asString(value).toLowerCase()
  if (normalized.includes('ganh') || normalized.includes('fech') || normalized === 'won') return 'won'
  if (normalized.includes('perd') || normalized === 'lost') return 'lost'
  if (normalized.includes('arquiv') || normalized === 'archived') return 'archived'
  return 'active'
}

const resolveStage = (record: Record<string, unknown>, stages: PipelineStage[]) => {
  const raw = asString(record.stageId ?? record.pipelineStageId ?? record.etapaId ?? record.pipeline ?? record.etapa ?? record.stage)
  const normalized = raw.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return stages.find((stage) => stage.id === raw)
    ?? stages.find((stage) => stage.name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalized)
    ?? stages[0]
}

const normalizeDate = (value: unknown): string | null => {
  if (!value) return null
  const date = new Date(asString(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function importV99Backup(rawText: string, workspaceId: string, stages: PipelineStage[]): V99ImportResult {
  if (!stages.length) throw new Error('Crie as etapas do Pipeline antes de importar.')
  let root: unknown
  try {
    root = JSON.parse(rawText) as unknown
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  const source = findLeadArray(root)
  if (!source) throw new Error('Nenhuma lista de leads foi encontrada no backup da V99.')

  const warnings: string[] = []
  const leads: Lead[] = []
  source.items.forEach((item, index) => {
    const record = asObject(item)
    if (!record) {
      warnings.push(`Registro ${index + 1} ignorado: formato inválido.`)
      return
    }
    const name = asString(record.name ?? record.nome ?? record.empresa ?? record.company ?? record.razaoSocial ?? record.nomeFantasia)
    if (!name) {
      warnings.push(`Registro ${index + 1} ignorado: sem nome.`)
      return
    }
    const stage = resolveStage(record, stages)
    const now = new Date().toISOString()
    const status = normalizeStatus(record.status ?? record.situacao)
    leads.push({
      id: asString(record.id) || createId('lead-importado'),
      workspaceId,
      name,
      company: asString(record.company ?? record.empresa ?? record.nomeFantasia ?? name),
      phone: asString(record.phone ?? record.telefone ?? record.whatsapp ?? record.celular),
      email: asString(record.email),
      city: asString(record.city ?? record.cidade ?? record.local),
      source: asString(record.source ?? record.origem ?? 'Importação V99'),
      stageId: stage.id,
      status: stage.isWon ? 'won' : stage.isLost ? 'lost' : status,
      temperature: normalizeTemperature(record.temperature ?? record.temperatura),
      priority: normalizePriority(record.priority ?? record.prioridade),
      ownerId: null,
      ownerName: asString(record.ownerName ?? record.responsavel ?? record.vendedor ?? 'Equipe'),
      value: asNumber(record.value ?? record.valor ?? record.ticket),
      nextActionAt: normalizeDate(record.nextActionAt ?? record.proximaAcaoEm ?? record.proximoContato ?? record.dataRetorno),
      notes: asString(record.notes ?? record.observacoes ?? record.anotacoes),
      tags: parseTags(record.tags ?? record.etiquetas),
      createdAt: normalizeDate(record.createdAt ?? record.criadoEm) ?? now,
      updatedAt: normalizeDate(record.updatedAt ?? record.atualizadoEm) ?? now,
    })
  })

  return { leads, warnings, sourceKeys: [source.key] }
}
