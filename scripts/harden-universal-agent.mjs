import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const patch = (relative, transform) => {
  const file = path.resolve(root, relative)
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8')
    console.log(`✓ Universal hardening: ${relative}`)
  }
  return after
}

const gateway = patch('runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs', (source) => source
  .replace(
    "/\\\\b(relacao|relacionamento|reporta|influencia|trabalha diretamente com|parceiro|socio)\\\\b/) && has(/\\\\b(contato|ana|bruno|pessoa|pessoas)\\\\b/)",
    "/\\\\b(relacao|relacionamento|reporta|influencia|trabalha diretamente com|parceiro|socio)\\\\b/) && has(/\\\\b(com|entre|contato|contatos|pessoa|pessoas)\\\\b/)",
  ))

if (!gateway.includes('const semanticDomainAnchor =')) throw new Error('O roteador híbrido não foi instalado pelo enable-universal-agent.mjs.')
if (!gateway.includes('requiredSlots: Array.isArray(capability?.requiredSlots)')) throw new Error('requiredSlots não estão chegando ao planner universal.')

const matrix = patch('src/services/realtalent-ollama-crm-matrix.integration.test.ts', (source) => {
  let next = source
  const urlAnchor = "const agentUrl = String(process.env.REALTALENT_AGENT_TEST_URL || 'http://127.0.0.1:8791').replace(/\\/$/, '')\n"
  if (next.includes(urlAnchor) && !next.includes('REALTALENT_MATRIX_FROM')) {
    next = next.replace(urlAnchor, `${urlAnchor}const matrixFrom = Math.max(0, Number(process.env.REALTALENT_MATRIX_FROM || 0))\nconst matrixToRaw = Number(process.env.REALTALENT_MATRIX_TO || Number.MAX_SAFE_INTEGER)\nconst matrixTo = Number.isFinite(matrixToRaw) ? Math.max(matrixFrom, matrixToRaw) : Number.MAX_SAFE_INTEGER\n`)
  }
  const askAnchor = '\nconst askPlanner = async (item: MatrixCase) => {'
  if (next.includes(askAnchor) && !next.includes('const RUN_CASES =')) {
    next = next.replace(askAnchor, `\nconst RUN_CASES = CASES.slice(matrixFrom, matrixTo)\n${askAnchor}`)
  }
  next = next.replace('  for (const item of CASES) {', '  for (const item of RUN_CASES) {')
  return next
})

if (!matrix.includes('const RUN_CASES = CASES.slice(matrixFrom, matrixTo)')) throw new Error('A matriz universal não recebeu suporte a execução em lotes.')

console.log('✓ Universal Agent hardening aplicado.')
