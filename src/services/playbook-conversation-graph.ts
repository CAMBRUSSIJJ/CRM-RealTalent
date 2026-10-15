import type { Playbook, PlaybookConversationEdge, PlaybookConversationGraph, PlaybookConversationGroup, PlaybookConversationNode, PlaybookConversationNodeType } from '../domain/types'

export type PlaybookGraphTemplateId = 'blank' | 'cold-call' | 'discovery' | 'follow-up'

export const PLAYBOOK_NODE_TYPE_LABELS: Record<PlaybookConversationNodeType, string> = {
  stage: 'Fase',
  statement: 'Fala',
  question: 'Pergunta',
  decision: 'Decisão',
  objection: 'Objeção',
  action: 'Ação',
  outcome: 'Resultado',
  note: 'Nota',
}

const node = (id: string, type: PlaybookConversationNodeType, title: string, content: string, x: number, y: number, objective = ''): PlaybookConversationNode => ({ id, type, title, content, x, y, objective })
const edge = (id: string, sourceId: string, targetId: string, label = ''): PlaybookConversationEdge => ({ id, sourceId, targetId, label })

export function createPlaybookGraphTemplate(templateId: PlaybookGraphTemplateId): PlaybookConversationGraph {
  if (templateId === 'blank') return { version: 1, rootNodeId: 'root', defaultView: 'map', nodes: [node('root', 'stage', 'Conversa', 'Ponto de partida do playbook.', 80, 280)], edges: [] }
  if (templateId === 'discovery') return {
    version: 1, rootNodeId: 'root', defaultView: 'map',
    nodes: [
      node('root', 'stage', 'Discovery', 'Entender contexto, problema, impacto e decisão.', 70, 270),
      node('context', 'question', 'Contexto atual', 'Como vocês fazem isso hoje?', 390, 100, 'Entender o processo atual.'),
      node('problem', 'question', 'Problema', 'O que ainda incomoda ou limita o resultado?', 390, 255, 'Encontrar uma dor relevante.'),
      node('impact', 'question', 'Impacto', 'Quando isso acontece, qual é a consequência?', 710, 255, 'Dimensionar prioridade.'),
      node('decision', 'decision', 'Decisão', 'Quem além de você participa desta decisão?', 1030, 255, 'Mapear stakeholders.'),
      node('next', 'outcome', 'Próximo passo', 'Combine data, responsável e compromisso.', 1350, 255, 'Sair com uma ação concreta.'),
    ],
    edges: [edge('e1','root','context','Começar'), edge('e2','context','problem','Entender'), edge('e3','problem','impact','Aprofundar'), edge('e4','impact','decision','Qualificar'), edge('e5','decision','next','Avançar')],
  }
  if (templateId === 'follow-up') return {
    version: 1, rootNodeId: 'root', defaultView: 'map',
    nodes: [
      node('root','stage','Follow-up','Retomar contexto sem recomeçar a venda.',70,260),
      node('recap','statement','Retomar combinado','Na última conversa combinamos [próximo passo].',390,120,'Restabelecer contexto.'),
      node('status','question','O que mudou?','O que aconteceu desde a nossa última conversa?',390,290,'Descobrir avanço ou bloqueio.'),
      node('blocker','objection','Existe bloqueio','O que precisa ficar claro para vocês conseguirem avançar?',720,120,'Isolar objeção real.'),
      node('ready','decision','Está pronto para avançar?','Podemos definir o próximo passo agora?',720,310,'Obter compromisso.'),
      node('next','outcome','Próxima ação','Registre responsável, prazo e canal.',1060,220,'Fechar o loop.'),
    ],
    edges: [edge('e1','root','recap','Retomar'), edge('e2','recap','status','Atualizar'), edge('e3','status','blocker','Bloqueado'), edge('e4','status','ready','Em andamento'), edge('e5','blocker','ready','Resolver'), edge('e6','ready','next','Confirmar')],
  }
  return {
    version: 1, rootNodeId: 'root', defaultView: 'map',
    nodes: [
      node('root','stage','Cold Call','Ganhar permissão, descobrir relevância e combinar próximo passo.',60,280),
      node('permission','statement','Ganhar permissão','Posso explicar em 30 segundos o motivo da ligação e você me diz se vale continuar?',360,110,'Reduzir resistência inicial.'),
      node('permission-no','decision','Sem tempo agora','Sem problema. Qual período é melhor para eu retornar?',680,35,'Preservar abertura futura.'),
      node('discovery','question','Descobrir problema','Qual problema hoje mais incomoda ou faz vocês perderem tempo, clientes ou oportunidades?',680,220,'Identificar uma dor concreta.'),
      node('objection','objection','Resistência / objeção','Entenda a razão antes de responder.',1000,45,'Diagnosticar objeção.'),
      node('impact','question','Entender impacto','Quando isso acontece, qual é a consequência para vocês?',1000,235,'Transformar dor em prioridade.'),
      node('value','statement','Conectar valor','Relacione a solução somente ao problema que o lead confirmou.',1310,235,'Criar relevância sem apresentação genérica.'),
      node('next','outcome','Próximo passo','Combine data, horário e quem deve participar.',1610,235,'Gerar avanço verificável.'),
    ],
    edges: [
      edge('e1','root','permission','Abrir'), edge('e2','permission','discovery','Pode falar'), edge('e3','permission','permission-no','Sem tempo'),
      edge('e4','discovery','impact','Problema identificado'), edge('e5','discovery','objection','Objeção'), edge('e6','objection','impact','Contornada'),
      edge('e7','impact','value','Prioridade'), edge('e8','value','next','Avançar'),
    ],
  }
}

function safeGraph(graph: PlaybookConversationGraph | undefined): PlaybookConversationGraph | null {
  if (!graph || graph.version !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !graph.nodes.length) return null
  const ids = new Set(graph.nodes.map((item) => item.id))
  if (!ids.has(graph.rootNodeId)) return null
  const groups: PlaybookConversationGroup[] = Array.isArray(graph.groups)
    ? graph.groups.filter((item) => item && typeof item.id === 'string').map((item) => ({
      ...item,
      x: Number.isFinite(item.x) ? item.x : 40,
      y: Number.isFinite(item.y) ? item.y : 40,
      width: Number.isFinite(item.width) ? Math.max(280, item.width) : 680,
      height: Number.isFinite(item.height) ? Math.max(220, item.height) : 360,
    }))
    : []
  const groupIds = new Set(groups.map((item) => item.id))
  return {
    ...graph,
    groups,
    nodes: graph.nodes.map((item) => ({
      ...item,
      x: Number.isFinite(item.x) ? item.x : 80,
      y: Number.isFinite(item.y) ? item.y : 80,
      groupId: item.groupId && groupIds.has(item.groupId) ? item.groupId : undefined,
    })),
    edges: graph.edges.filter((item) => ids.has(item.sourceId) && ids.has(item.targetId)).map((item) => ({ ...item })),
  }
}

export function graphForPlaybook(playbook: Playbook): PlaybookConversationGraph {
  const existing = safeGraph(playbook.guidance?.conversationGraph)
  if (existing) return existing
  const graph = createPlaybookGraphTemplate('blank')
  graph.nodes[0] = { ...graph.nodes[0], title: playbook.title || 'Conversa', content: playbook.guidance?.coachingFocus || playbook.category || 'Roteiro comercial' }
  const paragraphs = playbook.content.split(/\n\s*\n/g).map((item) => item.trim()).filter(Boolean)
  let previous = graph.rootNodeId
  paragraphs.forEach((content, index) => {
    const id = `legacy-content-${index + 1}`
    graph.nodes.push(node(id, 'statement', paragraphs.length > 1 ? `Etapa ${index + 1}` : playbook.title, content, 390 + index * 300, 260))
    graph.edges.push(edge(`legacy-edge-${index + 1}`, previous, id, index === 0 ? 'Começar' : 'Próximo'))
    previous = id
  })
  const discoveryBaseY = 470
  ;(playbook.guidance?.discoveryQuestions ?? []).forEach((content, index) => {
    const id = `legacy-discovery-${index + 1}`
    graph.nodes.push(node(id, 'question', `Discovery ${index + 1}`, content, 390 + index * 300, discoveryBaseY, 'Pergunta de discovery'))
    graph.edges.push(edge(`legacy-discovery-edge-${index + 1}`, graph.rootNodeId, id, 'Discovery'))
  })
  ;(playbook.guidance?.objectionPrompts ?? []).slice(0, 4).forEach((content, index) => {
    const id = `legacy-objection-${index + 1}`
    graph.nodes.push(node(id, 'objection', content, 'Diagnostique antes de responder.', 700 + index * 280, 650, 'Tratar objeção'))
    graph.edges.push(edge(`legacy-objection-edge-${index + 1}`, graph.rootNodeId, id, 'Objeção'))
  })
  return graph
}

export function graphExecutionOrder(graph: PlaybookConversationGraph): PlaybookConversationNode[] {
  const nodes = new Map(graph.nodes.map((item) => [item.id, item]))
  const outgoing = new Map<string, PlaybookConversationEdge[]>()
  graph.edges.forEach((item) => outgoing.set(item.sourceId, [...(outgoing.get(item.sourceId) ?? []), item]))
  const seen = new Set<string>()
  const result: PlaybookConversationNode[] = []
  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const current = nodes.get(id)
    if (current) result.push(current)
    ;(outgoing.get(id) ?? []).forEach((item) => visit(item.targetId))
  }
  visit(graph.rootNodeId)
  graph.nodes.filter((item) => !seen.has(item.id)).sort((a,b) => a.x - b.x || a.y - b.y).forEach((item) => visit(item.id))
  return result
}

export function graphToScript(graph: PlaybookConversationGraph): string {
  return graphExecutionOrder(graph)
    .filter((item) => item.type !== 'stage' && (item.content.trim() || item.title.trim()))
    .map((item) => `${PLAYBOOK_NODE_TYPE_LABELS[item.type].toUpperCase()} — ${item.title}\n${item.content}`.trim())
    .join('\n\n')
}

export function syncGuidanceFromGraph(playbook: Playbook | null | undefined, graph: PlaybookConversationGraph) {
  const previous = playbook?.guidance ?? {}
  return {
    ...previous,
    conversationGraph: graph,
    discoveryQuestions: graph.nodes.filter((item) => item.type === 'question').map((item) => item.content.trim()).filter(Boolean),
    objectionPrompts: graph.nodes.filter((item) => item.type === 'objection').map((item) => item.title.trim() || item.content.trim()).filter(Boolean),
    successCriteria: graph.nodes.filter((item) => item.type === 'outcome').map((item) => item.objective?.trim() || item.title.trim()).filter(Boolean),
  }
}

export function nextNodeId(graph: PlaybookConversationGraph) {
  let index = graph.nodes.length + 1
  while (graph.nodes.some((item) => item.id === `node-${index}`)) index += 1
  return `node-${index}`
}

export function nextEdgeId(graph: PlaybookConversationGraph) {
  let index = graph.edges.length + 1
  while (graph.edges.some((item) => item.id === `edge-${index}`)) index += 1
  return `edge-${index}`
}

export function nextGroupId(graph: PlaybookConversationGraph) {
  const groups = graph.groups ?? []
  let index = groups.length + 1
  while (groups.some((item) => item.id === `group-${index}`)) index += 1
  return `group-${index}`
}

export function autoLayoutConversationGraph(graph: PlaybookConversationGraph): PlaybookConversationGraph {
  const levels = new Map<string, number>([[graph.rootNodeId, 0]])
  let changed = true
  for (let pass = 0; pass < graph.nodes.length && changed; pass += 1) {
    changed = false
    for (const item of graph.edges) {
      const sourceLevel = levels.get(item.sourceId)
      if (sourceLevel === undefined) continue
      const next = sourceLevel + 1
      if ((levels.get(item.targetId) ?? -1) < next) { levels.set(item.targetId, next); changed = true }
    }
  }
  const groups = new Map<number, PlaybookConversationNode[]>()
  graph.nodes.forEach((item) => {
    const level = levels.get(item.id) ?? 0
    groups.set(level, [...(groups.get(level) ?? []), item])
  })
  return {
    ...graph,
    nodes: graph.nodes.map((item) => {
      const level = levels.get(item.id) ?? 0
      const peers = groups.get(level) ?? [item]
      const index = peers.findIndex((peer) => peer.id === item.id)
      return { ...item, x: 70 + level * 310, y: 70 + index * 155 }
    }),
  }
}
