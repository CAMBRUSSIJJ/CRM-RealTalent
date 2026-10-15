import http from 'node:http'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOST = process.env.REALTALENT_AGENT_HOST || '127.0.0.1'
const PORT = Number(process.env.REALTALENT_AGENT_PORT || 8791)
const INNER_PORT = Number(process.env.REALTALENT_AGENT_INNER_PORT || 8792)
const TOKEN = String(process.env.REALTALENT_AGENT_RUNTIME_TOKEN || '').trim()
const originalGateway = path.join(here, 'gateway.mjs')

const child = spawn(process.execPath, [originalGateway], {
  cwd: here,
  env: { ...process.env, REALTALENT_AGENT_HOST: '127.0.0.1', REALTALENT_AGENT_PORT: String(INNER_PORT) },
  stdio: 'inherit',
})
child.on('exit', (code, signal) => {
  console.error(`[agent-inner] encerrou code=${code} signal=${signal || ''}`)
  process.exit(code || 1)
})

const json = (res, status, value) => {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

const readBody = (req, limit = 600_000) => new Promise((resolve, reject) => {
  let size = 0
  const chunks = []
  req.on('data', chunk => {
    size += chunk.length
    if (size > limit) {
      reject(new Error('payload_too_large'))
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8')
      resolve(raw ? JSON.parse(raw) : {})
    } catch (error) { reject(error) }
  })
  req.on('error', reject)
})

const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9$%/.,\-\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const metricFromText = text => {
  const t = normalize(text)
  if (/\b(ligacao|ligacoes|chamada|chamadas|telefonema|telefonemas|calls?)\b/.test(t)) return 'calls'
  if (/\b(contato|contatos|contacts?)\b/.test(t)) return 'contacts'
  if (/\b(follow[ -]?up|follow[ -]?ups|retorno|retornos)\b/.test(t)) return 'followups'
  if (/\b(reuniao|reunioes|meeting|meetings)\b/.test(t)) return 'meetings'
  if (/\b(proposta|propostas|proposal|proposals)\b/.test(t)) return 'proposals'
  if (/\b(venda|vendas|ganho|ganhos|wins?)\b/.test(t)) return 'wins'
  if (/\b(receita|faturamento|revenue)\b/.test(t)) return 'revenue'
  if (/\b(novos? leads?|lead|leads)\b/.test(t)) return 'new_leads'
  return ''
}

const targetFromText = text => {
  const t = normalize(text)
  const patterns = [
    /\bmeta(?:s)?(?:\s+de)?\s+(\d+(?:[.,]\d+)?)/,
    /\b(?:crie|criar|quero|defina|definir|estabeleca|estabelecer)\s+(\d+(?:[.,]\d+)?)\s+(?:meta|metas|ligacao|ligacoes|contato|contatos|follow|reuniao|reunioes|proposta|propostas|venda|vendas|lead|leads)/,
    /\b(\d+(?:[.,]\d+)?)\s+(?:ligacao|ligacoes|contato|contatos|follow[ -]?ups?|reuniao|reunioes|proposta|propostas|venda|vendas|leads?)\b/,
  ]
  for (const re of patterns) {
    const m = t.match(re)
    if (m) return m[1].replace(',', '.')
  }
  return ''
}

const datePartsInZone = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date)
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  return `${map.year}-${map.month}-${map.day}`
}

const dateFromText = (text, context = {}) => {
  const raw = String(text || '')
  const t = normalize(raw)
  const dmy = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2,'0')}-${String(dmy[1]).padStart(2,'0')}`
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const zone = String(context?.timezone || 'America/Sao_Paulo')
  const now = new Date(context?.now || Date.now())
  if (/\bamanha\b/.test(t)) return datePartsInZone(new Date(now.getTime() + 86_400_000), zone)
  if (/\bhoje\b/.test(t)) return datePartsInZone(now, zone)
  return ''
}

const argsList = obj => Object.entries(obj).filter(([,v]) => String(v ?? '') !== '').map(([name,value]) => ({ name, value:String(value) }))

const metricLabel = metric => ({
  calls:'ligações', contacts:'contatos', followups:'follow-ups', meetings:'reuniões', proposals:'propostas', wins:'vendas', revenue:'receita', new_leads:'novos leads'
}[metric] || metric)

function goalsPlan(body) {
  const prompt = String(body?.prompt || '').trim()
  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const capabilities = Array.isArray(body?.capabilities) ? body.capabilities : []
  const capability = capabilities.find(item => String(item?.id || '') === 'goals.create')
  if (!capability) return null

  const pending = context?.pending_capability && String(context.pending_capability.capabilityId || context.pending_capability.id || context.pending_capability.pendingCapabilityId || '') === 'goals.create'
    ? context.pending_capability : null
  const inherited = {}
  const pendingArgs = Array.isArray(pending?.knownArgs) ? pending.knownArgs : []
  for (const item of pendingArgs) if (item?.name) inherited[String(item.name)] = String(item.value ?? '')

  const fullText = `${pending?.originalRequest || ''} ${prompt}`.trim()
  const looksLikeGoal = Boolean(pending) || /\b(meta|metas|objetivo|objetivos|target)\b/i.test(normalize(fullText))
  if (!looksLikeGoal) return null

  const target = targetFromText(fullText) || inherited.target_value || inherited.targetValue || ''
  const metric = metricFromText(prompt) || metricFromText(fullText) || inherited.metric || ''
  const date = dateFromText(fullText, context) || inherited.period_start || inherited.periodStart || ''
  const end = inherited.period_end || inherited.periodEnd || date
  const scope = inherited.scope || 'user'

  const known = { metric, target_value:target, period_start:date, period_end:end, scope }
  const missing = []
  if (!metric) missing.push('metric')
  if (!target) missing.push('target_value')
  if (!date) missing.push('period_start')

  const partialArgs = argsList(known)
  const title = String(capability?.title || 'Criar meta')
  const risk = ['read','low','medium','high'].includes(capability?.risk) ? capability.risk : 'medium'

  if (missing.length) {
    let clarification = 'Qual informação falta para a meta?'
    if (missing[0] === 'metric') clarification = 'Qual tipo de meta você quer criar? Ligações, contatos, follow-ups, reuniões, propostas, vendas, receita ou novos leads?'
    else if (missing[0] === 'target_value') clarification = 'Qual é o valor da meta?'
    else if (missing[0] === 'period_start') clarification = 'Para qual data ou período você quer essa meta?'
    const plan = {
      version:'3.4', goal:'Criar uma meta no CRM', confidence:0.93, needsClarification:true, clarification,
      pendingCapabilityId:'goals.create', missingSlots:missing, knownArgs:partialArgs,
      steps:[{ id:'step-1', capabilityId:'goals.create', title, reason:'A intenção de criar meta está clara; falta apenas completar os dados obrigatórios.', risk, args:partialArgs }],
    }
    return { ok:true, version:'3.4', plan, decision:'clarify', provider:'deterministic', model:'realtalent-capability-fallback', modelRole:'classification' }
  }

  const goal = `Criar meta pessoal de ${target} ${metricLabel(metric)} para ${date}`
  const plan = {
    version:'3.4', goal, confidence:0.99, needsClarification:false, clarification:'', pendingCapabilityId:'', missingSlots:[], knownArgs:partialArgs,
    steps:[{ id:'step-1', capabilityId:'goals.create', title, reason:'O usuário informou explicitamente métrica, valor e período da meta.', risk, args:partialArgs }],
  }
  return { ok:true, version:'3.4', plan, decision:'execute', provider:'deterministic', model:'realtalent-capability-fallback', modelRole:'classification' }
}

function semanticGoalFallback(body) {
  const prompt = String(body?.prompt || '')
  if (!/\b(meta|metas|objetivo|objetivos|target)\b/i.test(normalize(prompt))) return null
  return {
    ok:true, version:'3.1.5',
    interpretation:{
      version:'3.1.5', language:'pt', intent:'unknown', object:'none', action:'none', confidence:0.45,
      needs_clarification:false, clarification:'', canonical_request:prompt.slice(0,500),
      rationale:'Pedido de meta deve ser resolvido pelo CRM Capability Planner.',
      entities:{contact_query:'',assignee_query:'',task_title:'',due_at_iso:'',explicit_time:false,task_type:'none',criteria:[],reference:''},
    },
    decision:'fallback', provider:'deterministic', model:'realtalent-capability-fallback', modelRole:'classification',
  }
}

const authorized = req => {
  if (!TOKEN) return false
  return String(req.headers['x-realtalent-agent-token'] || '') === TOKEN
}

const proxyBuffered = (req, res, bodyBuffer = null) => {
  const headers = { ...req.headers, host:`127.0.0.1:${INNER_PORT}` }
  if (bodyBuffer) headers['content-length'] = String(bodyBuffer.length)
  const upstream = http.request({ host:'127.0.0.1', port:INNER_PORT, path:req.url, method:req.method, headers }, u => {
    res.writeHead(u.statusCode || 502, u.headers)
    u.pipe(res)
  })
  upstream.on('error', error => json(res,502,{ok:false,error:'agent_inner_unavailable',message:String(error.message || error)}))
  if (bodyBuffer) upstream.end(bodyBuffer)
  else req.pipe(upstream)
}

const server = http.createServer(async (req, res) => {
  if (!authorized(req)) return json(res,401,{ok:false,error:'unauthorized_runtime'})

  if (req.method === 'POST' && (req.url === '/capabilities/plan' || req.url === '/language/interpret')) {
    try {
      const body = await readBody(req)
      if (req.url === '/capabilities/plan') {
        const fallback = goalsPlan(body)
        if (fallback) return json(res,200,fallback)
      }
      if (req.url === '/language/interpret') {
        const fallback = semanticGoalFallback(body)
        if (fallback) return json(res,200,fallback)
      }
      const raw = Buffer.from(JSON.stringify(body))
      return proxyBuffered(req,res,raw)
    } catch (error) {
      return json(res,400,{ok:false,error:error instanceof Error ? error.message : 'invalid_request'})
    }
  }

  return proxyBuffered(req,res)
})

server.listen(PORT, HOST, () => console.log(`RealTalent Cloud Agent Gateway em http://${HOST}:${PORT} → inner :${INNER_PORT}`))

const shutdown = () => {
  try { server.close() } catch {}
  try { child.kill('SIGTERM') } catch {}
  setTimeout(() => process.exit(0), 800).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
