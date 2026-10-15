// RealTalent Agent — Ollama-only entrypoint with semantic capability routing.
// The public Agent stays on 8791. The original runtime runs on an internal port.
// Capability planning happens in two Ollama stages: business-module routing first,
// then detailed planning over only the relevant real CRM capabilities.

import fs from 'node:fs'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const OUTER_HOST = process.env.REALTALENT_AGENT_HOST || '127.0.0.1'
const OUTER_PORT = Number(process.env.REALTALENT_AGENT_PORT || 8791)
const INNER_PORT = Number(process.env.REALTALENT_AGENT_INNER_PORT || (OUTER_PORT + 1))

process.env.REALTALENT_AI_PROVIDER = 'ollama'
process.env.OLLAMA_URL = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')

const CRM_OLLAMA_MODEL = process.env.REALTALENT_OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'qwen3:4b'
process.env.OLLAMA_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_GENERAL_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_FAST_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_REASONING_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_CODER_MODEL = CRM_OLLAMA_MODEL
process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS = process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS || '90000'

// OpenAI must not become primary or fallback in this entrypoint.
delete process.env.OPENAI_API_KEY
delete process.env.OPENAI_RESPONSES_URL
delete process.env.OPENAI_PROTECTION_BYPASS

// The existing runtime is kept intact, but runs privately behind this router.
process.env.REALTALENT_AGENT_PORT = String(INNER_PORT)
const sourcePath = fileURLToPath(new URL('./gateway.mjs', import.meta.url))
const generatedPath = fileURLToPath(new URL('./.gateway-ollama-runtime.generated.mjs', import.meta.url))
let source = fs.readFileSync(sourcePath, 'utf8')

const timeoutPattern = "timeoutMs:15_000,taskType:'classification'"
const timeoutReplacement = "timeoutMs:Number(process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS || 90_000),taskType:'classification'"
const timeoutMatches = source.split(timeoutPattern).length - 1
if (timeoutMatches !== 2) {
  throw new Error(`O gateway mudou: esperava 2 timeouts semânticos de 15s, encontrei ${timeoutMatches}. Nada foi iniciado para evitar patch silencioso incorreto.`)
}
source = source.replaceAll(timeoutPattern, timeoutReplacement)

const structuredPattern = 'model, stream: false, format: schema,'
if (source.includes(structuredPattern)) {
  source = source.replace(structuredPattern, 'model, stream: false, think: false, format: schema,')
}

fs.writeFileSync(generatedPath, source, 'utf8')
await import('./.gateway-ollama-runtime.generated.mjs')

const OLLAMA_URL = process.env.OLLAMA_URL
const ROUTER_TIMEOUT_MS = Number(process.env.REALTALENT_OLLAMA_ROUTER_TIMEOUT_MS || 60_000)

const MODULE_SEMANTICS = {
  dashboard: 'ações gerais, navegação, consulta global, notificações e desfazer',
  contacts: 'contatos, pessoas, clientes, leads e dados cadastrais',
  leads: 'leads, contatos, clientes e dados cadastrais',
  pipeline: 'oportunidades, negócios, etapas do funil e ganho/perda',
  tasks: 'tarefas, lembretes e trabalho a fazer',
  followups: 'follow-ups, atividades, notas e retornos comerciais',
  agenda: 'agenda, reuniões, compromissos, eventos e conversas marcadas em data/horário',
  calls: 'ligações telefônicas, resultados de chamadas e workspace de ligação',
  communications: 'WhatsApp, e-mail, mensagens e comunicação externa',
  proposals: 'propostas comerciais, catálogo, produtos e preços',
  goals: 'metas, objetivos, alvos, quotas e quantidades comerciais por período',
  playbooks: 'roteiros comerciais, scripts e playbooks',
  automations: 'automações, gatilhos e regras automáticas',
  teams: 'equipes, membros, responsáveis e acesso',
  revenue: 'receita, faturamento e reconhecimento de receita',
  prospecting: 'Garimpo, prospecção, descoberta, ICP, ranking e aprovação de prospects',
  settings: 'configurações e preferências do CRM',
}

const readJsonBody = async (req, maxBytes = 1_000_000) => {
  let raw = ''
  for await (const chunk of req) {
    raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    if (Buffer.byteLength(raw) > maxBytes) throw new Error('payload_too_large')
  }
  return raw.trim() ? JSON.parse(raw) : {}
}

const sendJson = (res, status, value) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

const compactCapability = (capability) => ({
  id: String(capability?.id || ''),
  module: String(capability?.module || ''),
  title: String(capability?.title || ''),
  description: String(capability?.description || ''),
  action: String(capability?.action || ''),
  risk: String(capability?.risk || ''),
  reversible: Boolean(capability?.reversible),
  arguments: Array.isArray(capability?.arguments) ? capability.arguments.slice(0, 24) : [],
})

const semanticModuleRouter = async ({ prompt, context, capabilities }) => {
  const modules = [...new Set(capabilities.map((item) => String(item?.module || '')).filter(Boolean))]
  if (modules.length <= 1) return { modules, confidence: 1, rationale: 'catálogo já restrito' }

  const grouped = new Map()
  for (const capability of capabilities) {
    const module = String(capability?.module || '')
    if (!module) continue
    const bucket = grouped.get(module) || []
    bucket.push({ id: capability.id, title: capability.title, description: String(capability.description || '').slice(0, 160) })
    grouped.set(module, bucket)
  }

  const moduleCatalog = modules.map((module) => ({
    module,
    meaning: MODULE_SEMANTICS[module] || `módulo ${module}`,
    capabilities: (grouped.get(module) || []).slice(0, 10),
  }))

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      modules: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: modules } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      rationale: { type: 'string' },
    },
    required: ['modules', 'confidence', 'rationale'],
  }

  const instructions = `Você é o roteador semântico do RealTalent CRM. Sua única tarefa é escolher de 1 a 4 módulos capazes de executar o pedido atual.\n\nREGRAS:\n- Entenda SIGNIFICADO e OBJETIVO, não palavras exatas.\n- A mensagem atual tem prioridade. currentRoute é somente contexto e NUNCA limita o domínio.\n- Metas, objetivos, quotas e alvos comerciais pertencem ao módulo de metas/objetivos quando ele existir.\n- Reuniões, compromissos, eventos ou conversas marcadas para data/horário pertencem ao módulo de agenda quando ele existir.\n- Não confunda agendar reunião com enviar e-mail/WhatsApp.\n- Não confunda meta comercial com proposta.\n- Em pedido multi-etapa, selecione todos os módulos necessários, no máximo 4.\n- Se houver ambiguidade real, inclua os módulos plausíveis; não escolha um domínio sem relação.\n- Retorne somente JSON compatível com o schema.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS)
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: CRM_OLLAMA_MODEL,
        stream: false,
        think: false,
        keep_alive: '30m',
        format: schema,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: JSON.stringify({
            prompt,
            context: {
              currentRoute: context?.currentRoute || null,
              pendingCapabilityId: context?.pending_capability?.capabilityId || null,
            },
            modules: moduleCatalog,
          }) },
        ],
        options: { temperature: 0, num_predict: 320 },
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || data?.message || `Ollama router HTTP ${response.status}`)
    const parsed = JSON.parse(String(data?.message?.content || '{}'))
    const selected = Array.isArray(parsed?.modules)
      ? [...new Set(parsed.modules.map((item) => String(item)).filter((item) => modules.includes(item)))].slice(0, 4)
      : []
    if (!selected.length) throw new Error('router_semantic_empty')
    return {
      modules: selected,
      confidence: Number.isFinite(Number(parsed?.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0,
      rationale: String(parsed?.rationale || '').slice(0, 400),
    }
  } finally {
    clearTimeout(timer)
  }
}

const callInnerPlanner = async (body, reqHeaders = {}) => {
  const headers = { 'content-type': 'application/json' }
  const token = String(reqHeaders['x-realtalent-agent-token'] || '').trim()
  if (token) headers['x-realtalent-agent-token'] = token
  const response = await fetch(`http://${OUTER_HOST}:${INNER_PORT}/capabilities/plan`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

const handleCapabilityPlan = async (req, res) => {
  try {
    const body = await readJsonBody(req)
    const capabilities = Array.isArray(body?.capabilities)
      ? body.capabilities.map(compactCapability).filter((item) => item.id && item.module)
      : []

    if (!String(body?.prompt || '').trim() || !capabilities.length) {
      const { response, payload } = await callInnerPlanner(body, req.headers)
      return sendJson(res, response.status, payload)
    }

    let routing
    try {
      routing = await semanticModuleRouter({ prompt: String(body.prompt), context: body.context || {}, capabilities })
    } catch (error) {
      console.warn(`[ollama-router] semantic routing failed; using original catalog: ${error instanceof Error ? error.message : error}`)
      routing = { modules: [], confidence: 0, rationale: 'router fallback' }
    }

    const pendingId = String(body?.context?.pending_capability?.capabilityId || '')
    const pendingModule = pendingId ? capabilities.find((item) => item.id === pendingId)?.module : ''
    const selectedModules = new Set(routing.modules)
    if (pendingModule) selectedModules.add(pendingModule)

    const narrowed = selectedModules.size
      ? capabilities.filter((item) => selectedModules.has(item.module))
      : capabilities

    console.log(`[ollama-router] modules=${[...selectedModules].join(',') || 'all'} capabilities=${capabilities.length}->${narrowed.length} confidence=${routing.confidence}`)

    const { response, payload } = await callInnerPlanner({ ...body, capabilities: narrowed }, req.headers)
    if (payload && typeof payload === 'object') {
      payload.routing = {
        provider: 'ollama',
        model: CRM_OLLAMA_MODEL,
        modules: [...selectedModules],
        originalCapabilityCount: capabilities.length,
        routedCapabilityCount: narrowed.length,
        confidence: routing.confidence,
      }
    }
    return sendJson(res, response.status, payload)
  } catch (error) {
    return sendJson(res, 503, {
      ok: false,
      error: `Ollama semantic capability router: ${error instanceof Error ? error.message : String(error)}`,
      provider: 'ollama',
      model: CRM_OLLAMA_MODEL,
    })
  }
}

const proxyToInner = (req, res) => {
  const upstream = http.request({
    hostname: OUTER_HOST,
    port: INNER_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${OUTER_HOST}:${INNER_PORT}` },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
    upstreamRes.pipe(res)
  })
  upstream.on('error', (error) => {
    if (!res.headersSent) sendJson(res, 502, { ok: false, error: `Agent interno indisponível: ${error.message}` })
    else res.end()
  })
  req.pipe(upstream)
}

const routerServer = http.createServer((req, res) => {
  if (req.method === 'POST' && String(req.url || '').split('?')[0] === '/capabilities/plan') {
    handleCapabilityPlan(req, res)
    return
  }
  proxyToInner(req, res)
})

routerServer.listen(OUTER_PORT, OUTER_HOST, () => {
  console.log(`RealTalent Agent Ollama Router em http://${OUTER_HOST}:${OUTER_PORT}`)
  console.log(`Runtime interno: http://${OUTER_HOST}:${INNER_PORT}`)
  console.log(`IA: ollama · modelo único: ${CRM_OLLAMA_MODEL}`)
})
