import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { inspectPort, listCommunicationsProcesses, stopStaleCommunicationsProcesses, tailFile } from './runtime-communications-recovery.mjs'
import { listConnectProcesses, stopStaleConnectProcesses, connectDiagnostics } from './runtime-connect-recovery.mjs'
import { communicationsRuntimeDependenciesPresent } from './communications-runtime-deps.mjs'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
process.chdir(ROOT)

const RELEASE = '101.11.3'
const RELEASE_NAME = 'Actionable Pipeline Experience'
const HOTFIX = 'H19.13'
const HOTFIX_NAME = 'WhatsApp Work Management'
const UI_COHESION = 'H20.7'
const UI_COHESION_NAME = 'Global UI & Product Cohesion'
const UI_HOTFIX = 'H20.7-H1'
const UI_HOTFIX_NAME = 'Appearance & Sidebar Truth'
const COMM_EXPECTED_VERSION = '101.8.4-h13'
const CRM_PORT = Number(process.env.PORT || 4188)
const CONNECT_PORT = Number(process.env.REALTALENT_CONNECT_PORT || 3001)
const COMM_PORT = Number(process.env.REALTALENT_COMMUNICATIONS_PORT || 3002)
const PROSPECTING_PORT = Number(process.env.REALTALENT_PROSPECTING_AGENT_PORT || 4319)
const CONTROL_PORT = Number(process.env.REALTALENT_RUNTIME_CONTROL_PORT || 3003)
const children = new Set()
let controlServer = null
let shuttingDown = false
let communicationsSupervisorChild = null
let communicationsWatchTimer = null
let communicationsUnhealthyCount = 0
let communicationsRecoveryPromise = null

const isWindows = process.platform === 'win32'
const npmBin = isWindows ? 'npm.cmd' : 'npm'

function log(msg = '') { process.stdout.write(`${msg}\n`) }
function fail(msg, code = 1) { console.error(`ERRO: ${msg}`); process.exit(code) }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
function exists(p) { return fs.existsSync(path.join(ROOT, p)) }
function abs(p) { return path.join(ROOT, p) }

function help() {
  log(`RealTalent CRM V${RELEASE}-${HOTFIX} — ${RELEASE_NAME} · ${HOTFIX_NAME}`)
  log('')
  log('  npm run start / ./start-linux.sh     abertura rápida e serviços locais')
  log('  npm run start:dev / --dev            Vite dev + serviços locais')
  log('  npm run verify / --verify            gates completos + npm audit + runtime')
  log('  npm run rebuild / --rebuild          rebuild controlado')
  log('  npm run doctor / --doctor            diagnóstico sem iniciar a UI')
  log('  --preview-only                       somente preview do build existente')
  log('  ./start-linux.sh --legacy            launcher Bash anterior (fallback)')
}

function parseMode(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return 'help'
  if (argv.includes('--verify')) return 'verify'
  if (argv.includes('--rebuild')) return 'rebuild'
  if (argv.includes('--dev')) return 'dev'
  if (argv.includes('--doctor')) return 'doctor'
  if (argv.includes('--preview-only')) return 'preview-only'
  if (argv.includes('--fast')) return 'fast'
  const unknown = argv.find(x => x.startsWith('-'))
  if (unknown) fail(`opção desconhecida: ${unknown}. Use --help.` , 2)
  return 'fast'
}

function requireNode22() {
  const major = Number(process.versions.node.split('.')[0])
  if (major !== 22) fail(`esta versão requer Node.js 22.x. Encontrado: ${process.version}`)
  const npm = spawnSync(npmBin, ['--version'], { cwd: ROOT, encoding: 'utf8' })
  if (npm.status !== 0) fail('npm não foi encontrado no PATH.')
}

function run(cmd, args = [], options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    shell: false,
  })
  if (options.capture) return result
  if (result.status !== 0 && !options.allowFailure) process.exit(result.status || 1)
  return result
}

function npm(args, options = {}) { return run(npmBin, args, options) }
function node(script, args = [], options = {}) { return run(process.execPath, [script, ...args], options) }

function readEnvFile(file) {
  if (!fs.existsSync(file)) return new Map()
  const out = new Map()
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 1) continue
    out.set(line.slice(0, idx).trim(), line.slice(idx + 1))
  }
  return out
}

function ensureEnvLocal() {
  const file = abs('.env.local')
  const current = readEnvFile(file)
  current.set('VITE_DATA_MODE', current.get('VITE_DATA_MODE') || 'local')
  current.set('VITE_RELEASE_CHANNEL', 'official-communications')
  current.set('VITE_COMMUNICATIONS_GATEWAY_URL', '/__rt/communications')
  current.set('REALTALENT_CONNECT_PROVIDER', current.get('REALTALENT_CONNECT_PROVIDER') || 'twilio_bridge')
  current.set('REALTALENT_CONNECT_HOST', '127.0.0.1')
  current.set('REALTALENT_CONNECT_PORT', String(CONNECT_PORT))
  current.set('REALTALENT_DEFAULT_COUNTRY_CODE', current.get('REALTALENT_DEFAULT_COUNTRY_CODE') || '55')

  const preservedComments = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.trim().startsWith('#'))
    : [
        '# RealTalent CRM local runtime',
        '# Connect fica em loopback por padrão. Libere LAN apenas em Configurações → Ligações.',
        '# Credenciais opcionais (Twilio/Google) podem ser adicionadas abaixo.',
      ]
  const lines = [...preservedComments, ...[...current.entries()].map(([k, v]) => `${k}=${v}`)]
  fs.writeFileSync(file, `${lines.join('\n')}\n`)
}

function copyIfExists(src, dst) {
  if (!fs.existsSync(src) || fs.existsSync(dst)) return false
  fs.cpSync(src, dst, { recursive: true })
  return true
}

function previousReleaseCandidates() {
  const parent = path.dirname(ROOT)
  let entries = []
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true })
      .filter(x => x.isDirectory() && /^RealTalent-CRM-V/.test(x.name) && path.join(parent, x.name) !== ROOT)
      .map(x => ({ name: x.name, path: path.join(parent, x.name), mtime: fs.statSync(path.join(parent, x.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
  } catch {}
  const preferred = [
    'RealTalent-CRM-V101.11.3-H15-Strict-Prospecting-Scope-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H14-UI1-Commercial-Management-UI-Recovery-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H14-Commercial-Management-Foundation-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H13-Product-Readiness-Revenue-Bridge-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H12-Commercial-Product-Studio-Catalog-First-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H11-Proposal-Catalog-Pricing-3-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H10-Progressive-Data-Virtualized-Canvas-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H9-Playbook-Performance-Interactive-Whiteboard-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H8-Playbook-Canvas-Autonomy-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H7-Playbook-Visual-Conversation-Workspace-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H6-Playbook-Studio-2-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H5-Calling-Essential-Context-Goal-Link-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H4-Calling-Visual-Hierarchy-Mind-Map-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H3-Calling-Workspace-2-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H2-Runtime-Service-Recovery-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-H1-Communications-Gateway-Recovery-Linux-Launcher',
    'RealTalent-CRM-V101.11.3-Actionable-Pipeline-Experience-Linux-Launcher',
    'RealTalent-CRM-V101.11.2-Teams-Tasks-Foundation-Linux-Launcher',
    'RealTalent-CRM-V101.11.1-H5-Full-Canvas-Orbit-Field-Linux-Launcher',
    'RealTalent-CRM-V101.11.1-H4-Transparent-Logo-Optimized-Motion-Linux-Launcher',
    'RealTalent-CRM-V101.11.1-H3-Official-Logo-Motion-Linux-Launcher',
    'RealTalent-CRM-V101.11.1-H2-Cinematic-Login-Brand-Motion-Linux-Launcher',
    'RealTalent-CRM-V101.11.1-H1-Login-Gate-Logout-Linux-Launcher',
    'RealTalent-CRM-V101.11.1-Login-Experience-Reliability-Linux-Launcher',
    'RealTalent-CRM-V101.11.0-Communications-Architecture-Linux-Launcher',
    'RealTalent-CRM-V101.10.9-H5-Dead-CSS-Removal-Linux-Launcher',
    'RealTalent-CRM-V101.10.9-H4-Garimpo-Automations-CSS-Consolidation-Linux-Launcher',
    'RealTalent-CRM-V101.10.9-H3-Calling-Connect-CSS-Consolidation-Linux-Launcher',
    'RealTalent-CRM-V101.10.9-H2-Contacts-Account360-CSS-Consolidation-Linux-Launcher',
    'RealTalent-CRM-V101.10.9-H1-Global-UI-Consolidation-Linux-Launcher',
    'RealTalent-CRM-V101.10.9-CSS-Design-System-Consolidation-Linux-Launcher',
    'RealTalent-CRM-V101.10.8-Runtime-Developer-Experience-Linux-Launcher',
    'RealTalent-CRM-V101.10.7-H1-Lockfile-Recovery-Linux-Launcher',
    'RealTalent-CRM-V101.10.7-Security-Runtime-Foundation-Linux-Launcher',
    'RealTalent-CRM-V101.10.6-H2-Global-Selection-Ownership-Fix-Linux-Launcher',
  ].map(name => path.join(parent, name))
  return [...new Set([...preferred, ...entries.map(x => x.path)])].filter(fs.existsSync)
}

function migrateLocalState() {
  const candidates = previousReleaseCandidates()
  if (!exists('.realtalent-whatsapp-browser') && !exists('.realtalent-communications-store.json')) {
    for (const candidate of candidates) {
      const hasComm = fs.existsSync(path.join(candidate, '.realtalent-whatsapp-browser')) || fs.existsSync(path.join(candidate, '.realtalent-communications-store.json'))
      if (!hasComm) continue
      log(`Sessão de comunicações encontrada em ${path.basename(candidate)}. Migrando...`)
      copyIfExists(path.join(candidate, '.realtalent-whatsapp-browser'), abs('.realtalent-whatsapp-browser'))
      for (const file of ['.realtalent-communications-store.json', '.realtalent-communications.key', '.realtalent-communications-config.json', '.env.local']) {
        copyIfExists(path.join(candidate, file), abs(file))
      }
      log('✓ Sessão/configuração de comunicações preservada.')
      break
    }
  }
  if (!exists('.realtalent-prospecting-agent')) {
    for (const candidate of candidates) {
      if (copyIfExists(path.join(candidate, '.realtalent-prospecting-agent'), abs('.realtalent-prospecting-agent'))) {
        log(`✓ Histórico/fila do Garimpo preservados de ${path.basename(candidate)}.`)
        break
      }
    }
  }
}

function readRuntimeToken() {
  const file = abs('.realtalent-runtime-token')
  if (!fs.existsSync(file)) return ''
  const token = fs.readFileSync(file, 'utf8').trim()
  return token.length >= 32 ? token : ''
}

function ensureRuntimeToken() {
  const file = abs('.realtalent-runtime-token')
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').trim().length < 32) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
    try { fs.chmodSync(file, 0o600) } catch {}
  }
  const token = fs.readFileSync(file, 'utf8').trim()
  if (token.length < 32) fail('token local de runtime inválido; remova .realtalent-runtime-token e tente novamente.')
  process.env.REALTALENT_RUNTIME_TOKEN = token
  return token
}

function lockHash() {
  if (!exists('package-lock.json')) return ''
  return crypto.createHash('sha256').update(fs.readFileSync(abs('package-lock.json'))).digest('hex')
}

function lockfileValid() {
  const r = node('scripts/lockfile-integrity.mjs', ['--quiet'], { capture: true })
  return r.status === 0
}

function coreDepsPresent() {
  const check = spawnSync(process.execPath, ['-e', "require.resolve('vite');require.resolve('react');require.resolve('@supabase/supabase-js')"], { cwd: ROOT, stdio: 'ignore' })
  return check.status === 0
}

function runtimeDepsPresent() {
  return coreDepsPresent() && communicationsRuntimeDependenciesPresent()
}

function ensureCommunicationsRuntimeDependencies({ allowInstall = true } = {}) {
  if (communicationsRuntimeDependenciesPresent()) return true
  if (!allowInstall) return false
  log('Runtime de Comunicação ausente: instalando dependências isoladas...')
  const result = node('scripts/install-communications-runtime-deps.mjs', [], { capture: true })
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    fail('instalação do runtime isolado de Comunicação falhou.')
  }
  process.stdout.write(result.stdout || '')
  if (!communicationsRuntimeDependenciesPresent()) fail('runtime de Comunicação permaneceu incompleto após instalação.')
  return true
}

function repairLockfile() {
  log('⚠ package-lock.json ausente ou fora de sincronia com package.json.')
  log('  Reconstruindo uma única vez com npm install...')
  fs.rmSync(abs('node_modules'), { recursive: true, force: true })
  npm(['install', '--no-fund', '--no-audit'])
  if (!lockfileValid()) fail('package-lock.json continuou inconsistente após npm install.')
  log('✓ package-lock.json reconstruído e sincronizado.')
}

function ensureDependencies({ allowInstall = true } = {}) {
  let repaired = false
  if (!lockfileValid()) {
    if (!allowInstall) return false
    repairLockfile()
    repaired = true
  }
  const stamp = abs('.realtalent-node-modules.lockhash')
  let hash = lockHash()
  const stampOk = fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === hash
  if (coreDepsPresent() && (stampOk || repaired)) {
    fs.writeFileSync(stamp, hash)
    if (repaired) log('✓ Dependências core instaladas durante a recuperação do lockfile.')
    ensureCommunicationsRuntimeDependencies({ allowInstall })
    return true
  }
  if (!allowInstall) return false

  log('Dependências ausentes ou lockfile alterado: executando npm ci...')
  fs.rmSync(abs('node_modules'), { recursive: true, force: true })
  const ci = npm(['ci', '--no-fund', '--no-audit'], { capture: true })
  if (ci.status !== 0) {
    const combined = `${ci.stdout || ''}\n${ci.stderr || ''}`
    if (/package\.json and package-lock\.json.*in sync|npm ci.*only install packages|Missing: .* from lock file|EUSAGE/i.test(combined)) {
      process.stderr.write(ci.stderr || '')
      repairLockfile()
      hash = lockHash()
    } else {
      process.stdout.write(ci.stdout || '')
      process.stderr.write(ci.stderr || '')
      fail('npm ci falhou por um motivo diferente de inconsistência do lockfile.')
    }
  } else {
    process.stdout.write(ci.stdout || '')
    log('✓ Dependências reproduzidas a partir do package-lock.json.')
  }
  if (!coreDepsPresent()) fail('dependências core não ficaram completas após a instalação.')
  fs.writeFileSync(stamp, lockHash())
  ensureCommunicationsRuntimeDependencies({ allowInstall })
  return true
}

function hasDistMarker() {
  const f = abs('dist/index.html')
  return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('V101.11.1 — Login Experience & Reliability') && fs.readFileSync(f, 'utf8').includes('V101.11.1-H1 — Login Gate & Logout') && fs.readFileSync(f, 'utf8').includes('V101.11.1-H2 — Cinematic Login & Brand Motion') && fs.readFileSync(f, 'utf8').includes('V101.11.1-H3 — Official Logo Motion') && fs.readFileSync(f, 'utf8').includes('V101.11.1-H4 — Transparent Logo & Optimized Motion') && fs.readFileSync(f, 'utf8').includes('V101.11.1-H5 — Full Canvas & Orbit Field') && fs.readFileSync(f, 'utf8').includes('V101.11.2 — Teams & Tasks Foundation') && fs.readFileSync(f, 'utf8').includes('V101.11.3 — Actionable Pipeline Experience') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H1 — Communications Gateway Recovery') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H2 — Runtime Service Recovery') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H3 — Calling Workspace 2.0') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H4 — Calling Visual Hierarchy & Mind Map') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H5 — Calling Essential Context & Goal Link') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H6 — Playbook Studio 2.0') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H7 — Playbook Visual Conversation Workspace') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H8 — Playbook Canvas Autonomy') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H9 — Playbook Performance & Interactive Whiteboard') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H10 — Progressive Data & Virtualized Canvas') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H11 — Proposal & Catalog Pricing 3.0') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H12 — Commercial Product Studio & Catalog-First Proposals') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H13 — Product Readiness & Revenue Bridge') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H14 — Commercial Management Foundation') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H15 — Strict Prospecting Scope') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.2 — Communication Workspace & WhatsApp Connection Center') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.3 — WhatsApp Sales Workspace') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.4 — Communication Focus Experience') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.5 — Channel Workspaces & Collaborative Tasks') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.6 — WhatsApp Native UX & Follow-up Focus') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.7 — WhatsApp Pure Chat') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.8 — WhatsApp Continuous Chat & Settings Control Center') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.8-H1 — WhatsApp Runtime Recovery') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.9 — WhatsApp Reliable Messaging & Groups') && fs.readFileSync(f, 'utf8').includes('V101.11.3-H19.10 — Rich Messaging & Reliable Delivery')
}

function verifyCommunicationSourceLineage() {
  const page = fs.readFileSync(abs('src/features/communications/communications-page.tsx'), 'utf8')
  const chat = fs.readFileSync(abs('src/features/communications/whatsapp-chat-panel.tsx'), 'utf8')
  const required = [
    'V101.11.3-H19.7 — WhatsApp Pure Chat',
    'V101.11.3-H19.8 — WhatsApp Continuous Chat & Settings Control Center',
    'WhatsAppChatPanel',
    'communication-channel-switch',
  ]
  for (const marker of required) if (!page.includes(marker)) fail(`source de Comunicação regrediu; marker ausente: ${marker}`)
  const inboxActionMarkers = [
    'whatsapp-inbox-create-actions is-h1911',
    'whatsapp-inbox-create-actions is-h207h2',
  ]
  if (!inboxActionMarkers.some((marker) => page.includes(marker))) {
    fail(`source de Comunicação regrediu; marker de ações da inbox ausente: ${inboxActionMarkers.join(' ou ')}`)
  }
  if (!chat.includes('whatsapp-chat__composer--pure')) fail('source de WhatsApp regrediu: Pure Chat ausente.')
  if (chat.includes('Respostas rápidas') || chat.includes('Criar follow-up') || chat.includes('Salvar como nota')) fail('source de WhatsApp regrediu: controles comerciais antigos voltaram ao corpo do chat.')
}

function previewProcessInfo(pid) {
  if (process.platform !== 'linux' || !Number(pid)) return null
  try {
    const cwd = fs.readlinkSync(`/proc/${pid}/cwd`)
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
    const trusted = /^RealTalent-CRM-V/i.test(path.basename(cwd)) && /vite(?:\.js)?\s+(preview|--host)|vite\/bin\/vite\.js/.test(cmdline)
    return { pid:Number(pid), cwd, cmdline, trusted }
  } catch { return null }
}

async function recoverPreviewPort() {
  const owner = inspectPort(CRM_PORT)
  if (!owner.busy) return
  const infos = owner.pids.map(previewProcessInfo).filter(Boolean)
  const trusted = infos.filter(item => item.trusted)
  if (!trusted.length) {
    const detail = owner.lines.slice(0,3).map(line => line.trim()).join(' | ')
    fail(`porta ${CRM_PORT} ocupada por processo não reconhecido; nada foi encerrado. ${detail}`)
  }
  for (const item of trusted) {
    log(`↻ Preview RealTalent anterior detectado pid=${item.pid} (${item.cwd}). Encerrando com segurança...`)
    await terminatePid(item.pid)
  }
  await sleep(700)
  const after = inspectPort(CRM_PORT)
  if (after.busy) fail(`porta ${CRM_PORT} continua ocupada após encerrar preview RealTalent anterior.`)
  log(`✓ Porta ${CRM_PORT} liberada para a H19.13.`)
}

function verifyDistLineage() {
  const f = abs('dist/index.html')
  if (!fs.existsSync(f)) fail('dist/index.html não existe.')
  const html = fs.readFileSync(f, 'utf8')
  const required = [
    'Connect One-Tap para iPhone',
    'V101.8.4-H4 — WhatsApp QR Local',
    'V101.8.4-H15 — WhatsApp Contact Identity',
    'V101.9.8 — Design System Consolidation',
    'V101.10.3-H9 — Territory Engine 2.0',
    'V101.10.4 — Local Discovery Experience',
    'V101.10.6-H2 — Global Selection & Ownership Fix',
    'V101.10.7 — Security & Runtime Foundation',
    'V101.10.8 — Runtime & Developer Experience Consolidation',
    'V101.11.0 — Communications Architecture',
    'V101.11.1 — Login Experience & Reliability',
    'V101.11.1-H1 — Login Gate & Logout',
    'V101.11.1-H2 — Cinematic Login & Brand Motion',
    'V101.11.1-H3 — Official Logo Motion',
    'V101.11.1-H4 — Transparent Logo & Optimized Motion',
    'V101.11.1-H5 — Full Canvas & Orbit Field',
    'V101.11.2 — Teams & Tasks Foundation',
    'V101.11.3 — Actionable Pipeline Experience',
    'V101.11.3-H1 — Communications Gateway Recovery',
    'V101.11.3-H2 — Runtime Service Recovery',
    'V101.11.3-H3 — Calling Workspace 2.0',
    'V101.11.3-H4 — Calling Visual Hierarchy & Mind Map',
    'V101.11.3-H5 — Calling Essential Context & Goal Link',
    'V101.11.3-H6 — Playbook Studio 2.0',
    'V101.11.3-H7 — Playbook Visual Conversation Workspace',
    'V101.11.3-H8 — Playbook Canvas Autonomy',
    'V101.11.3-H9 — Playbook Performance & Interactive Whiteboard',
    'V101.11.3-H10 — Progressive Data & Virtualized Canvas',
    'V101.11.3-H11 — Proposal & Catalog Pricing 3.0',
    'V101.11.3-H12 — Commercial Product Studio & Catalog-First Proposals',
    'V101.11.3-H13 — Product Readiness & Revenue Bridge',
    'V101.11.3-H14 — Commercial Management Foundation',
    'V101.11.3-H15 — Strict Prospecting Scope',
    'V101.11.3-H19.2 — Communication Workspace & WhatsApp Connection Center',
    'V101.11.3-H19.3 — WhatsApp Sales Workspace',
    'V101.11.3-H19.4 — Communication Focus Experience',
    'V101.11.3-H19.5 — Channel Workspaces & Collaborative Tasks',
    'V101.11.3-H19.6 — WhatsApp Native UX & Follow-up Focus',
    'V101.11.3-H19.7 — WhatsApp Pure Chat',
    'V101.11.3-H19.8 — WhatsApp Continuous Chat & Settings Control Center',
    'V101.11.3-H19.8-H1 — WhatsApp Runtime Recovery',
    'V101.11.3-H19.9 — WhatsApp Reliable Messaging & Groups',
    'V101.11.3-H19.10 — Rich Messaging & Reliable Delivery',
    'V101.11.3-H19.10-H1 — Media Delivery Fix',
    'V101.11.3-H19.11 — WhatsApp Contact & Message Normalization',
    'V101.10.9 — CSS & Design System Consolidation',
    'V101.10.9-H4 — Garimpo & Automations CSS Consolidation',
    'V101.10.9-H5 — Dead CSS Removal',
  ]
  if (html.includes('Carregando RealTalent CRM')) fail('foi gerado o HTML legado.')
  if (html.includes('esm.sh')) fail('build dependente do CDN legado esm.sh.')
  for (const marker of required) if (!html.includes(marker)) fail(`dist/index.html perdeu marker: ${marker}`)
}

async function probe(url, { token, expectedVersion } = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 1200)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: token ? { 'x-realtalent-runtime-token': token } : {} })
    if (!res.ok) return { ok: false, status: res.status }
    const data = await res.json().catch(() => ({}))
    if (expectedVersion && data.version !== expectedVersion) return { ok: false, status: res.status, data, wrongVersion: true }
    return { ok: true, status: res.status, data }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  } finally { clearTimeout(t) }
}

async function waitFor(url, options = {}, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const result = await probe(url, options)
    if (result.ok) return result
    await sleep(500)
  }
  return probe(url, options)
}

function spawnService(name, script, env, logFile) {
  const fd = fs.openSync(abs(logFile), 'a')
  const child = spawn(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', fd, fd],
    detached: false,
  })
  child.__rtName = name
  child.__rtFd = fd
  children.add(child)
  child.on('exit', () => {
    children.delete(child)
    try { fs.closeSync(fd) } catch {}
  })
  return child
}

async function terminatePid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return
  try {
    if (isWindows) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(pid, 'SIGTERM')
  } catch {}
}

function appendRuntimeLogMarker(logFile, label) {
  try {
    fs.appendFileSync(abs(logFile), `\n===== ${new Date().toISOString()} ${label} V${RELEASE}-${HOTFIX} =====\n`)
  } catch {}
}

function spawnCommunicationsSupervisor(token, label = 'START COMMUNICATIONS') {
  appendRuntimeLogMarker('.realtalent-communications.log', label)
  const child = spawnService('communications', 'scripts/realtalent-communications-supervisor.mjs', {
    REALTALENT_CRM_PORT: String(CRM_PORT),
    REALTALENT_COMMUNICATIONS_HOST: '127.0.0.1',
    REALTALENT_COMMUNICATIONS_PORT: String(COMM_PORT),
    REALTALENT_RUNTIME_TOKEN: token,
    REALTALENT_COMMUNICATIONS_EXPECTED_VERSION: COMM_EXPECTED_VERSION,
  }, '.realtalent-communications.log')
  communicationsSupervisorChild = child
  child.once('exit', () => { if (communicationsSupervisorChild === child) communicationsSupervisorChild = null })
  return child
}

async function recoverCommunicationsRuntime(token, { reason = 'manual' } = {}) {
  if (communicationsRecoveryPromise) return communicationsRecoveryPromise
  communicationsRecoveryPromise = (async () => {
    const healthUrl = `http://127.0.0.1:${COMM_PORT}/api/communications/health`
    const before = await probe(healthUrl, { token, expectedVersion: COMM_EXPECTED_VERSION })
    if (before.ok) {
      communicationsUnhealthyCount = 0
      return { ok: true, recovered: false, reason: 'already-healthy', health: before.data }
    }
    log(`↻ Recuperando Communications Gateway (${reason})...`)
    const stopped = await stopStaleCommunicationsProcesses({ root: ROOT, port: COMM_PORT, terminatePid, sleep, log })
    if (stopped.stopped.length) await sleep(500)
    const owner = inspectPort(COMM_PORT)
    if (owner.busy) {
      return { ok: false, recovered: false, reason: 'port-busy', diagnostics: { port: owner, processes: listCommunicationsProcesses({ root: ROOT }), logTail: tailFile(abs('.realtalent-communications.log'), 35) } }
    }
    spawnCommunicationsSupervisor(token, `RECOVER COMMUNICATIONS ${String(reason).toUpperCase()}`)
    const ready = await waitFor(healthUrl, { token, expectedVersion: COMM_EXPECTED_VERSION }, 50)
    if (ready.ok) {
      communicationsUnhealthyCount = 0
      log(`✓ Communications Gateway recuperado: ${ready.data.version}`)
      return { ok: true, recovered: true, reason, health: ready.data }
    }
    return { ok: false, recovered: false, reason: 'readiness-timeout', lastProbe: ready, diagnostics: { port: inspectPort(COMM_PORT), processes: listCommunicationsProcesses({ root: ROOT }), logTail: tailFile(abs('.realtalent-communications.log'), 35) } }
  })()
  try { return await communicationsRecoveryPromise } finally { communicationsRecoveryPromise = null }
}

function startCommunicationsWatchdog(token) {
  if (communicationsWatchTimer) return
  communicationsWatchTimer = setInterval(async () => {
    if (shuttingDown || communicationsRecoveryPromise) return
    const result = await probe(`http://127.0.0.1:${COMM_PORT}/api/communications/health`, { token, expectedVersion: COMM_EXPECTED_VERSION })
    if (result.ok) { communicationsUnhealthyCount = 0; return }
    communicationsUnhealthyCount += 1
    if (communicationsUnhealthyCount < 3) return
    communicationsUnhealthyCount = 0
    await recoverCommunicationsRuntime(token, { reason: 'watchdog' }).catch(error => log(`⚠ Recuperação automática de Communications falhou: ${error?.message || error}`))
  }, 5000)
  communicationsWatchTimer.unref?.()
}

function printCommunicationsDiagnostics(result = {}) {
  const owner = inspectPort(COMM_PORT)
  log('')
  log('⚠ Communications Gateway indisponível. O CRM continuará em modo degradado.')
  if (result?.status) log(`   Último HTTP: ${result.status}${result.wrongVersion ? ' (versão inesperada)' : ''}`)
  if (result?.data?.version) log(`   Gateway detectado: ${result.data.version}; esperado: ${COMM_EXPECTED_VERSION}`)
  if (result?.error) log(`   Probe: ${result.error}`)
  if (owner.busy) {
    log(`   Porta ${COMM_PORT} está ocupada${owner.pids.length ? ` por PID(s) ${owner.pids.join(', ')}` : ''}.`)
    for (const line of owner.lines.slice(0, 3)) log(`   ${line.trim()}`)
  } else {
    log(`   Porta ${COMM_PORT}: sem listener detectado.`)
  }
  const tail = tailFile(abs('.realtalent-communications.log'), 50)
  if (tail) {
    log('   --- últimas linhas de .realtalent-communications.log ---')
    for (const line of tail.split('\n')) log(`   ${line}`)
    log('   --- fim do log ---')
  } else {
    log('   Log ainda vazio: .realtalent-communications.log')
  }
  log('   Comunicações ficam temporariamente indisponíveis; Pipeline, Contatos, Tarefas e demais módulos continuam utilizáveis.')
  log('')
}

async function prepareCommunicationsRuntime(token) {
  const url = `http://127.0.0.1:${COMM_PORT}/api/communications/health`
  const existing = await probe(url, { token, expectedVersion: COMM_EXPECTED_VERSION })
  if (existing.ok) {
    log(`✓ Communications Gateway já está ativo: ${existing.data.version}`)
    return { reuse: true, blocked: false, existing }
  }

  const discovered = await probe(url)
  const staleProcesses = await stopStaleCommunicationsProcesses({
    root: ROOT,
    port: COMM_PORT,
    terminatePid,
    sleep,
    log,
  })
  if (staleProcesses.stopped.length) {
    await sleep(450)
    log(`✓ ${staleProcesses.stopped.length} processo(s) antigo(s) de Communications encerrado(s).`)
  }

  const port = inspectPort(COMM_PORT)
  if (port.busy) {
    // If it is a healthy gateway that uses another runtime token, we do not kill an
    // unknown listener. Start the CRM degraded and expose the owner in diagnostics.
    log(`⚠ Porta ${COMM_PORT} continua ocupada após a recuperação; novo Gateway não será iniciado.`)
    if (discovered?.status) log(`   Serviço existente respondeu HTTP ${discovered.status}.`)
    return { reuse: false, blocked: true, port, discovered }
  }
  return { reuse: false, blocked: false, port, discovered }
}

function printConnectDiagnostics(result = {}) {
  const diagnostics = connectDiagnostics({ root: ROOT, port: CONNECT_PORT })
  log('')
  log('⚠ RealTalent Connect indisponível. O CRM continuará em modo degradado.')
  if (result?.status) log(`   Último HTTP: ${result.status}${result.wrongVersion ? ' (versão inesperada)' : ''}`)
  if (result?.data?.releaseVersion || result?.data?.version) log(`   Connect detectado: release=${result.data.releaseVersion || '-'} protocolo=${result.data.version || '-'}`)
  if (result?.error) log(`   Probe: ${result.error}`)
  if (diagnostics.port.busy) {
    log(`   Porta ${CONNECT_PORT} está ocupada${diagnostics.port.pids.length ? ` por PID(s) ${diagnostics.port.pids.join(', ')}` : ''}.`)
    for (const line of diagnostics.port.lines.slice(0, 3)) log(`   ${line.trim()}`)
  } else log(`   Porta ${CONNECT_PORT}: sem listener detectado.`)
  for (const item of diagnostics.processes.slice(0,5)) log(`   Connect pid=${item.pid} cwd=${item.cwd || '-'}${item.sameRoot ? ' [esta release]' : ''}`)
  if (diagnostics.tail) {
    log('   --- últimas linhas de .realtalent-connect.log ---')
    for (const line of diagnostics.tail.split('\n')) log(`   ${line}`)
    log('   --- fim do log ---')
  } else log('   Log ainda vazio: .realtalent-connect.log')
  log('   Ligações/One-Tap ficam temporariamente indisponíveis; o restante do CRM continua utilizável.')
  log('')
}

async function prepareConnectRuntime(token) {
  const url = `http://127.0.0.1:${CONNECT_PORT}/api/voice/v1/health`
  const existing = await probe(url, { token, expectedVersion: '101.4.0' })
  if (existing.ok) {
    log(`✓ RealTalent Connect já está ativo: release ${existing.data.releaseVersion || '-'} · protocolo ${existing.data.version || '-'}`)
    return { reuse:true, blocked:false, existing }
  }
  const discovered = await probe(url)
  const stale = await stopStaleConnectProcesses({ root:ROOT, port:CONNECT_PORT, terminatePid, sleep, log })
  if (stale.stopped.length) { await sleep(450); log(`✓ ${stale.stopped.length} processo(s) antigo(s) do Connect encerrado(s).`) }
  const port=inspectPort(CONNECT_PORT)
  if (port.busy) {
    log(`⚠ Porta ${CONNECT_PORT} continua ocupada após a recuperação; novo Connect não será iniciado.`)
    if (discovered?.status) log(`   Serviço existente respondeu HTTP ${discovered.status}.`)
    return { reuse:false, blocked:true, port, discovered }
  }
  return { reuse:false, blocked:false, port, discovered }
}

async function startServices(token) {
  log('3/4 — Iniciando serviços locais: Connect + Communications Gateway + Prospecting Agent...')
  const connectPreparation = await prepareConnectRuntime(token)
  let connect = null
  if (!connectPreparation.reuse && !connectPreparation.blocked) {
    appendRuntimeLogMarker('.realtalent-connect.log', 'START CONNECT')
    connect = spawnService('connect', 'scripts/realtalent-connect-server.mjs', {
      REALTALENT_CRM_PORT: String(CRM_PORT), REALTALENT_CONNECT_HOST: '127.0.0.1', REALTALENT_CONNECT_PORT: String(CONNECT_PORT), REALTALENT_RUNTIME_TOKEN: token,
    }, '.realtalent-connect.log')
  }

  const commPreparation = await prepareCommunicationsRuntime(token)
  let comm = null
  if (!commPreparation.reuse && !commPreparation.blocked) comm = spawnCommunicationsSupervisor(token)

  let prospectingChild = null
  const existing = await probe(`http://127.0.0.1:${PROSPECTING_PORT}/api/prospecting-agent/health`)
  if (existing.ok && existing.data?.version !== '101.10.4' && Number(existing.data?.pid)) {
    log(`↻ Agent anterior detectado (${existing.data.version}); substituindo pelo runtime atual...`)
    await terminatePid(Number(existing.data.pid))
    await sleep(500)
  }
  const after = await probe(`http://127.0.0.1:${PROSPECTING_PORT}/api/prospecting-agent/health`, { expectedVersion: '101.10.4' })
  if (after.ok) {
    log('✓ Prospecting Agent já está ativo via serviço local/systemd.')
  } else {
    prospectingChild = spawnService('prospecting', 'scripts/realtalent-prospecting-agent.mjs', {
      REALTALENT_PROSPECTING_AGENT_HOST: '127.0.0.1', REALTALENT_PROSPECTING_AGENT_PORT: String(PROSPECTING_PORT),
    }, '.realtalent-prospecting-agent.log')
  }

  let commReady = commPreparation.reuse
    ? commPreparation.existing
    : commPreparation.blocked
      ? { ok: false, status: commPreparation.discovered?.status, data: commPreparation.discovered?.data, error: 'porta ocupada' }
      : await waitFor(`http://127.0.0.1:${COMM_PORT}/api/communications/health`, { token, expectedVersion: COMM_EXPECTED_VERSION }, 20)
  if (!commReady.ok && !commPreparation.blocked) {
    const recovery = await recoverCommunicationsRuntime(token, { reason: 'startup-readiness' })
    if (recovery.ok) commReady = { ok: true, status: 200, data: recovery.health }
  }
  if (!commReady.ok) {
    printCommunicationsDiagnostics(commReady)
    log('   O supervisor continuará ativo e o watchdog tentará recuperar Communications automaticamente.')
  } else {
    log(`✓ Communications Gateway: ${commReady.data.version} ativo`)
    log(`   Gmail OAuth: ${commReady.data.providers?.google ? 'configurado' : 'execute ./configure-communications-local.sh'}`)
    log(`   Outlook OAuth: ${commReady.data.providers?.microsoft ? 'configurado' : 'execute ./configure-communications-local.sh'}`)
  }

  const prospectingReady = await waitFor(`http://127.0.0.1:${PROSPECTING_PORT}/api/prospecting-agent/health`, { expectedVersion: '101.10.4' })
  if (!prospectingReady.ok) fail('Prospecting Agent não ficou pronto. Consulte .realtalent-prospecting-agent.log')
  log(`✓ Prospecting Agent: V${prospectingReady.data.version} ativo`)

  const connectReady = connectPreparation.reuse
    ? connectPreparation.existing
    : connectPreparation.blocked
      ? { ok:false, status:connectPreparation.discovered?.status, data:connectPreparation.discovered?.data, error:'porta ocupada' }
      : await waitFor(`http://127.0.0.1:${CONNECT_PORT}/api/voice/v1/health`, { token, expectedVersion:'101.4.0' }, 20)
  if (!connectReady.ok) {
    printConnectDiagnostics(connectReady)
    if (connect && connect.exitCode === null) { try { connect.kill('SIGTERM') } catch {} }
  } else {
    log(`✓ RealTalent Connect: ${connectReady.data.configured ? 'canal de saída pronto' : 'bridge ativo; pareie o celular ou configure PSTN'}`)
    const pairing = await probe(`http://127.0.0.1:${CONNECT_PORT}/api/phone/v1/pairing`, { token })
    if (pairing.ok) log('🔒 RealTalent Phone: apenas este computador; LAN somente por ação explícita no CRM.')
    const diagnostics = await probe(`http://127.0.0.1:${CONNECT_PORT}/api/phone/v1/diagnostics`, { token })
    if (diagnostics.ok) {
      const networks = Array.isArray(diagnostics.data?.lan?.interfaces) ? diagnostics.data.lan.interfaces.length : Array.isArray(pairing.data?.lanInterfaces) ? pairing.data.lanInterfaces.length : 0
      log(`✓ Diagnóstico Connect: bridge=${Boolean(diagnostics.data?.bridge?.ok)} pairing=${Boolean(diagnostics.data?.pairingApi)} websocket=${Boolean(diagnostics.data?.realtime)}`)
      log(`   Redes detectadas: ${networks}`)
      log(`   Porta TCP: ${CONNECT_PORT} (loopback; LAN somente sob ação explícita)`)
    }
  }
  return { connect, comm, prospectingChild, communicationsReady:Boolean(commReady.ok), connectReady:Boolean(connectReady.ok) }
}

async function statusSnapshot(token) {
  const [connect, communications, prospecting] = await Promise.all([
    probe(`http://127.0.0.1:${CONNECT_PORT}/api/voice/v1/health`, { token }),
    probe(`http://127.0.0.1:${COMM_PORT}/api/communications/health`, { token }),
    probe(`http://127.0.0.1:${PROSPECTING_PORT}/api/prospecting-agent/health`),
  ])
  const services = { connect: connect.ok, communications: communications.ok, prospecting: prospecting.ok }
  const commPort = inspectPort(COMM_PORT)
  const commProcesses = listCommunicationsProcesses({ root: ROOT })
  return {
    application: 'RealTalent CRM', version: RELEASE, hotfix: HOTFIX, runtime: 'node-orchestrator', platform: process.platform,
    pid: process.pid, ports: { crm: CRM_PORT, connect: CONNECT_PORT, communications: COMM_PORT, prospecting: PROSPECTING_PORT, control: CONTROL_PORT },
    services, ready: Object.values(services).every(Boolean),
    communications: {
      ready: communications.ok,
      version: communications.data?.version || null,
      portBusy: commPort.busy,
      supervisorRunning: commProcesses.some(item => item.role === 'supervisor' && item.sameRoot),
      gatewayRunning: commProcesses.some(item => item.role === 'gateway' && item.sameRoot),
      recovering: Boolean(communicationsRecoveryPromise),
      logTail: communications.ok ? '' : tailFile(abs('.realtalent-communications.log'), 20),
    },
  }
}

function startControlServer(token) {
  controlServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${CONTROL_PORT}`)
    res.setHeader('content-type', 'application/json; charset=utf-8')
    if (url.pathname === '/health') {
      res.end(JSON.stringify({ status: 'ok', application: 'RealTalent Runtime', version: RELEASE, pid: process.pid }))
      return
    }
    if (url.pathname === '/readiness') {
      const s = await statusSnapshot(token)
      res.statusCode = s.ready ? 200 : 503
      res.end(JSON.stringify({ ready: s.ready, services: s.services }))
      return
    }
    if (url.pathname === '/status') {
      if (req.headers['x-realtalent-runtime-token'] !== token) {
        res.statusCode = 401; res.end(JSON.stringify({ error: 'unauthorized' })); return
      }
      res.end(JSON.stringify(await statusSnapshot(token)))
      return
    }
    if (req.method === 'POST' && url.pathname === '/restart-communications') {
      if (req.headers['x-realtalent-runtime-token'] !== token) {
        res.statusCode = 401; res.end(JSON.stringify({ error: 'unauthorized' })); return
      }
      const result = await recoverCommunicationsRuntime(token, { reason: 'ui-request' })
      res.statusCode = result.ok ? 200 : 503
      res.end(JSON.stringify({ ...result, status: await statusSnapshot(token) }))
      return
    }
    if (url.pathname === '/communications-diagnostics') {
      if (req.headers['x-realtalent-runtime-token'] !== token) {
        res.statusCode = 401; res.end(JSON.stringify({ error: 'unauthorized' })); return
      }
      const snapshot = await statusSnapshot(token)
      res.statusCode = snapshot.services.communications ? 200 : 503
      res.end(JSON.stringify(snapshot.communications))
      return
    }
    res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' }))
  })
  controlServer.listen(CONTROL_PORT, '127.0.0.1', () => log(`✓ Runtime Control: http://127.0.0.1:${CONTROL_PORT} (/health · /readiness · /status · /restart-communications)`))
  controlServer.on('error', error => fail(`Runtime Control não iniciou na porta ${CONTROL_PORT}: ${error.message}`))
}

function openBrowser(url) {
  if (process.env.REALTALENT_NO_BROWSER === '1' || process.env.CI) return
  let cmd, args
  if (isWindows) { cmd = 'cmd'; args = ['/c', 'start', '', url] }
  else if (process.platform === 'darwin') { cmd = 'open'; args = [url] }
  else { cmd = 'xdg-open'; args = [url] }
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
  child.unref()
}

async function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  if (communicationsWatchTimer) { clearInterval(communicationsWatchTimer); communicationsWatchTimer = null }
  if (controlServer) await new Promise(resolve => controlServer.close(() => resolve()))
  for (const child of [...children]) {
    try { child.kill('SIGTERM') } catch {}
  }
  await sleep(150)
  for (const child of [...children]) {
    try { if (!child.killed) child.kill('SIGKILL') } catch {}
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(143))
process.on('uncaughtException', error => { console.error(error); shutdown(1) })
process.on('unhandledRejection', error => { console.error(error); shutdown(1) })

async function doctor(token) {
  log(`RealTalent CRM V${RELEASE} — diagnóstico`)
  log(`Node: ${process.version} · npm: ${spawnSync(npmBin, ['--version'], { encoding: 'utf8' }).stdout?.trim() || 'indisponível'}`)
  log(`Lockfile: ${lockfileValid() ? 'sincronizado' : 'INCONSISTENTE'}`)
  log(`Dependências core: ${coreDepsPresent() ? 'presentes' : 'ausentes/incompletas'}`)
  log(`Runtime Comunicação: ${communicationsRuntimeDependenciesPresent() ? 'presente' : 'ausente/incompleto'}`)
  log(`Build V${RELEASE}: ${hasDistMarker() ? 'presente' : 'ausente'}`)
  const s = await statusSnapshot(token)
  log(`Serviços atuais: Connect=${s.services.connect ? 'OK' : 'off'} · Communications=${s.services.communications ? 'OK' : 'off'} · Prospecting=${s.services.prospecting ? 'OK' : 'off'}`)
  if (!s.services.connect) {
    const diagnostics = connectDiagnostics({ root: ROOT, port: CONNECT_PORT })
    log(`Connect diagnostics: porta=${diagnostics.port.busy ? 'ocupada' : 'livre'} · processos RealTalent=${diagnostics.processes.length}`)
    for (const item of diagnostics.processes.slice(0,5)) log(`  pid=${item.pid} cwd=${item.cwd || '-'}${item.sameRoot ? ' [esta release]' : ''}`)
    if (diagnostics.tail) { log('Último log Connect:'); for (const line of diagnostics.tail.split('\n').slice(-20)) log(`  ${line}`) }
  }
  if (!s.services.communications) {
    const processes = listCommunicationsProcesses({ root: ROOT })
    const port = inspectPort(COMM_PORT)
    log(`Communications diagnostics: porta=${port.busy ? 'ocupada' : 'livre'} · processos RealTalent=${processes.length}`)
    for (const item of processes.slice(0, 5)) log(`  pid=${item.pid} ${item.role} cwd=${item.cwd || '-'}${item.sameRoot ? ' [esta release]' : ''}`)
    const tail = tailFile(abs('.realtalent-communications.log'), 20)
    if (tail) { log('Último log Communications:'); for (const line of tail.split('\n')) log(`  ${line}`) }
  }
  return lockfileValid() ? 0 : 2
}

async function main() {
  const mode = parseMode(process.argv.slice(2))
  if (mode === 'help') { help(); return }
  requireNode22()
  verifyCommunicationSourceLineage()
  if (mode === 'doctor') {
    process.exitCode = await doctor(readRuntimeToken())
    return
  }
  migrateLocalState()
  ensureEnvLocal()
  const token = ensureRuntimeToken()

  ensureDependencies({ allowInstall: true })
  log('')
  log(`RealTalent CRM V${RELEASE}-${HOTFIX} — ${RELEASE_NAME} · ${HOTFIX_NAME}`)
  log('==============================================================')
  log(`Modo: ${mode}`)

  if (mode === 'verify') {
    log('1/4 — Auditoria completa da release...')
    fs.rmSync(abs('dist'), { recursive: true, force: true })
    fs.rmSync(abs('node_modules/.vite'), { recursive: true, force: true })
    node('scripts/linux-release-preflight.mjs')
    log('→ npm audit (produção; high+)')
    npm(['audit', '--omit=dev', '--audit-level=high'], { allowFailure: true })
    npm(['run', 'release:verify'])
    log('✓ Auditoria completa concluída.')
  } else if (mode === 'rebuild') {
    log('1/4 — Rebuild controlado...')
    fs.rmSync(abs('dist'), { recursive: true, force: true })
    fs.rmSync(abs('node_modules/.vite'), { recursive: true, force: true })
    node('scripts/linux-release-preflight.mjs')
    npm(['run', 'qa:v101.10.7'])
    npm(['run', 'qa:v101.10.7:h1'])
    npm(['run', 'qa:v101.10.8'])
    npm(['run', 'css:governance'])
    npm(['run', 'qa:v101.10.9'])
    npm(['run', 'qa:v101.10.9:h4'])
    npm(['run', 'qa:v101.10.9:h5'])
    npm(['run', 'qa:v101.11.0'])
    npm(['run', 'qa:v101.11.1'])
    npm(['run', 'qa:v101.11.1:h1'])
    npm(['run', 'qa:v101.11.1:h2'])
    npm(['run', 'qa:v101.11.1:h3'])
    npm(['run', 'qa:v101.11.1:h4'])
    npm(['run', 'qa:v101.11.1:h5'])
    npm(['run', 'qa:v101.11.2'])
    npm(['run', 'qa:v101.11.3'])
    npm(['run', 'qa:v101.11.3:h1'])
    npm(['run', 'qa:v101.11.3:h2'])
    npm(['run', 'qa:v101.11.3:h3'])
    npm(['run', 'qa:v101.11.3:h4'])
    npm(['run', 'qa:v101.11.3:h5'])
    npm(['run', 'qa:v101.11.3:h6'])
    npm(['run', 'qa:v101.11.3:h7'])
    npm(['run', 'qa:v101.11.3:h8'])
    npm(['run', 'qa:v101.11.3:h9'])
    npm(['run', 'qa:v101.11.3:h10'])
    npm(['run', 'qa:v101.11.3:h11'])
    npm(['run', 'qa:v101.11.3:h12'])
    npm(['run', 'qa:v101.11.3:h13'])
    npm(['run', 'qa:v101.11.3:h14'])
    npm(['run', 'qa:v101.11.3:h14:ui1'])
    npm(['run', 'qa:v101.11.3:h15'])
    npm(['run', 'qa:v101.11.3:h19.2'])
    npm(['run', 'build'])
    log(`✓ Rebuild V${RELEASE}-${HOTFIX} concluído.`)
  } else if (mode === 'dev') {
    log('1/4 — Desenvolvimento: gates rápidos de runtime...')
    npm(['run', 'qa:v101.10.8'])
    npm(['run', 'css:governance'])
    npm(['run', 'qa:v101.10.9'])
    npm(['run', 'qa:v101.10.9:h4'])
    npm(['run', 'qa:v101.10.9:h5'])
    npm(['run', 'qa:v101.11.0'])
    npm(['run', 'qa:v101.11.1'])
    npm(['run', 'qa:v101.11.1:h1'])
    npm(['run', 'qa:v101.11.1:h2'])
    npm(['run', 'qa:v101.11.1:h3'])
    npm(['run', 'qa:v101.11.1:h4'])
    npm(['run', 'qa:v101.11.1:h5'])
    npm(['run', 'qa:v101.11.2'])
    npm(['run', 'qa:v101.11.3'])
    npm(['run', 'qa:v101.11.3:h1'])
    npm(['run', 'qa:v101.11.3:h2'])
    npm(['run', 'qa:v101.11.3:h3'])
    npm(['run', 'qa:v101.11.3:h4'])
    npm(['run', 'qa:v101.11.3:h5'])
    npm(['run', 'qa:v101.11.3:h6'])
    npm(['run', 'qa:v101.11.3:h7'])
    npm(['run', 'qa:v101.11.3:h8'])
    npm(['run', 'qa:v101.11.3:h9'])
    npm(['run', 'qa:v101.11.3:h10'])
    npm(['run', 'qa:v101.11.3:h11'])
    npm(['run', 'qa:v101.11.3:h12'])
    npm(['run', 'qa:v101.11.3:h13'])
    npm(['run', 'qa:v101.11.3:h14'])
    npm(['run', 'qa:v101.11.3:h14:ui1'])
    npm(['run', 'qa:v101.11.3:h15'])
  } else if (mode === 'preview-only') {
    if (!hasDistMarker()) fail(`build V${RELEASE}-${HOTFIX} ausente; use npm run rebuild.`)
  } else {
    log('1/4 — Abertura rápida...')
    npm(['run', 'qa:v101.10.7'])
    npm(['run', 'qa:v101.10.7:h1'])
    npm(['run', 'qa:v101.10.8'])
    npm(['run', 'css:governance'])
    npm(['run', 'qa:v101.10.9'])
    npm(['run', 'qa:v101.10.9:h4'])
    npm(['run', 'qa:v101.10.9:h5'])
    npm(['run', 'qa:v101.11.0'])
    npm(['run', 'qa:v101.11.1'])
    npm(['run', 'qa:v101.11.1:h1'])
    npm(['run', 'qa:v101.11.1:h2'])
    npm(['run', 'qa:v101.11.1:h3'])
    npm(['run', 'qa:v101.11.1:h4'])
    npm(['run', 'qa:v101.11.1:h5'])
    npm(['run', 'qa:v101.11.2'])
    npm(['run', 'qa:v101.11.3'])
    npm(['run', 'qa:v101.11.3:h1'])
    npm(['run', 'qa:v101.11.3:h2'])
    npm(['run', 'qa:v101.11.3:h3'])
    npm(['run', 'qa:v101.11.3:h4'])
    npm(['run', 'qa:v101.11.3:h5'])
    npm(['run', 'qa:v101.11.3:h6'])
    npm(['run', 'qa:v101.11.3:h7'])
    npm(['run', 'qa:v101.11.3:h8'])
    npm(['run', 'qa:v101.11.3:h9'])
    npm(['run', 'qa:v101.11.3:h10'])
    npm(['run', 'qa:v101.11.3:h11'])
    npm(['run', 'qa:v101.11.3:h12'])
    npm(['run', 'qa:v101.11.3:h13'])
    npm(['run', 'qa:v101.11.3:h14'])
    npm(['run', 'qa:v101.11.3:h14:ui1'])
    npm(['run', 'qa:v101.11.3:h15'])
    if (!hasDistMarker()) {
      log(`Build V${RELEASE} ainda não existe: compilando uma vez...`)
      npm(['run', 'build'])
    } else log(`✓ Build V${RELEASE} existente reutilizado.`)
  }

  if (mode !== 'dev') verifyDistLineage()
  log('2/4 — Runtime e lineage validados.')

  await startServices(token)
  startControlServer(token)
  startCommunicationsWatchdog(token)
  await recoverPreviewPort()
  log('4/4 — Iniciando interface...')
  const url = `http://127.0.0.1:${CRM_PORT}/?rt_release=101.11.3-h2-runtime-service-recovery&rt_ui=101.11.3-h19-13-whatsapp-work-management&rt_cohesion=101.11.3-h20-7-global-ui-final-pass&rt_hotfix=101.11.3-h20-7-h1-appearance-sidebar-truth&rt_hotfix2=101.11.3-h20-7-h2-whatsapp-conversation-inbox&rt_garimpo=101.11.3-h21-1-coverage-runtime-truth&rt_launcher_fix=101.11.3-h21-1-h1-communication-lineage-guard&rt_access=101.11.3-h22-1-team-profiles-access-control&rt_access2=101.11.3-h22-2-cross-module-access-control&rt_governance=101.11.3-h22-3-field-approvals-audit&rt_closure=101.11.3-h22-3-h1-stability-security-closure&rt_cr1=101.11.3-cr1-build-dependency-closure&rt_cr2=101.11.3-cr2-supabase-auth-rls-validation&rt_cr3=101.11.3-cr3-e2e-commercial-workflow&rt_cr4=101.11.3-cr4-commercial-ux-failure-recovery&rt_cr5=101.11.3-cr5-performance-observability&rt_cr6=101.11.3-cr6-performance-payload-reduction&rt_cr7=101.11.3-cr7-production-operational-readiness&rt_cr8=101.11.3-cr8-commercial-launch-gate&rt_cr9=101.11.3-cr9-launch-hard-stop-closure&rt_readiness=101.11.3-cr10-supabase-staging-bootstrap&rt_cr10_h1=101.11.3-cr10-h1-css-cascade-governance`
  log(`CRM: ${url}`)
  log(`UI Cohesion: V${RELEASE}-${UI_COHESION} — ${UI_COHESION_NAME}`)
  log(`UI Hotfix: V${RELEASE}-${UI_HOTFIX} — ${UI_HOTFIX_NAME}`)
  log(`RealTalent Connect: http://127.0.0.1:${CONNECT_PORT}`)
  log(`Communications Gateway: http://127.0.0.1:${COMM_PORT}`)
  log(`Prospecting Agent: http://127.0.0.1:${PROSPECTING_PORT}`)
  log(`Runtime Control: http://127.0.0.1:${CONTROL_PORT}/health`)
  log('Para encerrar os processos iniciados por este runtime: Ctrl+C')

  const viteBin = abs('node_modules/vite/bin/vite.js')
  const viteArgs = mode === 'dev'
    ? [viteBin, '--host', '127.0.0.1', '--port', String(CRM_PORT), '--strictPort']
    : [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(CRM_PORT), '--strictPort']
  const ui = spawn(process.execPath, viteArgs, { cwd: ROOT, env: { ...process.env, REALTALENT_CONNECT_PORT: String(CONNECT_PORT), REALTALENT_COMMUNICATIONS_PORT: String(COMM_PORT) }, stdio: 'inherit' })
  ui.__rtName = 'vite'
  children.add(ui)
  ui.on('exit', code => { children.delete(ui); shutdown(code || 0) })
  setTimeout(() => openBrowser(url), 1400)
}

main().catch(error => { console.error(error); shutdown(1) })
