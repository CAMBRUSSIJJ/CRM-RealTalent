import {
  Copy,
  FileText,
  GitBranch,
  ListTree,
  Map as MapIcon,
  PlayCircle,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppActions } from '../../app/app-context'
import { NativeSelectionSelect } from '../../components/selection'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { Playbook, PlaybookConversationEdge, PlaybookConversationGraph, PlaybookConversationNode, PlaybookConversationNodeType } from '../../domain/types'
import {
  PLAYBOOK_NODE_TYPE_LABELS,
  autoLayoutConversationGraph,
  createPlaybookGraphTemplate,
  graphExecutionOrder,
  graphForPlaybook,
  graphToScript,
  nextEdgeId,
  nextNodeId,
  syncGuidanceFromGraph,
  type PlaybookGraphTemplateId,
} from '../../services/playbook-conversation-graph'

type StudioView = 'map' | 'structure' | 'script' | 'execution'

type DragState = {
  nodeId: string
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
}

const NODE_WIDTH = 238
const NODE_HEIGHT = 112
const templates: Array<{ id: PlaybookGraphTemplateId; label: string; description: string }> = [
  { id: 'blank', label: 'Em branco', description: 'Comece apenas com o nó raiz.' },
  { id: 'cold-call', label: 'Cold Call', description: 'Permissão → discovery → valor → próximo passo.' },
  { id: 'discovery', label: 'Discovery', description: 'Contexto → problema → impacto → decisão.' },
  { id: 'follow-up', label: 'Follow-up', description: 'Retome contexto, trate bloqueios e avance.' },
]

function cloneGraph(graph: PlaybookConversationGraph): PlaybookConversationGraph {
  return { ...graph, nodes: graph.nodes.map((item) => ({ ...item })), edges: graph.edges.map((item) => ({ ...item })) }
}

function defaultNodeTitle(type: PlaybookConversationNodeType) {
  return PLAYBOOK_NODE_TYPE_LABELS[type]
}

function nodeClass(type: PlaybookConversationNodeType) {
  return `playbook-studio__node playbook-studio__node--${type}`
}

export function PlaybookStudioModal({ open, playbook, onClose, onSaved }: {
  open: boolean
  playbook?: Playbook | null
  onClose(): void
  onSaved?(playbook: Playbook): void
}) {
  const { createPlaybook, updatePlaybook } = useAppActions()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [graph, setGraph] = useState<PlaybookConversationGraph>(() => createPlaybookGraphTemplate('cold-call'))
  const [view, setView] = useState<StudioView>('map')
  const [selectedNodeId, setSelectedNodeId] = useState('root')
  const [zoom, setZoom] = useState(0.9)
  const [busy, setBusy] = useState(false)
  const [executionNodeId, setExecutionNodeId] = useState('root')
  const [executionHistory, setExecutionHistory] = useState<string[]>([])
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    if (!open) return
    const nextGraph = playbook ? graphForPlaybook(playbook) : createPlaybookGraphTemplate('cold-call')
    setGraph(cloneGraph(nextGraph))
    setTitle(playbook?.title ?? 'Novo playbook')
    setCategory(playbook?.category ?? 'Prospecção')
    setTags(playbook?.tags.join(', ') ?? '')
    setView(nextGraph.defaultView ?? 'map')
    setSelectedNodeId(nextGraph.rootNodeId)
    setExecutionNodeId(nextGraph.rootNodeId)
    setExecutionHistory([])
    setZoom(0.9)
  }, [open, playbook])

  const selectedNode = useMemo(() => graph.nodes.find((item) => item.id === selectedNodeId) ?? graph.nodes[0], [graph.nodes, selectedNodeId])
  const inboundEdge = useMemo(() => graph.edges.find((item) => item.targetId === selectedNode?.id), [graph.edges, selectedNode?.id])
  const executionNode = useMemo(() => graph.nodes.find((item) => item.id === executionNodeId) ?? graph.nodes.find((item) => item.id === graph.rootNodeId) ?? graph.nodes[0], [executionNodeId, graph.nodes, graph.rootNodeId])
  const outgoingExecution = useMemo(() => graph.edges.filter((item) => item.sourceId === executionNode?.id), [executionNode?.id, graph.edges])
  const orderedNodes = useMemo(() => graphExecutionOrder(graph), [graph])
  const generatedScript = useMemo(() => graphToScript(graph), [graph])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      const deltaX = (event.clientX - drag.startClientX) / zoom
      const deltaY = (event.clientY - drag.startClientY) / zoom
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === drag.nodeId ? { ...item, x: Math.max(20, drag.startX + deltaX), y: Math.max(20, drag.startY + deltaY) } : item),
      }))
    }
    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp) }
  }, [zoom])

  const updateNode = (patch: Partial<PlaybookConversationNode>) => {
    if (!selectedNode) return
    setGraph((current) => ({ ...current, nodes: current.nodes.map((item) => item.id === selectedNode.id ? { ...item, ...patch } : item) }))
  }

  const updateInboundEdge = (patch: Partial<PlaybookConversationEdge>) => {
    if (!inboundEdge) return
    setGraph((current) => ({ ...current, edges: current.edges.map((item) => item.id === inboundEdge.id ? { ...item, ...patch } : item) }))
  }

  const addNode = (type: PlaybookConversationNodeType = 'question', parentId = selectedNode?.id || graph.rootNodeId, edgeLabel = 'Próximo') => {
    const id = nextNodeId(graph)
    const parent = graph.nodes.find((item) => item.id === parentId) ?? graph.nodes[0]
    const siblingCount = graph.edges.filter((item) => item.sourceId === parentId).length
    const nextNode: PlaybookConversationNode = {
      id,
      type,
      title: defaultNodeTitle(type),
      content: '',
      objective: '',
      x: (parent?.x ?? 80) + 310,
      y: Math.max(30, (parent?.y ?? 80) + siblingCount * 145 - (siblingCount ? 70 : 0)),
    }
    const nextEdge: PlaybookConversationEdge = { id: nextEdgeId(graph), sourceId: parentId, targetId: id, label: edgeLabel }
    setGraph((current) => ({ ...current, nodes: [...current.nodes, nextNode], edges: [...current.edges, nextEdge] }))
    setSelectedNodeId(id)
  }

  const duplicateNode = () => {
    if (!selectedNode) return
    const id = nextNodeId(graph)
    const copy: PlaybookConversationNode = { ...selectedNode, id, title: `${selectedNode.title} — cópia`, x: selectedNode.x + 40, y: selectedNode.y + 135 }
    setGraph((current) => ({ ...current, nodes: [...current.nodes, copy] }))
    setSelectedNodeId(id)
  }

  const removeNode = () => {
    if (!selectedNode || selectedNode.id === graph.rootNodeId) return
    const fallback = graph.edges.find((item) => item.targetId === selectedNode.id)?.sourceId ?? graph.rootNodeId
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.filter((item) => item.id !== selectedNode.id),
      edges: current.edges.filter((item) => item.sourceId !== selectedNode.id && item.targetId !== selectedNode.id),
    }))
    setSelectedNodeId(fallback)
  }

  const applyTemplate = (templateId: PlaybookGraphTemplateId) => {
    const next = createPlaybookGraphTemplate(templateId)
    setGraph(next)
    setSelectedNodeId(next.rootNodeId)
    setExecutionNodeId(next.rootNodeId)
    setExecutionHistory([])
  }

  const save = async () => {
    if (!title.trim() || !graph.nodes.length) return
    setBusy(true)
    try {
      const normalizedGraph = { ...graph, defaultView: view }
      const input = {
        kind: playbook?.kind ?? 'script' as const,
        title: title.trim(),
        category: category.trim(),
        content: generatedScript || title.trim(),
        tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
        guidance: syncGuidanceFromGraph(playbook, normalizedGraph),
        active: playbook?.active ?? true,
      }
      const saved = playbook ? await updatePlaybook(playbook.id, input) : await createPlaybook(input)
      onSaved?.(saved)
      onClose()
    } finally { setBusy(false) }
  }

  const goExecution = (edge: PlaybookConversationEdge) => {
    setExecutionHistory((current) => [...current, executionNodeId])
    setExecutionNodeId(edge.targetId)
  }

  const backExecution = () => {
    setExecutionHistory((current) => {
      const previous = current.at(-1)
      if (previous) setExecutionNodeId(previous)
      return current.slice(0, -1)
    })
  }

  const resetExecution = () => { setExecutionNodeId(graph.rootNodeId); setExecutionHistory([]) }

  const mapWidth = Math.max(1500, ...graph.nodes.map((item) => item.x + NODE_WIDTH + 120))
  const mapHeight = Math.max(760, ...graph.nodes.map((item) => item.y + NODE_HEIGHT + 120))

  return <Modal
    open={open}
    onClose={onClose}
    title={playbook ? `Playbook Studio · ${playbook.title}` : 'Playbook Studio · Novo roteiro'}
    subtitle="Desenhe a conversa como um fluxo: nós, caminhos, objeções, decisões e próximos passos."
    size="full"
    headerActions={<div className="playbook-studio__header-actions"><Button variant="secondary" size="sm" onClick={() => setGraph(autoLayoutConversationGraph(graph))}><WandSparkles size={15}/> Organizar</Button><Button size="sm" loading={busy} disabled={!title.trim()} onClick={() => void save()}><Save size={15}/> Salvar playbook</Button></div>}
  >
    <div className="playbook-studio">
      <header className="playbook-studio__meta">
        <label><span>Nome do playbook</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} /></label>
        <label><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="prospecção, discovery" /></label>
        <div className="playbook-studio__view-tabs" aria-label="Visualização do Playbook Studio">
          <button type="button" className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')}><MapIcon size={15}/> Mapa</button>
          <button type="button" className={view === 'structure' ? 'is-active' : ''} onClick={() => setView('structure')}><ListTree size={15}/> Estrutura</button>
          <button type="button" className={view === 'script' ? 'is-active' : ''} onClick={() => setView('script')}><FileText size={15}/> Script</button>
          <button type="button" className={view === 'execution' ? 'is-active' : ''} onClick={() => setView('execution')}><PlayCircle size={15}/> Execução</button>
        </div>
      </header>

      {view === 'map' ? <div className="playbook-studio__workspace">
        <aside className="playbook-studio__toolbox">
          <section>
            <span className="eyebrow">Criar</span>
            <h3>Blocos da conversa</h3>
            <div className="playbook-studio__node-types">
              {(Object.keys(PLAYBOOK_NODE_TYPE_LABELS) as PlaybookConversationNodeType[]).map((type) => <button type="button" key={type} onClick={() => addNode(type)}><Plus size={14}/><span>{PLAYBOOK_NODE_TYPE_LABELS[type]}</span></button>)}
            </div>
          </section>
          <section>
            <span className="eyebrow">Começar rápido</span>
            <h3>Templates</h3>
            <div className="playbook-studio__templates">{templates.map((template) => <button type="button" key={template.id} onClick={() => applyTemplate(template.id)}><strong>{template.label}</strong><span>{template.description}</span></button>)}</div>
          </section>
        </aside>

        <section className="playbook-studio__canvas-shell">
          <div className="playbook-studio__canvas-toolbar">
            <div><strong>{graph.nodes.length}</strong><span>nós</span><strong>{graph.edges.length}</strong><span>conexões</span></div>
            <div><button type="button" onClick={() => setZoom((value) => Math.max(0.55, Number((value - 0.1).toFixed(2))))}><ZoomOut size={16}/></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(1.35, Number((value + 0.1).toFixed(2))))}><ZoomIn size={16}/></button></div>
          </div>
          <div className="playbook-studio__canvas-scroll">
            <div className="playbook-studio__canvas" style={{ width: mapWidth * zoom, height: mapHeight * zoom }}>
              <div className="playbook-studio__canvas-transform" style={{ width: mapWidth, height: mapHeight, transform: `scale(${zoom})` }}>
                <svg className="playbook-studio__edges" width={mapWidth} height={mapHeight} aria-hidden="true">
                  <defs><marker id="playbook-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"/></marker></defs>
                  {graph.edges.map((item) => {
                    const source = graph.nodes.find((nodeItem) => nodeItem.id === item.sourceId)
                    const target = graph.nodes.find((nodeItem) => nodeItem.id === item.targetId)
                    if (!source || !target) return null
                    const x1 = source.x + NODE_WIDTH
                    const y1 = source.y + NODE_HEIGHT / 2
                    const x2 = target.x
                    const y2 = target.y + NODE_HEIGHT / 2
                    const control = Math.max(70, Math.abs(x2 - x1) * 0.42)
                    const d = `M ${x1} ${y1} C ${x1 + control} ${y1}, ${x2 - control} ${y2}, ${x2} ${y2}`
                    const lx = (x1 + x2) / 2
                    const ly = (y1 + y2) / 2
                    return <g key={item.id}><path d={d} markerEnd="url(#playbook-arrow)"/><text x={lx} y={ly - 8}>{item.label || 'Próximo'}</text></g>
                  })}
                </svg>
                {graph.nodes.map((item) => <article
                  key={item.id}
                  className={`${nodeClass(item.type)} ${item.id === selectedNode?.id ? 'is-selected' : ''} ${item.id === graph.rootNodeId ? 'is-root' : ''}`}
                  style={{ left: item.x, top: item.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
                  onClick={() => setSelectedNodeId(item.id)}
                >
                  <header onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); dragRef.current = { nodeId: item.id, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startX: item.x, startY: item.y } }}>
                    <span>{PLAYBOOK_NODE_TYPE_LABELS[item.type]}</span><GitBranch size={14}/>
                  </header>
                  <strong>{item.title || PLAYBOOK_NODE_TYPE_LABELS[item.type]}</strong>
                  <p>{item.content || 'Clique para editar este bloco.'}</p>
                </article>)}
              </div>
            </div>
          </div>
        </section>

        <aside className="playbook-studio__inspector">
          {selectedNode ? <>
            <div className="playbook-studio__inspector-heading"><div><span className="eyebrow">Inspector</span><h3>{selectedNode.title || PLAYBOOK_NODE_TYPE_LABELS[selectedNode.type]}</h3></div><span>{PLAYBOOK_NODE_TYPE_LABELS[selectedNode.type]}</span></div>
            <label><span>Tipo de nó</span><NativeSelectionSelect value={selectedNode.type} onChange={(event) => updateNode({ type: event.target.value as PlaybookConversationNodeType })}>{(Object.keys(PLAYBOOK_NODE_TYPE_LABELS) as PlaybookConversationNodeType[]).map((type) => <option value={type} key={type}>{PLAYBOOK_NODE_TYPE_LABELS[type]}</option>)}</NativeSelectionSelect></label>
            <label><span>Título</span><input value={selectedNode.title} onChange={(event) => updateNode({ title: event.target.value })}/></label>
            <label><span>Fala / conteúdo</span><textarea rows={5} value={selectedNode.content} onChange={(event) => updateNode({ content: event.target.value })} placeholder="O que o vendedor deve perguntar, falar ou observar?"/></label>
            <label><span>Objetivo deste nó</span><textarea rows={3} value={selectedNode.objective ?? ''} onChange={(event) => updateNode({ objective: event.target.value })} placeholder="O que precisa acontecer para seguir?"/></label>
            {inboundEdge ? <label><span>Nome do caminho que chega aqui</span><input value={inboundEdge.label ?? ''} onChange={(event) => updateInboundEdge({ label: event.target.value })} placeholder="Ex.: Pode falar, Está sem tempo, Preço"/></label> : null}
            <div className="playbook-studio__inspector-actions"><Button size="sm" onClick={() => addNode('question', selectedNode.id, 'Novo caminho')}><Plus size={15}/> Adicionar caminho</Button><Button variant="secondary" size="sm" onClick={duplicateNode}><Copy size={15}/> Duplicar</Button>{selectedNode.id !== graph.rootNodeId ? <Button variant="danger" size="sm" onClick={removeNode}><Trash2 size={15}/> Excluir</Button> : null}</div>
          </> : null}
        </aside>
      </div> : null}

      {view === 'structure' ? <section className="playbook-studio__structure">
        <header><div><span className="eyebrow">Estrutura</span><h3>Ordem lógica da conversa</h3><p>Uma leitura compacta do mesmo grafo, útil para revisar nomes, tipos e dependências.</p></div><Button variant="secondary" size="sm" onClick={() => setGraph(autoLayoutConversationGraph(graph))}><WandSparkles size={15}/> Reorganizar mapa</Button></header>
        <div>{orderedNodes.map((item, index) => { const incoming = graph.edges.find((edgeItem) => edgeItem.targetId === item.id); return <button type="button" key={item.id} onClick={() => { setSelectedNodeId(item.id); setView('map') }}><span>{index + 1}</span><div><small>{PLAYBOOK_NODE_TYPE_LABELS[item.type]}{incoming?.label ? ` · ${incoming.label}` : ''}</small><strong>{item.title}</strong><p>{item.content || item.objective || 'Sem conteúdo.'}</p></div></button> })}</div>
      </section> : null}

      {view === 'script' ? <section className="playbook-studio__script">
        <header><div><span className="eyebrow">Script</span><h3>Documento gerado a partir do mapa</h3><p>Você edita o grafo; o RealTalent mantém uma versão textual para busca, Calling e compatibilidade.</p></div></header>
        <pre>{generatedScript || 'Adicione nós ao mapa para gerar o script.'}</pre>
      </section> : null}

      {view === 'execution' ? <section className="playbook-studio__execution">
        <header><div><span className="eyebrow">Simulação</span><h3>Teste o caminho antes de publicar</h3><p>Percorra as respostas exatamente como o vendedor fará durante uma conversa.</p></div><Button variant="secondary" size="sm" onClick={resetExecution}><RotateCcw size={15}/> Reiniciar</Button></header>
        {executionNode ? <div className="playbook-studio__execution-stage">
          <article><span>{PLAYBOOK_NODE_TYPE_LABELS[executionNode.type]}</span><h2>{executionNode.title}</h2><p>{executionNode.content}</p>{executionNode.objective ? <aside><strong>Objetivo</strong><span>{executionNode.objective}</span></aside> : null}</article>
          <div className="playbook-studio__execution-paths">{outgoingExecution.length ? outgoingExecution.map((item) => { const target = graph.nodes.find((nodeItem) => nodeItem.id === item.targetId); return <button type="button" key={item.id} onClick={() => goExecution(item)}><span>{item.label || 'Próximo'}</span><strong>{target?.title ?? 'Continuar'}</strong></button> }) : <div className="playbook-studio__execution-end"><Sparkles size={22}/><strong>Fim deste caminho</strong><span>Esse nó não possui uma próxima conexão.</span></div>}</div>
          <footer><Button variant="secondary" disabled={!executionHistory.length} onClick={backExecution}>Voltar um passo</Button><span>{executionHistory.length + 1} nó(s) percorrido(s)</span></footer>
        </div> : null}
      </section> : null}
    </div>
  </Modal>
}
