import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

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

const gateway = patch('runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs', (source) => {
  let next = source
    .replace('contato|ana|bruno|pessoa|pessoas', 'com|entre|contato|contatos|pessoa|pessoas')
    .replaceAll("return pick('contacts',", "return pick('leads',")

  const hasAnchor = "  const has = (pattern) => pattern.test(text)\n\n"
  if (next.includes(hasAnchor) && !next.includes("notificação, undo ou navegação global explícita")) {
    next = next.replace(hasAnchor, `${hasAnchor}  if (has(/\\b(notificacao|notificacoes|aviso|avisos|campainha|desfaca|desfazer|undo)\\b/)) return pick('dashboard', 'notificação, undo ou navegação global explícita')\n`)
  }
  return next
})

if (!gateway.includes('const semanticDomainAnchor =')) throw new Error('O roteador híbrido não foi instalado pelo enable-universal-agent.mjs.')
if (!gateway.includes('requiredSlots: Array.isArray(capability?.requiredSlots)')) throw new Error('requiredSlots não estão chegando ao planner universal.')
if (gateway.includes('contato|ana|bruno|pessoa|pessoas')) throw new Error('O roteador contém nomes de teste hardcoded; a regra precisa permanecer genérica.')
if (gateway.includes("pick('contacts'")) throw new Error("O roteador ainda usa o domínio técnico inexistente 'contacts'; Contatos deve rotear pelo AppRoute 'leads'.")
if (!gateway.includes("notificação, undo ou navegação global explícita")) throw new Error('O domínio global não recebeu âncora para notificações/undo.')

const planner = patch('runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-capability-planner.mjs', (source) => {
  let next = source
  const brokenEnding = '26. Responda SOMENTE no schema solicitado.\n\nconst text ='
  if (next.includes('DESAMBIGUAÇÃO UNIVERSAL DE CAPABILITIES') && next.includes(brokenEnding)) {
    next = next.replace(brokenEnding, '26. Responda SOMENTE no schema solicitado.`\n\nconst text =')
  }
  return next
})

if (planner.includes('DESAMBIGUAÇÃO UNIVERSAL DE CAPABILITIES') && !planner.includes('26. Responda SOMENTE no schema solicitado.`\n\nconst text =')) {
  throw new Error('O bloco de instruções do planner ficou sem fechamento seguro da template string.')
}

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

const syntaxCheck = (relative) => {
  const file = path.resolve(root, relative)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(`Falha de sintaxe em ${relative}:\n${detail}`)
  }
  console.log(`✓ Sintaxe validada: ${relative}`)
}

syntaxCheck('runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-capability-planner.mjs')
syntaxCheck('runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs')

console.log('✓ Universal Agent hardening aplicado.')
