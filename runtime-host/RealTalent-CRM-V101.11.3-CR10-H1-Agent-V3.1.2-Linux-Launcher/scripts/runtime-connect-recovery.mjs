import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectPort, tailFile } from './runtime-communications-recovery.mjs'

const CONNECT_PATTERN = /realtalent-connect-server\.mjs/

function safeRead(file, encoding = 'utf8') {
  try { return fs.readFileSync(file, encoding) } catch { return '' }
}
function realPath(value) { try { return fs.realpathSync(value) } catch { return value } }
function isRealTalentReleaseDir(cwd) { return /^RealTalent-CRM-V/i.test(path.basename(String(cwd || ''))) }

export function listConnectProcesses({ root = process.cwd(), excludePids = [] } = {}) {
  const excluded = new Set([process.pid, ...excludePids].map(Number))
  const found = []
  if (process.platform === 'linux' && fs.existsSync('/proc')) {
    for (const entry of fs.readdirSync('/proc', { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
      const pid = Number(entry.name)
      if (!pid || excluded.has(pid)) continue
      const procRoot = `/proc/${pid}`
      const cmdline = safeRead(path.join(procRoot, 'cmdline')).replace(/\0/g, ' ').trim()
      if (!CONNECT_PATTERN.test(cmdline)) continue
      let cwd = ''
      try { cwd = fs.readlinkSync(path.join(procRoot, 'cwd')) } catch {}
      found.push({ pid, cwd, cmdline, sameRoot: realPath(cwd) === realPath(root), trustedRealTalentRoot: isRealTalentReleaseDir(cwd) })
    }
    return found.sort((a,b)=>a.pid-b.pid)
  }
  const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding:'utf8' })
  if (ps.status === 0) {
    for (const line of String(ps.stdout || '').split(/\r?\n/)) {
      const m=line.trim().match(/^(\d+)\s+(.+)$/)
      if (!m) continue
      const pid=Number(m[1]); const cmdline=m[2]
      if (!pid || excluded.has(pid) || !CONNECT_PATTERN.test(cmdline)) continue
      found.push({ pid, cwd:'', cmdline, sameRoot:false, trustedRealTalentRoot:false })
    }
  }
  return found
}

async function waitUntilGone(pid, sleep, timeoutMs=1400) {
  const deadline=Date.now()+timeoutMs
  while(Date.now()<deadline){ let alive=true; try{process.kill(pid,0)}catch{alive=false}; if(!alive)return true; await sleep(80) }
  return false
}

export async function stopStaleConnectProcesses({ root, port=3001, terminatePid, sleep, log=()=>{} }={}) {
  const processes=listConnectProcesses({root})
  const owner=inspectPort(port)
  const ownerPids=new Set(owner.pids.map(Number))
  const ownerRoots=new Set(processes.filter(p=>ownerPids.has(p.pid)&&p.trustedRealTalentRoot).map(p=>realPath(p.cwd)))
  // Same safety policy as Communications: only this release, or a recognizable
  // RealTalent release proven to own the target Connect port.
  const trusted=processes.filter(p=>p.sameRoot || (p.trustedRealTalentRoot && ownerRoots.has(realPath(p.cwd))))
  const ignored=processes.filter(p=>!trusted.some(c=>c.pid===p.pid))
  for(const item of ignored) log(`⚠ processo Connect fora do escopo da porta ${port} preservado pid=${item.pid}: ${item.cmdline}`)
  const stopped=[]
  for(const item of trusted){
    log(`↻ Encerrando RealTalent Connect anterior pid=${item.pid} (${item.cwd || 'cwd desconhecido'})...`)
    await terminatePid(item.pid)
    let gone=await waitUntilGone(item.pid,sleep)
    if(!gone && process.platform!=='win32'){
      try{process.kill(item.pid,'SIGKILL')}catch{}
      gone=await waitUntilGone(item.pid,sleep,500)
    }
    if(gone) stopped.push(item)
    else log(`⚠ não foi possível encerrar Connect pid=${item.pid}; nenhum processo desconhecido será forçado.`)
  }
  return {stopped, ignored, owner}
}

export function connectDiagnostics({ root=process.cwd(), port=3001, logFile='.realtalent-connect.log' }={}) {
  return { processes:listConnectProcesses({root}), port:inspectPort(port), tail:tailFile(path.join(root,logFile),50) }
}
