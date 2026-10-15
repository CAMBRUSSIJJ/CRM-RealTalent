import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CRM_CAPABILITIES, crmCapabilityCatalogForModel } from './realtalent-crm-capabilities'

const executorSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/services/realtalent-crm-capability-executor.ts'),
  'utf8',
)

const nativeCapabilities = CRM_CAPABILITIES.filter((item) => item.execution === 'native')

describe('RealTalent Agent — cobertura estrutural de capabilities nativas', () => {
  it('expõe ao Ollama todo o catálogo nativo do CRM', () => {
    const catalogIds = new Set(crmCapabilityCatalogForModel().map((item) => item.id))
    const nativeIds = new Set(nativeCapabilities.map((item) => item.id))
    expect(catalogIds).toEqual(nativeIds)
  })

  it('mantém todos os ids nativos cobertos pelo executor real', () => {
    const missing = nativeCapabilities
      .map((item) => item.id)
      .filter((id) => !executorSource.includes(`'${id}'`) && !executorSource.includes(`\"${id}\"`))

    expect(missing, `Capabilities nativas sem caminho explícito no executor: ${missing.join(', ')}`).toEqual([])
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
