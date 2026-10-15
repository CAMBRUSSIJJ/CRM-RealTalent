#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const gateway = process.env.REALTALENT_COMMUNICATIONS_GATEWAY_ENTRY ? path.resolve(root, process.env.REALTALENT_COMMUNICATIONS_GATEWAY_ENTRY) : path.join(here, 'realtalent-communications-gateway.mjs')
let child = null
let stopping = false
let restartCount = 0
let windowStartedAt = Date.now()
let launchedAt = 0
let healthFailures = 0
let healthTimer = null
const gatewayPort = Number(process.env.REALTALENT_COMMUNICATIONS_PORT || 3002)
const gatewayHost = process.env.REALTALENT_COMMUNICATIONS_HOST || '127.0.0.1'
const runtimeToken = String(process.env.REALTALENT_RUNTIME_TOKEN || '').trim()
const expectedVersion = String(process.env.REALTALENT_COMMUNICATIONS_EXPECTED_VERSION || '101.8.4-h13')

function log(message) {
  process.stdout.write(`[communications-supervisor] ${new Date().toISOString()} ${message}\n`)
}

function nextDelay() {
  const now = Date.now()
  if (now - windowStartedAt > 60_000) {
    windowStartedAt = now
    restartCount = 0
  }
  restartCount += 1
  if (restartCount <= 2) return 600
  if (restartCount <= 5) return 1500
  return 5000
}

function launch() {
  if (stopping) return
  launchedAt = Date.now()
  healthFailures = 0
  child = spawn(process.execPath, [gateway], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })
  log(`gateway iniciado pid=${child.pid}`)
  child.once('error', (error) => {
    log(`falha ao iniciar gateway: ${error?.stack || error}`)
  })
  child.once('exit', (code, signal) => {
    const pid = child?.pid
    child = null
    if (stopping) {
      log(`gateway encerrado pid=${pid ?? '-'} code=${code ?? '-'} signal=${signal ?? '-'}`)
      return
    }
    const delay = nextDelay()
    log(`gateway caiu pid=${pid ?? '-'} code=${code ?? '-'} signal=${signal ?? '-'}; reiniciando em ${delay}ms`)
    setTimeout(launch, delay)
  })
}


async function probeGateway() {
  if (!child || child.exitCode !== null || stopping) return
  if (Date.now() - launchedAt < 8000) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1200)
  try {
    const response = await fetch(`http://${gatewayHost}:${gatewayPort}/api/communications/health`, {
      signal: controller.signal,
      headers: runtimeToken ? { 'x-realtalent-runtime-token': runtimeToken } : {},
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.version !== expectedVersion) throw new Error(`health ${response.status} version=${payload?.version || '-'}`)
    healthFailures = 0
  } catch (error) {
    healthFailures += 1
    log(`healthcheck falhou ${healthFailures}/3: ${error instanceof Error ? error.message : String(error)}`)
    if (healthFailures >= 3 && child && child.exitCode === null) {
      healthFailures = 0
      log(`gateway sem resposta saudável; reiniciando pid=${child.pid}`)
      try { child.kill('SIGTERM') } catch {}
      const force = setTimeout(() => { if (child && child.exitCode === null) { try { child.kill('SIGKILL') } catch {} } }, 2200)
      force.unref?.()
    }
  } finally {
    clearTimeout(timer)
  }
}

function startHealthWatch() {
  if (healthTimer) return
  healthTimer = setInterval(() => { void probeGateway() }, 4000)
  healthTimer.unref?.()
}
function shutdown(signal) {
  if (stopping) return
  stopping = true
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null }
  log(`encerrando supervisor por ${signal}`)
  if (child && child.exitCode === null) {
    try { child.kill('SIGTERM') } catch {}
    const timer = setTimeout(() => {
      if (child && child.exitCode === null) {
        try { child.kill('SIGKILL') } catch {}
      }
      process.exit(0)
    }, 2500)
    timer.unref?.()
    child.once('exit', () => process.exit(0))
  } else {
    process.exit(0)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGHUP', () => shutdown('SIGHUP'))
process.on('uncaughtException', (error) => {
  log(`erro não tratado no supervisor: ${error?.stack || error}`)
  shutdown('uncaughtException')
})

log('supervisor ativo')
launch()
startHealthWatch()
