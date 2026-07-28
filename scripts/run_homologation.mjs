import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const steps = [
  ['Fonte oficial', ['npm', ['run', 'guard:source']]],
  ['Arquitetura', ['npm', ['run', 'guard:architecture']]],
  ['Sintaxe TypeScript', ['npm', ['run', 'audit:syntax']]],
  ['Banco e migrations', ['npm', ['run', 'audit:database']]],
  ['Backup e restauração', ['npm', ['run', 'test:backup']]],
  ['Connect Desktop', ['npm', ['run', 'audit:connect']]],
  ['Central de Extensões', ['npm', ['run', 'audit:extensions']]],
  ['TypeScript', ['npm', ['run', 'typecheck']]],
  ['Testes', ['npm', ['run', 'test']]],
  ['Build', ['npm', ['run', 'build']]],
  ['Standalone gerado da fonte', ['npm', ['run', 'standalone']]],
  ['Smoke browser', ['npm', ['run', 'test:smoke']]],
  ['Auditoria de release', ['npm', ['run', 'audit:release']]],
  ['Prontidão de produção', ['npm', ['run', 'audit:production']]],
  ['Pré-voo', ['npm', ['run', 'preflight']]],
  ['Manifesto', ['npm', ['run', 'manifest:release']]],
]
const results = []
for (const [name, [command, args]] of steps) {
  console.log(`\n=== ${name} ===`)
  const startedAt = Date.now()
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  results.push({ name, passed: result.status === 0, durationMs: Date.now() - startedAt })
  if (result.status !== 0) break
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const releaseLabel = `V${packageJson.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const report = { version: packageJson.version, generatedAt: new Date().toISOString(), passed: results.length === steps.length && results.every((item) => item.passed), results }
fs.writeFileSync(path.join(root, `HOMOLOGATION-REPORT-${releaseLabel}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(`\nHomologação: ${report.passed ? 'APROVADA' : 'REPROVADA'}`)
if (!report.passed) process.exit(1)
