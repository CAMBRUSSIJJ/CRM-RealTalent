import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const files = [
  'runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-semantic-router.mjs',
  'runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs',
  'runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-capability-planner.mjs',
]

for (const relative of files) {
  const file = path.resolve(root, relative)
  if (!fs.existsSync(file)) throw new Error(`Fonte definitiva ausente: ${relative}`)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Falha de sintaxe em ${relative}:\n${String(result.stderr || result.stdout || '').trim()}`)
  console.log(`✓ Fonte estática válida: ${relative}`)
}

console.log('✓ harden-universal-agent.mjs agora é somente verificador; nenhum arquivo foi reescrito.')
