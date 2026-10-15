import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const COMM_PATTERN = /realtalent-communications-(supervisor|gateway)\.mjs/

function safeRead(file, encoding = 'utf8') {
  try { return fs.readFileSync(file, encoding) } catch { return '' }
}

function realPath(value) {
  try { return fs.realpathSync(value) } catch { return value }
}

function isRealTalentReleaseDir(cwd) {
  const base = path.basename(String(cwd || ''))
  return /^RealTalent-CRM-V/i.test(base)
}

export function tailFile(file, maxLines = 60) {
  const raw = safeRead(file)
  if (!raw) return ''
  const lines = raw.replace(/\r/g, '').split('\n')
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(Math.max(0, lines.length - Math.max(1, maxLines))).join('\n').trim()
}

export function listCommunicationsProcesses({ root = process.cwd(), excludePids = [] } = {}) {
  const excluded = new Set([process.pid, ...excludePids].map(Number))
  const found = []

  if (process.platform === 'linux' && fs.existsSync('/proc')) {
    for (const entry of fs.readdirSync('/proc', { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
      const pid = Number(entry.name)
      if (!pid || excluded.has(pid)) continue
      const procRoot = `/proc/${pid}`
      const cmdline = safeRead(path.join(procRoot, 'cmdline')).replace(/\0/g, ' ').trim()
      const match = COMM_PATTERN.exec(cmdline)
      if (!match) continue
      let cwd = ''
      try { cwd = fs.readlinkSync(path.join(procRoot, 'cwd')) } catch {}
      found.push({
        pid,
        role: match[1],
        cwd,
        cmdline,
        sameRoot: realPath(cwd) === realPath(root),
        trustedRealTalentRoot: isRealTalentReleaseDir(cwd),
      })
    }
    return found.sort((a, b) => (a.role === 'supervisor' ? -1 : 1) - (b.role === 'supervisor' ? -1 : 1) || a.pid - b.pid)
  }

  // Best-effort process inventory for macOS/other POSIX systems. We never kill
  // an unknown process without a recognizable RealTalent release cwd.
  const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  if (ps.status === 0) {
    for (const line of String(ps.stdout || '').split(/\r?\n/)) {
      const matchPid = line.trim().match(/^(\d+)\s+(.+)$/)
      if (!matchPid) continue
      const pid = Number(matchPid[1]); const cmdline = matchPid[2]
      if (!pid || excluded.has(pid) || !COMM_PATTERN.test(cmdline)) continue
      found.push({ pid, role: cmdline.includes('supervisor') ? 'supervisor' : 'gateway', cwd: '', cmdline, sameRoot: false, trustedRealTalentRoot: false })
    }
  }
  return found
}

export function inspectPort(port) {
  const value = Number(port)
  const attempts = process.platform === 'win32'
    ? [['netstat', ['-ano']]]
    : [['ss', ['-ltnp']], ['lsof', ['-nP', `-iTCP:${value}`, '-sTCP:LISTEN']]]

  for (const [cmd, args] of attempts) {
    const result = spawnSync(cmd, args, { encoding: 'utf8' })
    if (result.error || result.status !== 0) continue
    const text = String(result.stdout || '')
    const lines = text.split(/\r?\n/).filter(line => {
      if (cmd === 'ss') return new RegExp(`[:.]${value}\\b`).test(line) || line.includes(`:${value} `)
      if (cmd === 'netstat') return line.includes(`:${value} `) || line.includes(`:${value}\r`)
      return line.includes(`:${value}`)
    })
    if (lines.length) {
      const pids = [...new Set(lines.flatMap(line => [...line.matchAll(/pid=(\d+)|\s(\d+)\s*$/g)].map(m => Number(m[1] || m[2])).filter(Boolean)))]
      return { busy: true, command: cmd, lines, pids }
    }
  }
  return { busy: false, command: null, lines: [], pids: [] }
}

async function waitUntilGone(pid, sleep, timeoutMs = 1400) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let alive = true
    try { process.kill(pid, 0) } catch { alive = false }
    if (!alive) return true
    await sleep(80)
  }
  return false
}

export async function stopStaleCommunicationsProcesses({ root, port = 3002, terminatePid, sleep, log = () => {} } = {}) {
  const processes = listCommunicationsProcesses({ root })
  const owner = inspectPort(port)
  const ownerPids = new Set(owner.pids.map(Number))
  const ownerRoots = new Set(processes.filter(item => ownerPids.has(item.pid) && item.trustedRealTalentRoot).map(item => realPath(item.cwd)))
  // Safe scope: a stale process from this exact release, or a RealTalent release
  // proven to own the target Communications port. Other RealTalent instances are left alone.
  const trusted = processes.filter(item => item.sameRoot || (item.trustedRealTalentRoot && ownerRoots.has(realPath(item.cwd))))
  const ignored = processes.filter(item => !trusted.some(candidate => candidate.pid === item.pid))

  if (ignored.length) {
    for (const item of ignored) log(`⚠ processo de comunicações fora do escopo da porta ${port} preservado pid=${item.pid}: ${item.cmdline}`)
  }
  if (!trusted.length) return { stopped: [], ignored, owner }

  const ordered = [...trusted].sort((a, b) => Number(b.role === 'supervisor') - Number(a.role === 'supervisor'))
  const stopped = []
  for (const item of ordered) {
    log(`↻ Encerrando Communications ${item.role} anterior pid=${item.pid} (${item.cwd || 'cwd desconhecido'})...`)
    await terminatePid(item.pid)
    let gone = await waitUntilGone(item.pid, sleep)
    if (!gone && process.platform !== 'win32') {
      try { process.kill(item.pid, 'SIGKILL') } catch {}
      gone = await waitUntilGone(item.pid, sleep, 500)
    }
    if (gone) stopped.push(item)
    else log(`⚠ não foi possível encerrar pid=${item.pid}; o launcher não forçará processos desconhecidos além disso.`)
  }
  return { stopped, ignored, owner }
}
