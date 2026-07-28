import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const releaseLabel = `V${pkg.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const commands = [
  ['node', ['scripts/source_of_truth_guard.mjs']],
  ['node', ['scripts/architecture_guard.mjs']],
  ['node', ['scripts/source_syntax_audit.mjs']],
  ['node', ['scripts/database_contract_audit.mjs']],
  ['node', ['scripts/production_readiness.mjs']],
  ['node', ['scripts/backup_restore_dry_run.mjs']],
  ['node', ['scripts/connect_integration_audit.mjs']],
  ['node', ['scripts/extension_center_audit.mjs']],
  ['node', ['scripts/test-registry-independent.mjs']],
  ['node', ['scripts/build-registry-independent.mjs']],
  ['node', ['scripts/build-standalone.mjs']],
  ['node', ['scripts/release_audit.mjs']],
  ['node', ['scripts/preflight.mjs']],
  ['node', ['scripts/release_manifest.mjs']],
]
const results = []
for (const [command, args] of commands) {
  const startedAt = Date.now()
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  results.push({ command: [command, ...args].join(' '), status: result.status, durationMs: Date.now() - startedAt })
  if (result.status !== 0) {
    fs.writeFileSync(path.join(root, `PORTABLE-HOMOLOGATION-${releaseLabel}.json`), JSON.stringify({ passed: false, generatedAt: new Date().toISOString(), results }, null, 2) + '\n')
    process.exit(result.status || 1)
  }
}
fs.writeFileSync(path.join(root, `PORTABLE-HOMOLOGATION-${releaseLabel}.json`), JSON.stringify({ passed: true, generatedAt: new Date().toISOString(), results }, null, 2) + '\n')
console.log(`Homologação portátil concluída: ${results.length}/${results.length} etapas aprovadas.`)
