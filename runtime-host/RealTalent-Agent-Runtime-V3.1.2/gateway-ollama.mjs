// RealTalent Agent — Ollama-only entrypoint with semantic capability routing.
// The public Agent stays on 8791. The original runtime runs on an internal port.
// Capability planning happens in two Ollama stages: business-domain routing first,
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

delete process.env.OPENAI_API_KEY
delete process.env.OPENAI_RESPONSES_URL
delete process.env.OPENAI_PROTECTION_BYPASS

process.env.REALTALENT_AGENT_PORT = String(INNER_PORT)
const sourcePath = fileURLToPath(new URL('./gateway.mjs', import.meta.url))
const generatedPath = fileURLToPath(new URL('./.gateway-ollama-runtime.generated.mjs', import.meta.url))
let source = fs.readFileSync(sourcePath, 'utf8')

const timeoutPattern = "timeoutMs:15_000,taskType:'classification'"
const timeoutReplacement = "timeoutMs:Number(process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS || 90_000),taskType:'classification'"
const timeoutMatches = source.split(timeoutPattern).length - 1
if (timeoutMatches !== 2) {
  throw new Error(`O gateway mudou: esperava 2 timeouts semânticos de 15s, encontrei ${timeoutMatches}. Nada foi iniciado para evitar um patch silencioso incorreto.`)
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
  dashboard: 'ações gerais do CRM: navegar entre telas, consultar de forma global, notificações ou desfazer uma ação',
  contacts: 'cadastro e manutenção de pessoas, contatos, clientes, leads e seus dados cadastrais',
  leads: 'cadastro e manutenção de leads, clientes e dados comerciais de prospecção já existentes no CRM',
  pipeline: 'oportunidades e negócios em andamento: etapas do funil, mover estágio, ganhar ou perder negócio',
  tasks: 'tarefas e lembretes pessoais/comerciais a fazer; algo que precisa ser executado depois',
  followups: 'follow-ups, atividades, notas e retornos comerciais associados a registros',
  agenda: 'agenda e calendário: criar, remarcar ou cancelar reunião, compromisso, evento ou conversa agendada para uma data/horário',
  calls: 'ligação telefônica operacional: abrir discador ou registrar resultado de uma chamada realizada; não é agendamento de reunião futura',
  communications: 'enviar ou trabalhar com mensagens externas por WhatsApp ou e-mail; não é apenas marcar uma reunião',
  proposals: 'propostas comerciais, produtos/serviços do catálogo, preços e condições comerciais',
  goals: 'metas, objetivos, quotas, alvos e quantidades comerciais a atingir em um período',
  playbooks: 'roteiros comerciais, scripts, playbooks e orientação de conversa de vendas',
  automations: 'automações, gatilhos, regras e ações automáticas recorrentes',
  teams: 'equipes, membros, responsáveis, permissões e distribuição de pessoas',
  revenue: 'receita, faturamento, reconhecimento financeiro e valores realizados/previstos',
  prospecting: 'Garimpo/prospecção: descobrir novas empresas/prospects, montar ICP, ranquear ou aprovar prospects; não é agenda nem cadastro comum',
  settings: 'configurações, preferências e administração do CRM',
}

const MODULE_EXAMPLES = {
  agenda: ['marque uma reunião amanhã às 14h', 'agenda uma call sexta com o cliente', 'reagende o compromisso para 16h'],
  goals: ['meta de 40 ligações amanhã', 'quero bater 15 propostas esta semana', 'defina objetivo de receita do mês'],
  prospecting: ['encontre 30 barbearias em Porto Alegre', 'garimpe clínicas em Canoas', 'ranqueie os prospects encontrados'],
  communications: ['mande um WhatsApp para Camila', 'envie um e-mail com a proposta', 'responda essa mensagem'],
  calls: ['ligue para Camila agora', 'registre que a ligação não atendeu', 'abra o discador desse contato'],
  tasks: ['crie uma tarefa para ligar amanhã', 'me lembre de revisar a proposta sexta'],
  pipeline: ['mova esse negócio para negociação', 'marque a oportunidade como ganha'],
  proposals: ['crie uma proposta de 20 mil', 'adicione esse serviço no catálogo'],
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

const semanticModuleRouter = async ({ prompt, capabilities }) => {
  const modules = [...new Set(capabilities.map((item) => String(item?.module || '')).filter(Boolean))]
  if (modules.length <= 1) return { modules, confidence: 1, rationale: 'catálogo já restrito' }

  // Stage 1 is intentionally tiny: no route, record context or capability list.
  // The local 4B model only answers "which business domain is this request about?".
  const moduleCatalog = modules.map((module) => ({
    module,
    meaning: MODULE_SEMANTICS[module] || `módulo ${module}`,
    examples: MODULE_EXAMPLES[module] || [],
  }))

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      primaryModule: { type: 'string', enum: modules },
      secondaryModules: { type: 'array', maxItems: 2, items: { type: 'string', enum: modules } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      canonicalIntent: { type: 'string' },
    },
    required: ['primaryModule', 'secondaryModules', 'confidence', 'canonicalIntent'],
  }

  const instructions = `Você é o roteador de domínio do RealTalent CRM. Classifique o OBJETIVO PRINCIPAL da mensagem atual em um domínio de negócio.\n\nREGRAS:\n- Interprete significado e intenção, não palavras isoladas.\n- Escolha exatamente UM primaryModule. secondaryModules só quando o mesmo pedido realmente exigir outro domínio.\n- Ignore completamente a tela atual do CRM. Ela não faz parte desta decisão.\n- Reunião, compromisso, evento ou conversa que o usuário quer MARCAR/AGENDAR para uma data ou horário pertence a agenda.\n- Uma call AGENDADA para depois pertence a agenda; fazer uma ligação agora ou registrar seu resultado pertence a calls.\n- Enviar mensagem pertence a communications. Apenas citar uma pessoa/cliente não transforma um agendamento em comunicação.\n- Descobrir novos prospects/empresas pertence a prospecting. Trabalhar com um cliente já citado em reunião não é prospecting.\n- Meta, objetivo, quota ou alvo comercial pertence a goals.\n- Proposta comercial pertence a proposals.\n- Não tente escolher uma capability. Nesta etapa escolha somente o domínio.\n- canonicalIntent deve resumir em português, em até uma frase, o que o usuário quer fazer.\n- Retorne somente JSON compatível com o schema.`

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
          { role: 'user', content: JSON.stringify({ request: String(prompt || '').slice(0, 4000), domains: moduleCatalog }) },
        ],
        options: { temperature: 0, num_predict: 240 },
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || data?.message || `Ollama router HTTP ${response.status}`)
    const parsed = JSON.parse(String(data?.message?.content || '{}'))
    const primary = modules.includes(String(parsed?.primaryModule || '')) ? String(parsed.primaryModule) : ''
    const secondary = Array.isArray(parsed?.secondaryModules)
      ? [...new Set(parsed.secondaryModules.map((item) => String(item)).filter((item) => modules.includes(item) && item !== primary))].slice(0, 2)
      : []
    if (!primary) throw new Error('router_semantic_empty')
    return {
      modules: [primary, ...secondary],
      primaryModule: primary,
      confidence: Number.isFinite(Number(parsed?.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0,
      rationale: String(parsed?.canonicalIntent || '').slice(0, 400),
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
      routing = await semanticModuleRouter({ prompt: String(body.prompt), capabilities })
    } catch (error) {
      console.warn(`[ollama-router] semantic routing failed; using original catalog: ${error instanceof Error ? error.message : error}`)
      routing = { modules: [], primaryModule: '', confidence: 0, rationale: 'router fallback' }
    }

    const pendingId = String(body?.context?.pending_capability?.capabilityId || '')
    const pendingModule = pendingId ? capabilities.find((item) => item.id === pendingId)?.module : ''
    const selectedModules = new Set(routing.modules)
    if (pendingModule) selectedModules.add(pendingModule)

    const narrowed = selectedModules.size
      ? capabilities.filter((item) => selectedModules.has(item.module))
      : capabilities

    console.log(`[ollama-router] primary=${routing.primaryModule || 'none'} modules=${[...selectedModules].join(',') || 'all'} capabilities=${capabilities.length}->${narrowed.length} confidence=${routing.confidence} intent=${routing.rationale}`)

    const { response, payload } = await callInnerPlanner({ ...body, capabilities: narrowed }, req.headers)
    if (payload && typeof payload === 'object') {
      payload.routing = {
        provider: 'ollama',
        model: CRM_OLLAMA_MODEL,
        primaryModule: routing.primaryModule || '',
        modules: [...selectedModules],
        canonicalIntent: routing.rationale,
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

const LOCAL_BROWSER_ORIGINS = new Set([
  'http://127.0.0.1:4188',
  'http://localhost:4188',
])

const applyLocalBrowserCors = (req, res) => {
  const origin = String(req.headers.origin || '')
  if (!LOCAL_BROWSER_ORIGINS.has(origin)) return false
  res.setHeader('access-control-allow-origin', origin)
  res.setHeader('vary', 'Origin')
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type,x-realtalent-agent-token,authorization')
  res.setHeader('access-control-max-age', '600')
  return true
}

const routerServer = http.createServer((req, res) => {
  applyLocalBrowserCors(req, res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
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