import type { AutomationRule, PipelineStage } from '../domain/types'
import { safeStorage } from '../lib/storage'
import { readAutomationGuard, validateAutomationRule, visibleAutomationConditions } from './automation-workspace'

export interface AutomationPreflight {
  ruleId: string
  fingerprint: string
  testedAt: string
  leadId: string
  leadName: string
  matched: boolean
  warningCount: number
}

export interface AutomationActivationReadiness {
  ready: boolean
  requiresTest: boolean
  label: string
  reason: string
  preflight: AutomationPreflight | null
}

const STORAGE_PREFIX = 'realtalent-v10087-automation-preflight:'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value)
}

const hash = (value: string) => {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(16).padStart(8, '0')
}

export function automationRuleFingerprint(rule: Pick<AutomationRule, 'triggerType' | 'conditions' | 'actions'>) {
  const guard = readAutomationGuard(rule.conditions)
  const payload = {
    triggerType: rule.triggerType,
    conditions: visibleAutomationConditions(rule.conditions).map(({ field, operator, value }) => ({ field, operator, value })),
    actions: rule.actions.map(({ type, value, delayDays, delayHours, durationMinutes }) => ({ type, value, delayDays: delayDays ?? null, delayHours: delayHours ?? null, durationMinutes: durationMinutes ?? null })),
    safety: {
      cooldownHours: guard.cooldownHours,
      maxRunsPerLeadPerDay: guard.maxRunsPerLeadPerDay,
      maxActionsPerRun: guard.maxActionsPerRun,
      stopOnError: guard.stopOnError,
      preventDuplicates: guard.preventDuplicates,
      maxChainDepth: guard.maxChainDepth,
      loopWindowMinutes: guard.loopWindowMinutes,
    },
  }
  return hash(stable(payload))
}

const storageKey = (workspaceId: string) => `${STORAGE_PREFIX}${workspaceId}`

function readAll(workspaceId: string): Record<string, AutomationPreflight> {
  try {
    const parsed = JSON.parse(safeStorage.getItem(storageKey(workspaceId)) ?? '{}') as Record<string, AutomationPreflight>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

export function recordAutomationPreflight(workspaceId: string, rule: AutomationRule, input: Omit<AutomationPreflight, 'ruleId' | 'fingerprint' | 'testedAt'>) {
  const current = readAll(workspaceId)
  const next: AutomationPreflight = {
    ruleId: rule.id,
    fingerprint: automationRuleFingerprint(rule),
    testedAt: new Date().toISOString(),
    ...input,
  }
  current[rule.id] = next
  safeStorage.setItem(storageKey(workspaceId), JSON.stringify(current))
  return next
}

export function readAutomationPreflight(workspaceId: string, rule: AutomationRule): AutomationPreflight | null {
  const item = readAll(workspaceId)[rule.id]
  if (!item) return null
  if (item.fingerprint !== automationRuleFingerprint(rule)) return null
  if (Date.now() - new Date(item.testedAt).getTime() > MAX_AGE_MS) return null
  return item
}

export function automationActivationReadiness(workspaceId: string, rule: AutomationRule, stages: PipelineStage[]): AutomationActivationReadiness {
  const validation = validateAutomationRule(rule, stages)
  const guard = readAutomationGuard(rule.conditions)
  const preflight = readAutomationPreflight(workspaceId, rule)
  if (validation.errors.length) return { ready: false, requiresTest: guard.mode === 'live', label: 'Corrigir regra', reason: validation.errors[0], preflight }
  if (guard.mode === 'simulation') return { ready: true, requiresTest: false, label: 'Simulação segura', reason: 'A regra pode ficar ligada porque não altera dados enquanto estiver em modo de simulação.', preflight }
  if (!preflight) return { ready: false, requiresTest: true, label: 'Teste pendente', reason: 'Faça uma simulação que encontre pelo menos um lead antes de ativar a execução real.', preflight: null }
  if (!preflight.matched) return { ready: false, requiresTest: true, label: 'Teste sem correspondência', reason: 'A última simulação não encontrou um lead que atendesse às condições. Teste com outro lead.', preflight }
  return { ready: true, requiresTest: true, label: 'Teste aprovado', reason: `Simulado com ${preflight.leadName} em ${new Date(preflight.testedAt).toLocaleString('pt-BR')}.`, preflight }
}
