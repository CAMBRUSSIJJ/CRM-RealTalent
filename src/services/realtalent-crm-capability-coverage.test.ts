import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CRM_CAPABILITIES, crmCapabilityCatalogForModel } from './realtalent-crm-capabilities'

const executorSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/services/realtalent-crm-capability-executor.ts'),
  'utf8',
)

const assistantDrawerSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/features/assistant/assistant-drawer.tsx'),
  'utf8',
)

const nativeCapabilities = CRM_CAPABILITIES.filter((item) => item.execution === 'native')

/**
 * Algumas famílias do executor usam um dispatcher por prefixo e deixam o último
 * comportamento da família como caminho específico da capability. Nesses casos o
 * id completo não aparece literalmente no arquivo, então exigimos um "witness"
 * único do executor real. Isso mantém o gate forte: qualquer capability NOVA sem
 * id literal ou sem witness explícito continuará falhando.
 */
const groupedExecutionWitnesses: Record<string, string> = {
  'proposals.update_status': 'actions.updateProposalStatus(proposal.id, status)',
  'catalog.update_product': 'actions.updateProduct(product.id, patch as any)',
  'goals.update': 'actions.updateGoal(goal.id, patch as any)',
  'playbooks.update': 'actions.updatePlaybook(playbook.id, patch as any)',
  'automations.run': 'actions.runAutomationRule(rule.id, lead.id)',
  'teams.update_role': 'actions.updateWorkspaceMemberRole(member.userId, role)',
  'revenue.update_status': 'actions.updateRevenueEntryStatus(entry.id, status)',
}

const hasDirectExecutorPath = (id: string) =>
  executorSource.includes(`'${id}'`) ||
  executorSource.includes(`\"${id}\"`) ||
  Boolean(groupedExecutionWitnesses[id] && executorSource.includes(groupedExecutionWitnesses[id]))

const hasOrchestratedExecutorPath = (id: string) => {
  if (id !== 'agent.undo_last') return false
  return assistantDrawerSource.includes("step.capabilityId === 'agent.undo_last'") &&
    assistantDrawerSource.includes('undoCrmAgentOperation(') &&
    executorSource.includes('export async function undoCrmAgentOperation')
}

describe('RealTalent Agent — cobertura estrutural de capabilities nativas', () => {
  it('expõe ao Ollama todo o catálogo nativo do CRM', () => {
    const catalogIds = new Set(crmCapabilityCatalogForModel().map((item) => item.id))
    const nativeIds = new Set(nativeCapabilities.map((item) => item.id))
    expect(catalogIds).toEqual(nativeIds)
  })

  it('mantém todas as capabilities nativas com caminho real de execução', () => {
    const missing = nativeCapabilities
      .map((item) => item.id)
      .filter((id) => !hasDirectExecutorPath(id) && !hasOrchestratedExecutorPath(id))

    expect(missing, `Capabilities nativas sem caminho real de execução: ${missing.join(', ')}`).toEqual([])
  })

  it('mantém os witnesses agrupados restritos a capabilities nativas existentes', () => {
    const nativeIds = new Set(nativeCapabilities.map((item) => item.id))
    const staleWitnesses = Object.keys(groupedExecutionWitnesses).filter((id) => !nativeIds.has(id))
    expect(staleWitnesses, `Witnesses órfãos no gate: ${staleWitnesses.join(', ')}`).toEqual([])
  })

  it('não publica capability sem metadados mínimos de segurança', () => {
    for (const capability of nativeCapabilities) {
      expect(capability.id).toMatch(/^[a-z0-9_.-]+$/)
      expect(['read', 'low', 'medium', 'high']).toContain(capability.risk)
      expect(typeof capability.reversible).toBe('boolean')
      expect(Array.isArray(capability.argumentHints)).toBe(true)
    }
  })
})
