import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'realtalent-agent')
const PROFILE_FILE = path.join(CONFIG_DIR, 'hardware-profile.json')

const round = (n, d = 1) => Number(Number(n || 0).toFixed(d))
const gib = (bytes) => round(Number(bytes || 0) / 1024 / 1024 / 1024, 1)

const safeExec = (cmd, args = [], timeout = 1200) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

const gpuInfo = () => {
  const nvidia = safeExec('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'])
  if (nvidia) {
    const first = nvidia.split(/\r?\n/)[0]
    const [name, memoryMiB] = first.split(',').map((x) => x.trim())
    return { vendor: 'nvidia', name: name || 'NVIDIA GPU', vramGB: round(Number(memoryMiB || 0) / 1024, 1), detected: true }
  }
  const lspci = safeExec('lspci', [])
  const line = lspci.split(/\r?\n/).find((x) => /VGA|3D controller/i.test(x)) || ''
  if (line) {
    const vendor = /amd|ati/i.test(line) ? 'amd' : /intel/i.test(line) ? 'intel' : /nvidia/i.test(line) ? 'nvidia' : 'unknown'
    return { vendor, name: line.replace(/^.*?:\s*/, '').slice(0, 180), vramGB: 0, detected: true }
  }
  return { vendor: 'none', name: 'Nenhuma GPU dedicada detectada', vramGB: 0, detected: false }
}

const diskInfo = () => {
  try {
    const stats = fs.statfsSync(os.homedir())
    return { totalGB: gib(Number(stats.blocks) * Number(stats.bsize)), freeGB: gib(Number(stats.bavail) * Number(stats.bsize)) }
  } catch { return { totalGB: 0, freeGB: 0 } }
}

export const recommendModelRoles = ({ ramGB, gpu }) => {
  const vram = Number(gpu?.vramGB || 0)
  const performance = ramGB >= 28 || vram >= 12
  const balanced = !performance && (ramGB >= 14 || vram >= 6)
  const profile = performance ? 'performance' : balanced ? 'balanced' : 'light'
  const recommendations = profile === 'performance'
    ? { fast: 'qwen3:4b', general: 'qwen3:8b', coder: 'qwen2.5-coder:14b', reasoning: 'qwen3:14b', vision: 'gemma3:12b', embedding: 'nomic-embed-text-v2-moe' }
    : profile === 'balanced'
      ? { fast: 'qwen3:1.7b', general: 'qwen3:4b', coder: 'qwen2.5-coder:7b', reasoning: 'qwen3:8b', vision: 'gemma3:4b', embedding: 'nomic-embed-text-v2-moe' }
      : { fast: 'qwen3:1.7b', general: 'qwen3:4b', coder: 'qwen2.5-coder:3b', reasoning: 'qwen3:4b', vision: 'gemma3:4b', embedding: 'nomic-embed-text' }
  return { profile, recommendations }
}

export const collectHardwareProfile = () => {
  const totalMem = os.totalmem(); const freeMem = os.freemem(); const cpus = os.cpus() || []
  const gpu = gpuInfo(); const disk = diskInfo(); const ramGB = gib(totalMem)
  const recommended = recommendModelRoles({ ramGB, gpu })
  return {
    version: 1,
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpu: { model: String(cpus[0]?.model || 'desconhecido').trim(), logicalCores: cpus.length, load1m: round(os.loadavg?.()[0] || 0, 2) },
    memory: { totalGB: ramGB, freeGB: gib(freeMem), usedGB: gib(totalMem - freeMem) },
    gpu,
    disk,
    profile: recommended.profile,
    recommendedModels: recommended.recommendations,
  }
}

export const writeHardwareProfile = (file = PROFILE_FILE) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const profile = collectHardwareProfile()
  fs.writeFileSync(file, JSON.stringify(profile, null, 2), { encoding: 'utf8', mode: 0o600 })
  try { fs.chmodSync(file, 0o600) } catch {}
  return profile
}

export const hardwareProfileFile = PROFILE_FILE

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write')
  const profile = write ? writeHardwareProfile() : collectHardwareProfile()
  process.stdout.write(JSON.stringify(profile, null, process.argv.includes('--json') ? 0 : 2) + '\n')
}
