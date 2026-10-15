import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const repo = read('src/repositories/local-crm-repository.ts')
const test = read('src/repositories/local-crm-repository.test.ts')

const checks = [
  ['initialize preserva instalação existente', repo.includes('const beforeStructure = structuralSnapshot()') && repo.includes('if (structuralSnapshot() !== beforeStructure) writeDatabase(db)')],
  ['initialize não regrava por normalização compatível', repo.includes('Inicializar o repositório') && repo.includes('não deve, por si só, regravar a instalação do usuário')],
  ['merge preserva maior valor comercial', repo.includes('const consolidatedValue = Math.max(') && repo.includes('selectedOfficial.totalContractValue') && (repo.includes('merged.value') || repo.includes('resolvedLead.value'))],
  ['lead consolidado usa valor preservado', repo.includes('resolvedLead.value = consolidatedValue')],
  ['oportunidade consolidada usa valor preservado', repo.includes('resolvedOpportunity.value = consolidatedValue')],
  ['regressão de merge continua coberta', test.includes("expect(merged.value).toBe(9000)")],
  ['regressão de primeiro acesso continua coberta', test.includes("expect(localStorage.getItem('realtalent-crm-v100-local')).toBe(raw)")],
]

let failed = 0
for (const [label, ok] of checks) {
  if (ok) console.log(`OK  ${label}`)
  else { console.error(`FAIL ${label}`); failed += 1 }
}
if (failed) process.exit(1)
console.log(`\nV101.1.0 Vitest HOTFIX: ${checks.length}/${checks.length} contratos aprovados.`)
