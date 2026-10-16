import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const relative = 'runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs'
const file = path.resolve(root, relative)
let source = fs.readFileSync(file, 'utf8')

if (!source.includes('const preserveExplicitEntityReference =')) {
  const helper = `const explicitCalendarParticipant = (prompt) => {
  const raw = String(prompt || '').trim()
  const match = raw.match(/\\bcom\\s+(.+?)\\s*$/i)
  if (!match) return ''
  return String(match[1] || '')
    .replace(/[.!?]+$/g, '')
    .trim()
    .slice(0, 240)
}

const preserveExplicitEntityReference = (payload, prompt) => {
  if (!payload || typeof payload !== 'object') return payload
  const steps = Array.isArray(payload?.plan?.steps) ? payload.plan.steps : []
  for (const step of steps) {
    if (String(step?.capabilityId || '') !== 'calendar.create') continue
    if (!Array.isArray(step.args)) step.args = []
    const hasEntity = step.args.some((arg) => ['record_query','contact_query','lead_query'].includes(String(arg?.name || '')) && String(arg?.value || '').trim())
    if (hasEntity) continue
    const participant = explicitCalendarParticipant(prompt)
    if (!participant) continue
    step.args.push({ name: 'contact_query', value: participant })
    payload.routing = { ...(payload.routing || {}), explicitEntityPreserved: true }
  }
  return payload
}

`
  const insertionPoint = 'const callInnerPlanner = async (body, reqHeaders = {}) => {'
  if (!source.includes(insertionPoint)) throw new Error('Não encontrei o ponto seguro para instalar preservação de entidade.')
  source = source.replace(insertionPoint, `${helper}${insertionPoint}`)
}

const plannerCall = '    const { response, payload } = await callInnerPlanner({ ...body, capabilities: finalCapabilities }, req.headers)\n'
if (source.includes(plannerCall) && !source.includes('preserveExplicitEntityReference(payload, String(body.prompt))')) {
  source = source.replace(plannerCall, `${plannerCall}    preserveExplicitEntityReference(payload, String(body.prompt))\n`)
}

if (!source.includes('preserveExplicitEntityReference(payload, String(body.prompt))')) {
  throw new Error('A preservação de entidade não foi ligada ao retorno do planner.')
}

fs.writeFileSync(file, source, 'utf8')

const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
if (syntax.status !== 0) throw new Error(String(syntax.stderr || syntax.stdout || 'Falha de sintaxe no gateway').trim())

console.log('✓ Entidades explícitas de Agenda preservadas após o planner.')