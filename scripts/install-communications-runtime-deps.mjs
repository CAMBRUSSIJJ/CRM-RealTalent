import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { COMMUNICATIONS_RUNTIME_DIR, communicationsRuntimeDependenciesPresent } from './communications-runtime-deps.mjs'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

if (communicationsRuntimeDependenciesPresent()) {
  console.log('COMM_RUNTIME_OK: dependências de Comunicação já instaladas.')
  process.exit(0)
}

fs.mkdirSync(COMMUNICATIONS_RUNTIME_DIR, { recursive: true })
console.log('Instalando runtime isolado de Comunicação...')
const result = spawnSync(npmBin, ['install', '--no-fund', '--no-audit', '--package-lock=false', '--omit=dev'], {
  cwd: COMMUNICATIONS_RUNTIME_DIR,
  stdio: 'inherit',
  env: process.env,
})
if (result.status !== 0) process.exit(result.status || 1)
if (!communicationsRuntimeDependenciesPresent()) {
  console.error('ERRO: runtime de Comunicação permaneceu incompleto após npm install.')
  process.exit(2)
}
console.log('COMM_RUNTIME_OK: runtime isolado instalado em runtime/communications/node_modules.')
