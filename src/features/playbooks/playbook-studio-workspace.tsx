import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  GitBranch,
  Keyboard,
  Layers3,
  Link2,
  ListTree,
  Map as MapIcon,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PlayCircle,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppActions } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import type {
  Playbook,
  PlaybookConversationEdge,
  PlaybookConversationGraph,
  PlaybookConversationGroup,
  PlaybookConversationNode,
  PlaybookConversationNodeColor,
  PlaybookConversationNodeType,
} from '../../domain/types'
import {
  PLAYBOOK_NODE_TYPE_LABELS,
  autoLayoutConversationGraph,
  createPlaybookGraphTemplate,
  graphExecutionOrder,
  graphForPlaybook,
  graphToScript,
  nextEdgeId,
  nextGroupId,
  nextNodeId,
  syncGuidanceFromGraph,
  type PlaybookGraphTemplateId,
} from '../../services/playbook-conversation-graph'
import { useFpsMonitor } from '../../lib/use-fps-monitor'

type StudioView = 'map' | 'structure' | 'script' | 'execution'
type DragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  origins: Record<string, { x: number; y: number }>
  deltaX: number
  deltaY: number
  moved: boolean
}
type GroupDragState = {
  groupId: string
  pointerId: number
  startClientX: number
  startClientY: number
  groupOrigin: { x: number; y: number }
  nodeOrigins: Record<string, { x: number; y: number }>
  deltaX: number
  deltaY: number
  moved: boolean
}
type PanState = { pointerId: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number }
type MarqueeState = { pointerId: number; startX: number; startY: number; currentX: number; currentY: number }
type PendingPointerMove = { pointerId: number; clientX: number; clientY: number }
type CanvasViewport = { left: number; top: number; width: number; height: number }

type QuickPathState = {
  parentId: string
  label: string
  type: PlaybookConversationNodeType
}

const NODE_WIDTH = 248
const NODE_HEIGHT = 122
const GROUP_PADDING = 46
const GRID_SIZE = 20
const VIEWPORT_OVERSCAN = 420
const nodeColors: PlaybookConversationNodeColor[] = ['blue','sky','violet','amber','rose','slate']
const nodeTypes = Object.keys(PLAYBOOK_NODE_TYPE_LABELS) as PlaybookConversationNodeType[]
const templates: Array<{ id: PlaybookGraphTemplateId; label: string; description: string }> = [
  { id: 'blank', label: 'Em branco', description: 'Comece com a raiz e desenhe livremente.' },
  { id: 'cold-call', label: 'Cold Call', description: 'Permissão → discovery → valor → próximo passo.' },
  { id: 'discovery', label: 'Discovery', description: 'Contexto → problema → impacto → decisão.' },
  { id: 'follow-up', label: 'Follow-up', description: 'Retome contexto, trate bloqueios e avance.' },
]

function cloneGraph(graph: PlaybookConversationGraph): PlaybookConversationGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((item) => ({ ...item })),
    edges: graph.edges.map((item) => ({ ...item })),
    groups: (graph.groups ?? []).map((item) => ({ ...item })),
  }
}

function nodeClass(type: PlaybookConversationNodeType) {
  return `playbook-workspace__node playbook-workspace__node--${type}`
}

function graphHealth(graph: PlaybookConversationGraph) {
  const issues: string[] = []
  graph.nodes.forEach((node) => {
    const outgoing = graph.edges.filter((edge) => edge.sourceId === node.id)
    if (node.type === 'decision' && outgoing.length < 2) issues.push(`${node.title || 'Decisão'} precisa de pelo menos dois caminhos.`)
    if (node.type === 'objection' && !outgoing.length) issues.push(`${node.title || 'Objeção'} ainda não possui resposta ou próximo passo.`)
  })
  const hasOutcome = graph.nodes.some((node) => node.type === 'outcome')
  if (!hasOutcome) issues.push('Adicione pelo menos um resultado ou encerramento ao fluxo.')
  return issues
}

function editableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'))
}

export function PlaybookStudioWorkspace({ playbook, onClose, onSaved }: {
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(['root'])
  const [connectFromId, setConnectFromId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.9)
  const [busy, setBusy] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [executionNodeId, setExecutionNodeId] = useState('root')
  const [executionHistory, setExecutionHistory] = useState<string[]>([])
  const [toolboxOpen, setToolboxOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickPath, setQuickPath] = useState<QuickPathState | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const groupDragRef = useRef<GroupDragState | null>(null)
  const panRef = useRef<PanState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const suppressClickRef = useRef(false)
  const canvasScrollRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef(graph)
  const zoomRef = useRef(zoom)
  const snapRef = useRef(snapToGrid)
  const pointerFrameRef = useRef<number | null>(null)
  const pendingPointerRef = useRef<PendingPointerMove | null>(null)
  const nodeElementRefs = useRef(new Map<string, HTMLElement>())
  const groupElementRefs = useRef(new Map<string, HTMLElement>())
  const viewportFrameRef = useRef<number | null>(null)
  const [viewport, setViewport] = useState<CanvasViewport>({ left: 0, top: 0, width: 1900, height: 1100 })
  graphRef.current = graph
  zoomRef.current = zoom
  snapRef.current = snapToGrid
  const performance = useFpsMonitor(view === 'map')

  useEffect(() => {
    const nextGraph = playbook ? graphForPlaybook(playbook) : createPlaybookGraphTemplate('cold-call')
    setGraph(cloneGraph(nextGraph))
    setTitle(playbook?.title ?? 'Novo playbook')
    setCategory(playbook?.category ?? 'Prospecção')
    setTags(playbook?.tags.join(', ') ?? '')
    setView(nextGraph.defaultView ?? 'map')
    setSelectedNodeId(nextGraph.rootNodeId)
    setSelectedNodeIds([nextGraph.rootNodeId])
    setConnectFromId(null)
    setExecutionNodeId(nextGraph.rootNodeId)
    setExecutionHistory([])
    setZoom(0.9)
    setLastSavedAt(null)
  }, [playbook?.id])

  const selectedNodes = useMemo(() => graph.nodes.filter((item) => selectedNodeIds.includes(item.id)), [graph.nodes, selectedNodeIds])
  const selectedNode = useMemo(() => selectedNodeIds.length === 1 ? graph.nodes.find((item) => item.id === selectedNodeId) : undefined, [graph.nodes, selectedNodeId, selectedNodeIds.length])
  const inboundEdge = useMemo(() => graph.edges.find((item) => item.targetId === selectedNode?.id), [graph.edges, selectedNode?.id])
  const outgoingSelected = useMemo(() => graph.edges.filter((item) => item.sourceId === selectedNode?.id), [graph.edges, selectedNode?.id])
  const executionNode = useMemo(() => graph.nodes.find((item) => item.id === executionNodeId) ?? graph.nodes.find((item) => item.id === graph.rootNodeId) ?? graph.nodes[0], [executionNodeId, graph.nodes, graph.rootNodeId])
  const outgoingExecution = useMemo(() => graph.edges.filter((item) => item.sourceId === executionNode?.id), [executionNode?.id, graph.edges])
  const orderedNodes = useMemo(() => graphExecutionOrder(graph), [graph])
  const generatedScript = useMemo(() => graphToScript(graph), [graph])
  const healthIssues = useMemo(() => graphHealth(graph), [graph])
  const nodeById = useMemo(() => new Map(graph.nodes.map((item) => [item.id, item])), [graph.nodes])
  const outgoingCount = useMemo(() => { const result = new Map<string, number>(); graph.edges.forEach((edge) => result.set(edge.sourceId, (result.get(edge.sourceId) ?? 0) + 1)); return result }, [graph.edges])
  const visibleBounds = useMemo(() => ({
    left: viewport.left - VIEWPORT_OVERSCAN,
    top: viewport.top - VIEWPORT_OVERSCAN,
    right: viewport.left + viewport.width + VIEWPORT_OVERSCAN,
    bottom: viewport.top + viewport.height + VIEWPORT_OVERSCAN,
  }), [viewport])
  const visibleNodes = useMemo(() => graph.nodes.filter((node) => node.id === selectedNodeId || (node.x < visibleBounds.right && node.x + NODE_WIDTH > visibleBounds.left && node.y < visibleBounds.bottom && node.y + NODE_HEIGHT > visibleBounds.top)), [graph.nodes, selectedNodeId, visibleBounds])
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const visibleEdges = useMemo(() => graph.edges.filter((edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId)), [graph.edges, visibleNodeIds])
  const visibleGroups = useMemo(() => (graph.groups ?? []).filter((group) => group.x < visibleBounds.right && group.x + group.width > visibleBounds.left && group.y < visibleBounds.bottom && group.y + group.height > visibleBounds.top), [graph.groups, visibleBounds])

  const canvasPoint = (clientX: number, clientY: number) => {
    const scroll = canvasScrollRef.current
    if (!scroll) return { x: 0, y: 0 }
    const rect = scroll.getBoundingClientRect()
    return {
      x: (scroll.scrollLeft + clientX - rect.left) / zoom,
      y: (scroll.scrollTop + clientY - rect.top) / zoom,
    }
  }

  useEffect(() => {
    if (view !== 'map') return
    const scroll = canvasScrollRef.current
    if (!scroll) return
    const measure = () => {
      viewportFrameRef.current = null
      const currentZoom = zoomRef.current || 1
      setViewport({ left: scroll.scrollLeft / currentZoom, top: scroll.scrollTop / currentZoom, width: scroll.clientWidth / currentZoom, height: scroll.clientHeight / currentZoom })
    }
    const schedule = () => { if (viewportFrameRef.current === null) viewportFrameRef.current = requestAnimationFrame(measure) }
    measure()
    scroll.addEventListener('scroll', schedule, { passive: true })
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    resizeObserver?.observe(scroll)
    return () => {
      scroll.removeEventListener('scroll', schedule)
      resizeObserver?.disconnect()
      if (viewportFrameRef.current !== null) cancelAnimationFrame(viewportFrameRef.current)
    }
  }, [view, zoom])

  useEffect(() => {
    const snap = (value: number) => snapRef.current ? Math.round(value / GRID_SIZE) * GRID_SIZE : value
    const pointFor = (clientX: number, clientY: number) => {
      const scroll = canvasScrollRef.current
      if (!scroll) return { x: 0, y: 0 }
      const rect = scroll.getBoundingClientRect()
      const currentZoom = zoomRef.current || 1
      return { x: (scroll.scrollLeft + clientX - rect.left) / currentZoom, y: (scroll.scrollTop + clientY - rect.top) / currentZoom }
    }
    const processMove = (move: PendingPointerMove) => {
      const drag = dragRef.current
      const currentZoom = zoomRef.current || 1
      if (drag && move.pointerId === drag.pointerId) {
        const deltaX = (move.clientX - drag.startClientX) / currentZoom
        const deltaY = (move.clientY - drag.startClientY) / currentZoom
        drag.deltaX = deltaX; drag.deltaY = deltaY
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) drag.moved = true
        for (const nodeId of Object.keys(drag.origins)) {
          const element = nodeElementRefs.current.get(nodeId)
          if (!element) continue
          element.style.transition = 'none'
          element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
        }
        return
      }
      const groupDrag = groupDragRef.current
      if (groupDrag && move.pointerId === groupDrag.pointerId) {
        const deltaX = (move.clientX - groupDrag.startClientX) / currentZoom
        const deltaY = (move.clientY - groupDrag.startClientY) / currentZoom
        groupDrag.deltaX = deltaX; groupDrag.deltaY = deltaY
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) groupDrag.moved = true
        const groupElement = groupElementRefs.current.get(groupDrag.groupId)
        if (groupElement) groupElement.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
        for (const nodeId of Object.keys(groupDrag.nodeOrigins)) {
          const element = nodeElementRefs.current.get(nodeId)
          if (!element) continue
          element.style.transition = 'none'
          element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
        }
        return
      }
      const marqueeState = marqueeRef.current
      if (marqueeState && move.pointerId === marqueeState.pointerId) {
        const point = pointFor(move.clientX, move.clientY)
        const next = { ...marqueeState, currentX: point.x, currentY: point.y }
        marqueeRef.current = next
        setMarquee(next)
        return
      }
      const pan = panRef.current
      const scroll = canvasScrollRef.current
      if (pan && scroll && move.pointerId === pan.pointerId) {
        scroll.scrollLeft = pan.startScrollLeft - (move.clientX - pan.startClientX)
        scroll.scrollTop = pan.startScrollTop - (move.clientY - pan.startClientY)
      }
    }
    const flushMove = () => {
      pointerFrameRef.current = null
      const pending = pendingPointerRef.current
      pendingPointerRef.current = null
      if (pending) processMove(pending)
    }
    const onPointerMove = (event: PointerEvent) => {
      pendingPointerRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
      if (pointerFrameRef.current === null) pointerFrameRef.current = requestAnimationFrame(flushMove)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (pendingPointerRef.current?.pointerId === event.pointerId) flushMove()
      const completedDrag = dragRef.current?.pointerId === event.pointerId ? dragRef.current : null
      if (completedDrag) {
        if (completedDrag.moved) {
          suppressClickRef.current = true
          setGraph((current) => ({ ...current, nodes: current.nodes.map((item) => {
            const origin = completedDrag.origins[item.id]
            return origin ? { ...item, x: Math.max(20, snap(origin.x + completedDrag.deltaX)), y: Math.max(20, snap(origin.y + completedDrag.deltaY)) } : item
          }) }))
        }
        for (const nodeId of Object.keys(completedDrag.origins)) { const element = nodeElementRefs.current.get(nodeId); if (element) { element.style.transform = ''; element.style.transition = '' } }
        dragRef.current = null
      }
      const completedGroupDrag = groupDragRef.current?.pointerId === event.pointerId ? groupDragRef.current : null
      if (completedGroupDrag) {
        if (completedGroupDrag.moved) {
          suppressClickRef.current = true
          setGraph((current) => ({
            ...current,
            groups: (current.groups ?? []).map((item) => item.id === completedGroupDrag.groupId ? { ...item, x: Math.max(10, snap(completedGroupDrag.groupOrigin.x + completedGroupDrag.deltaX)), y: Math.max(10, snap(completedGroupDrag.groupOrigin.y + completedGroupDrag.deltaY)) } : item),
            nodes: current.nodes.map((item) => { const origin = completedGroupDrag.nodeOrigins[item.id]; return origin ? { ...item, x: Math.max(20, snap(origin.x + completedGroupDrag.deltaX)), y: Math.max(20, snap(origin.y + completedGroupDrag.deltaY)) } : item }),
          }))
        }
        const groupElement = groupElementRefs.current.get(completedGroupDrag.groupId); if (groupElement) groupElement.style.transform = ''
        for (const nodeId of Object.keys(completedGroupDrag.nodeOrigins)) { const element = nodeElementRefs.current.get(nodeId); if (element) { element.style.transform = ''; element.style.transition = '' } }
        groupDragRef.current = null
      }
      const marqueeState = marqueeRef.current
      if (marqueeState?.pointerId === event.pointerId) {
        const left = Math.min(marqueeState.startX, marqueeState.currentX), right = Math.max(marqueeState.startX, marqueeState.currentX)
        const top = Math.min(marqueeState.startY, marqueeState.currentY), bottom = Math.max(marqueeState.startY, marqueeState.currentY)
        const ids = graphRef.current.nodes.filter((node) => node.x < right && node.x + NODE_WIDTH > left && node.y < bottom && node.y + NODE_HEIGHT > top).map((node) => node.id)
        setSelectedNodeIds(ids); if (ids[0]) setSelectedNodeId(ids[0]); marqueeRef.current = null; setMarquee(null)
      }
      if (panRef.current?.pointerId === event.pointerId) panRef.current = null
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current)
    }
  }, [])

  const updateNodeById = (nodeId: string, patch: Partial<PlaybookConversationNode>) => {
    setGraph((current) => ({ ...current, nodes: current.nodes.map((item) => item.id === nodeId ? { ...item, ...patch } : item) }))
  }

  const updateNode = (patch: Partial<PlaybookConversationNode>) => {
    if (!selectedNode) return
    updateNodeById(selectedNode.id, patch)
  }

  const updateEdge = (edgeId: string, patch: Partial<PlaybookConversationEdge>) => {
    setGraph((current) => ({ ...current, edges: current.edges.map((item) => item.id === edgeId ? { ...item, ...patch } : item) }))
  }

  const updateGroup = (groupId: string, patch: Partial<PlaybookConversationGroup>) => {
    setGraph((current) => ({ ...current, groups: (current.groups ?? []).map((item) => item.id === groupId ? { ...item, ...patch } : item) }))
  }

  const selectOnly = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    setSelectedNodeIds([nodeId])
  }

  const toggleNodeSelection = (nodeId: string) => {
    setSelectedNodeIds((current) => {
      if (current.includes(nodeId)) {
        const next = current.filter((item) => item !== nodeId)
        if (selectedNodeId === nodeId && next[0]) setSelectedNodeId(next[0])
        return next
      }
      setSelectedNodeId(nodeId)
      return [...current, nodeId]
    })
  }

  const addNode = (type: PlaybookConversationNodeType = 'question', parentId = selectedNode?.id || graph.rootNodeId, edgeLabel = 'Próximo') => {
    const id = nextNodeId(graph)
    const parent = graph.nodes.find((item) => item.id === parentId) ?? graph.nodes[0]
    const siblingCount = graph.edges.filter((item) => item.sourceId === parentId).length
    const nextNode: PlaybookConversationNode = {
      id,
      type,
      title: PLAYBOOK_NODE_TYPE_LABELS[type],
      content: '',
      objective: '',
      x: (parent?.x ?? 80) + 320,
      y: Math.max(30, (parent?.y ?? 80) + siblingCount * 150 - (siblingCount ? 72 : 0)),
      groupId: parent?.groupId,
      color: parent?.color ?? 'blue',
    }
    const nextEdge: PlaybookConversationEdge = { id: nextEdgeId(graph), sourceId: parentId, targetId: id, label: edgeLabel.trim() || 'Próximo' }
    setGraph((current) => ({ ...current, nodes: [...current.nodes, nextNode], edges: [...current.edges, nextEdge] }))
    selectOnly(id)
    setQuickPath(null)
    setInspectorOpen(true)
  }

  const duplicateSelection = () => {
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : []
    if (!ids.length) return
    let working = cloneGraph(graph)
    const idMap = new Map<string, string>()
    const copies: PlaybookConversationNode[] = []
    ids.forEach((sourceId) => {
      const source = working.nodes.find((item) => item.id === sourceId)
      if (!source) return
      const id = nextNodeId({ ...working, nodes: [...working.nodes, ...copies] })
      idMap.set(sourceId, id)
      copies.push({ ...source, id, title: `${source.title} — cópia`, x: source.x + 54, y: source.y + 54, groupId: undefined })
    })
    working = { ...working, nodes: [...working.nodes, ...copies] }
    graph.edges.filter((edge) => idMap.has(edge.sourceId) && idMap.has(edge.targetId)).forEach((edge) => {
      const newEdge: PlaybookConversationEdge = { ...edge, id: nextEdgeId(working), sourceId: idMap.get(edge.sourceId)!, targetId: idMap.get(edge.targetId)! }
      working = { ...working, edges: [...working.edges, newEdge] }
    })
    setGraph(working)
    const copyIds = copies.map((item) => item.id)
    setSelectedNodeIds(copyIds)
    if (copyIds[0]) setSelectedNodeId(copyIds[0])
  }

  const removeSelectedNodes = () => {
    const removable = selectedNodeIds.filter((id) => id !== graph.rootNodeId)
    if (!removable.length) return
    const removeSet = new Set(removable)
    setGraph((current) => {
      const nodes = current.nodes.filter((item) => !removeSet.has(item.id))
      const activeGroupIds = new Set(nodes.map((item) => item.groupId).filter(Boolean))
      return {
        ...current,
        nodes,
        edges: current.edges.filter((item) => !removeSet.has(item.sourceId) && !removeSet.has(item.targetId)),
        groups: (current.groups ?? []).filter((item) => activeGroupIds.has(item.id)),
      }
    })
    selectOnly(graph.rootNodeId)
  }

  const duplicateNode = () => duplicateSelection()
  const removeNode = () => removeSelectedNodes()

  const groupSelection = () => {
    if (selectedNodes.length < 2) return
    setGraph((current) => {
      const nodes = current.nodes.filter((item) => selectedNodeIds.includes(item.id))
      if (nodes.length < 2) return current
      const minX = Math.min(...nodes.map((item) => item.x))
      const minY = Math.min(...nodes.map((item) => item.y))
      const maxX = Math.max(...nodes.map((item) => item.x + NODE_WIDTH))
      const maxY = Math.max(...nodes.map((item) => item.y + NODE_HEIGHT))
      const id = nextGroupId(current)
      const group: PlaybookConversationGroup = {
        id,
        title: 'Nova fase',
        x: Math.max(12, minX - GROUP_PADDING),
        y: Math.max(12, minY - GROUP_PADDING - 22),
        width: Math.max(360, maxX - minX + GROUP_PADDING * 2),
        height: Math.max(240, maxY - minY + GROUP_PADDING * 2 + 22),
      }
      return {
        ...current,
        groups: [...(current.groups ?? []), group],
        nodes: current.nodes.map((item) => selectedNodeIds.includes(item.id) ? { ...item, groupId: id } : item),
      }
    })
  }

  const removeSelectionFromGroups = () => {
    if (!selectedNodeIds.length) return
    setGraph((current) => {
      const nodes = current.nodes.map((item) => selectedNodeIds.includes(item.id) ? { ...item, groupId: undefined } : item)
      const activeGroupIds = new Set(nodes.map((item) => item.groupId).filter(Boolean))
      return { ...current, nodes, groups: (current.groups ?? []).filter((item) => activeGroupIds.has(item.id)) }
    })
  }

  const ungroupGroup = (groupId: string) => {
    setGraph((current) => ({
      ...current,
      groups: (current.groups ?? []).filter((item) => item.id !== groupId),
      nodes: current.nodes.map((item) => item.groupId === groupId ? { ...item, groupId: undefined } : item),
    }))
  }

  const alignSelection = () => {
    if (selectedNodes.length < 2) return
    const top = Math.min(...selectedNodes.map((item) => item.y))
    setGraph((current) => ({ ...current, nodes: current.nodes.map((item) => selectedNodeIds.includes(item.id) ? { ...item, y: top } : item) }))
  }

  const distributeSelection = () => {
    if (selectedNodes.length < 3) return
    const sorted = [...selectedNodes].sort((a, b) => a.x - b.x)
    const start = sorted[0].x
    const end = sorted.at(-1)?.x ?? start
    const step = (end - start) / Math.max(1, sorted.length - 1)
    const positions = new Map(sorted.map((item, index) => [item.id, start + index * step]))
    setGraph((current) => ({ ...current, nodes: current.nodes.map((item) => positions.has(item.id) ? { ...item, x: positions.get(item.id)! } : item) }))
  }

  const nudgeSelection = (dx: number, dy: number) => {
    if (!selectedNodeIds.length) return
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((item) => selectedNodeIds.includes(item.id) ? { ...item, x: Math.max(20, item.x + dx), y: Math.max(20, item.y + dy) } : item),
    }))
  }

  const colorSelection = (color: PlaybookConversationNodeColor) => {
    if (!selectedNodeIds.length) return
    setGraph((current) => ({ ...current, nodes: current.nodes.map((item) => selectedNodeIds.includes(item.id) ? { ...item, color } : item) }))
  }

  const startConnection = (nodeId: string) => {
    setConnectFromId((current) => current === nodeId ? null : nodeId)
    selectOnly(nodeId)
  }

  const completeConnection = (targetId: string) => {
    if (!connectFromId || connectFromId === targetId) return
    setGraph((current) => {
      if (current.edges.some((edge) => edge.sourceId === connectFromId && edge.targetId === targetId)) return current
      return { ...current, edges: [...current.edges, { id: nextEdgeId(current), sourceId: connectFromId, targetId, label: 'Próximo' }] }
    })
    setConnectFromId(null)
    selectOnly(targetId)
    setInspectorOpen(true)
  }

  const applyTemplate = (templateId: PlaybookGraphTemplateId) => {
    const next = createPlaybookGraphTemplate(templateId)
    setGraph(next)
    selectOnly(next.rootNodeId)
    setConnectFromId(null)
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
      setLastSavedAt(Date.now())
      onSaved?.(saved)
    } finally { setBusy(false) }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editableTarget(event.target)) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); return }
      if (view !== 'map') return
      if (command && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelectedNodeIds(graph.nodes.map((item) => item.id)); if (graph.nodes[0]) setSelectedNodeId(graph.nodes[0].id); return }
      if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); return }
      if (command && event.key.toLowerCase() === 'g') { event.preventDefault(); groupSelection(); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelectedNodes(); return }
      if (event.key === 'Escape') { setConnectFromId(null); setQuickPath(null); setSelectedNodeIds([]); return }
      const step = event.shiftKey ? 10 : 2
      if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeSelection(-step, 0) }
      if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSelection(step, 0) }
      if (event.key === 'ArrowUp') { event.preventDefault(); nudgeSelection(0, -step) }
      if (event.key === 'ArrowDown') { event.preventDefault(); nudgeSelection(0, step) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

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

  const fitContent = () => {
    const scroll = canvasScrollRef.current
    if (!scroll || !graph.nodes.length) return
    const groups = graph.groups ?? []
    const minX = Math.min(...graph.nodes.map((item) => item.x), ...groups.map((item) => item.x), 0)
    const minY = Math.min(...graph.nodes.map((item) => item.y), ...groups.map((item) => item.y), 0)
    const maxX = Math.max(...graph.nodes.map((item) => item.x + NODE_WIDTH), ...groups.map((item) => item.x + item.width), 800)
    const maxY = Math.max(...graph.nodes.map((item) => item.y + NODE_HEIGHT), ...groups.map((item) => item.y + item.height), 500)
    const width = Math.max(1, maxX - minX + 120)
    const height = Math.max(1, maxY - minY + 120)
    const nextZoom = Math.max(0.5, Math.min(1.2, Math.min(scroll.clientWidth / width, scroll.clientHeight / height)))
    setZoom(Number(nextZoom.toFixed(2)))
    requestAnimationFrame(() => {
      scroll.scrollLeft = Math.max(0, (minX - 50) * nextZoom)
      scroll.scrollTop = Math.max(0, (minY - 50) * nextZoom)
    })
  }

  const groups = graph.groups ?? []
  const mapWidth = Math.max(1700, ...graph.nodes.map((item) => item.x + NODE_WIDTH + 180), ...groups.map((item) => item.x + item.width + 180))
  const mapHeight = Math.max(900, ...graph.nodes.map((item) => item.y + NODE_HEIGHT + 180), ...groups.map((item) => item.y + item.height + 180))
  const selectionHasGroup = selectedNodes.some((item) => Boolean(item.groupId))

  return <div className="playbook-workspace">
    <header className="playbook-workspace__topbar">
      <div className="playbook-workspace__identity">
        <button type="button" className="playbook-workspace__back" onClick={onClose} aria-label="Voltar para Playbooks"><ArrowLeft size={18}/></button>
        <div>
          <span>Playbook Studio</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Nome do playbook" />
        </div>
      </div>
      <nav className="playbook-workspace__views" aria-label="Visualização do Playbook Studio">
        <button type="button" className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')}><MapIcon size={15}/> Mapa</button>
        <button type="button" className={view === 'structure' ? 'is-active' : ''} onClick={() => setView('structure')}><ListTree size={15}/> Estrutura</button>
        <button type="button" className={view === 'script' ? 'is-active' : ''} onClick={() => setView('script')}><FileText size={15}/> Script</button>
        <button type="button" className={view === 'execution' ? 'is-active' : ''} onClick={() => setView('execution')}><PlayCircle size={15}/> Simular</button>
      </nav>
      <div className="playbook-workspace__actions">
        <div className={`playbook-workspace__health ${healthIssues.length ? 'has-issues' : 'is-ready'}`} title={healthIssues.join('\n')}>
          {healthIssues.length ? <><Eye size={15}/><span>{healthIssues.length} para revisar</span></> : <><CheckCircle2 size={15}/><span>Pronto</span></>}
        </div>
        <button type="button" className={settingsOpen ? 'is-active' : ''} onClick={() => setSettingsOpen((value) => !value)} aria-label="Configurações do playbook"><Settings2 size={17}/></button>
        <Button variant="secondary" size="sm" onClick={() => setGraph(autoLayoutConversationGraph(graph))}><WandSparkles size={15}/> Organizar</Button>
        <Button size="sm" loading={busy} disabled={!title.trim()} onClick={() => void save()}><Save size={15}/> {lastSavedAt ? 'Salvar novamente' : 'Salvar'}</Button>
      </div>
    </header>

    {settingsOpen ? <section className="playbook-workspace__settings">
      <div><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Prospecção" /></div>
      <div><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="barbearia, outbound, discovery" /></div>
      <p>Configurações ficam fora do canvas para o mapa continuar sendo o centro do trabalho.</p>
    </section> : null}

    {view === 'map' ? <main className={`playbook-workspace__body ${toolboxOpen ? 'has-toolbox' : ''} ${inspectorOpen ? 'has-inspector' : ''}`}>
      {toolboxOpen ? <aside className="playbook-workspace__toolbox">
        <div className="playbook-workspace__panel-heading"><div><span>Criar</span><strong>Blocos</strong></div><button type="button" onClick={() => setToolboxOpen(false)} aria-label="Fechar ferramentas"><PanelLeftClose size={16}/></button></div>
        <div className="playbook-workspace__node-types">
          {nodeTypes.map((type) => <button type="button" key={type} onClick={() => addNode(type)}><Plus size={13}/><span>{PLAYBOOK_NODE_TYPE_LABELS[type]}</span></button>)}
        </div>
        <div className="playbook-workspace__toolbox-divider" />
        <span className="playbook-workspace__toolbox-label">Canvas</span>
        <div className="playbook-workspace__canvas-tools">
          <button type="button" disabled={selectedNodeIds.length < 2} onClick={groupSelection}><Layers3 size={14}/><span>Criar fase da seleção</span></button>
          <button type="button" className={connectFromId ? 'is-active' : ''} disabled={selectedNodeIds.length !== 1} onClick={() => selectedNodeIds[0] && startConnection(selectedNodeIds[0])}><Link2 size={14}/><span>{connectFromId ? 'Cancelar conexão' : 'Conectar manualmente'}</span></button>
          <button type="button" onClick={() => setShortcutsOpen((value) => !value)}><Keyboard size={14}/><span>Atalhos</span></button>
        </div>
        <div className="playbook-workspace__toolbox-divider" />
        <span className="playbook-workspace__toolbox-label">Começar rápido</span>
        <div className="playbook-workspace__templates">
          {templates.map((template) => <button type="button" key={template.id} onClick={() => applyTemplate(template.id)}><strong>{template.label}</strong><span>{template.description}</span></button>)}
        </div>
      </aside> : null}

      <section className={`playbook-workspace__canvas-shell perf-${performance.tier}`}>
        <div className="playbook-workspace__canvas-toolbar">
          <div className="playbook-workspace__canvas-left">
            {!toolboxOpen ? <button type="button" onClick={() => setToolboxOpen(true)} title="Abrir blocos"><PanelLeftOpen size={16}/></button> : null}
            <span><strong>{graph.nodes.length}</strong> nós</span><span><strong>{graph.edges.length}</strong> caminhos</span><span><strong>{groups.length}</strong> fases</span><span title="Virtualização do canvas"><strong>{visibleNodes.length}</strong> visíveis</span>
          </div>
          <div className="playbook-workspace__canvas-right">
            <span className={`playbook-workspace__fps is-${performance.tier}`} title={`${performance.longFrames} frame(s) longo(s) no último segundo`}>{performance.fps} FPS</span>
            <button type="button" className={showGrid ? 'is-active' : ''} onClick={() => setShowGrid((value) => !value)} title="Mostrar grade">Grade</button>
            <button type="button" className={snapToGrid ? 'is-active' : ''} onClick={() => setSnapToGrid((value) => !value)} title="Alinhar à grade">Snap</button>
            <button type="button" onClick={fitContent} title="Ajustar conteúdo"><Maximize2 size={15}/></button>
            <button type="button" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))}><ZoomOut size={16}/></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.4, Number((value + 0.1).toFixed(2))))}><ZoomIn size={16}/></button>
            {!inspectorOpen ? <button type="button" onClick={() => setInspectorOpen(true)} title="Abrir inspector"><PanelRightOpen size={16}/></button> : null}
          </div>
        </div>

        {selectedNodeIds.length > 1 ? <div className="playbook-workspace__bulk-toolbar">
          <strong>{selectedNodeIds.length} selecionados</strong>
          <button type="button" onClick={groupSelection}><Layers3 size={13}/> Fase</button>
          {selectionHasGroup ? <button type="button" onClick={removeSelectionFromGroups}>Retirar da fase</button> : null}
          <button type="button" onClick={alignSelection}>Alinhar</button>
          <button type="button" disabled={selectedNodeIds.length < 3} onClick={distributeSelection}>Distribuir</button>
          <button type="button" onClick={duplicateSelection}><Copy size={13}/> Duplicar</button>
          <button type="button" className="is-danger" onClick={removeSelectedNodes}><Trash2 size={13}/> Excluir</button>
        </div> : null}

        {connectFromId ? <div className="playbook-workspace__connect-banner"><Link2 size={14}/><span>Conectando de <strong>{graph.nodes.find((item) => item.id === connectFromId)?.title}</strong>. Clique no nó de destino.</span><button type="button" onClick={() => setConnectFromId(null)}>Esc cancelar</button></div> : null}

        {shortcutsOpen ? <div className="playbook-workspace__shortcuts">
          <header><Keyboard size={15}/><strong>Atalhos do canvas</strong><button type="button" onClick={() => setShortcutsOpen(false)}>×</button></header>
          <div><kbd>Shift + arrastar</kbd><span>seleção por área</span></div>
          <div><kbd>Ctrl/⌘ + A</kbd><span>selecionar todos</span></div>
          <div><kbd>Ctrl/⌘ + D</kbd><span>duplicar seleção</span></div>
          <div><kbd>Ctrl/⌘ + G</kbd><span>criar fase</span></div>
          <div><kbd>Setas</kbd><span>mover seleção</span></div>
          <div><kbd>Delete</kbd><span>excluir seleção</span></div>
          <div><kbd>Ctrl/⌘ + S</kbd><span>salvar</span></div>
          <div><kbd>Grade / Snap</kbd><span>controle visual e alinhamento fino</span></div>
        </div> : null}

        <div
          ref={canvasScrollRef}
          className={`playbook-workspace__canvas-scroll ${connectFromId ? 'is-connecting' : ''}`}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return
            event.preventDefault()
            const direction = event.deltaY > 0 ? -0.08 : 0.08
            setZoom((value) => Math.max(0.5, Math.min(1.4, Number((value + direction).toFixed(2)))))
          }}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.shiftKey) {
              const point = canvasPoint(event.clientX, event.clientY)
              const next = { pointerId: event.pointerId, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y }
              marqueeRef.current = next
              setMarquee(next)
              setSelectedNodeIds([])
              return
            }
            if (connectFromId) setConnectFromId(null)
            const scroll = canvasScrollRef.current
            if (!scroll) return
            setSelectedNodeIds([])
            panRef.current = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startScrollLeft: scroll.scrollLeft, startScrollTop: scroll.scrollTop }
          }}
        >
          <div className="playbook-workspace__canvas" style={{ width: mapWidth * zoom, height: mapHeight * zoom }}>
            <div className={`playbook-workspace__canvas-transform ${showGrid ? 'has-grid' : 'no-grid'}`} style={{ width: mapWidth, height: mapHeight, transform: `scale(${zoom})` }}>
              {visibleGroups.map((group) => <section key={group.id} ref={(element) => { if (element) groupElementRefs.current.set(group.id, element); else groupElementRefs.current.delete(group.id) }} className="playbook-workspace__group" style={{ left: group.x, top: group.y, width: group.width, height: group.height }}>
                <header onPointerDown={(event) => {
                  event.stopPropagation()
                  const members = graph.nodes.filter((item) => item.groupId === group.id)
                  groupDragRef.current = {
                    groupId: group.id,
                    pointerId: event.pointerId,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    groupOrigin: { x: group.x, y: group.y },
                    nodeOrigins: Object.fromEntries(members.map((item) => [item.id, { x: item.x, y: item.y }])),
                    deltaX: 0, deltaY: 0,
                    moved: false,
                  }
                }}>
                  <Layers3 size={13}/>
                  <input value={group.title} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => updateGroup(group.id, { title: event.target.value })} aria-label="Nome da fase" />
                  <button type="button" title="Desagrupar fase" onPointerDown={(event) => event.stopPropagation()} onClick={() => ungroupGroup(group.id)}>×</button>
                </header>
              </section>)}

              <svg className="playbook-workspace__edges" width={mapWidth} height={mapHeight} aria-hidden="true">
                <defs><marker id="playbook-workspace-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"/></marker></defs>
                {visibleEdges.map((edge) => {
                  const source = nodeById.get(edge.sourceId)
                  const target = nodeById.get(edge.targetId)
                  if (!source || !target) return null
                  const x1 = source.x + NODE_WIDTH
                  const y1 = source.y + NODE_HEIGHT / 2
                  const x2 = target.x
                  const y2 = target.y + NODE_HEIGHT / 2
                  const control = Math.max(70, Math.abs(x2 - x1) * 0.42)
                  const d = `M ${x1} ${y1} C ${x1 + control} ${y1}, ${x2 - control} ${y2}, ${x2} ${y2}`
                  return <g key={edge.id}><path d={d} markerEnd="url(#playbook-workspace-arrow)"/><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8}>{edge.label || 'Próximo'}</text></g>
                })}
              </svg>

              {marquee ? <div className="playbook-workspace__marquee" style={{ left: Math.min(marquee.startX, marquee.currentX), top: Math.min(marquee.startY, marquee.currentY), width: Math.abs(marquee.currentX - marquee.startX), height: Math.abs(marquee.currentY - marquee.startY) }} /> : null}

              {visibleNodes.map((node) => {
                const outgoing = outgoingCount.get(node.id) ?? 0
                const selected = selectedNodeIds.includes(node.id)
                const isConnectSource = connectFromId === node.id
                return <article
                  key={node.id}
                  ref={(element) => { if (element) nodeElementRefs.current.set(node.id, element); else nodeElementRefs.current.delete(node.id) }}
                  data-node-id={node.id}
                  className={`${nodeClass(node.type)} ${selected ? 'is-selected' : ''} ${selectedNodeIds.length > 1 && selected ? 'is-multi-selected' : ''} ${isConnectSource ? 'is-connect-source' : ''} ${connectFromId && !isConnectSource ? 'is-connect-target' : ''} ${node.id === graph.rootNodeId ? 'is-root' : ''}`}
                  data-color={node.color ?? 'blue'}
                  style={{ left: node.x, top: node.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (suppressClickRef.current) { suppressClickRef.current = false; return }
                    if (connectFromId) { completeConnection(node.id); return }
                    if (event.metaKey || event.ctrlKey || event.shiftKey) toggleNodeSelection(node.id)
                    else selectOnly(node.id)
                    setInspectorOpen(true)
                  }}
                >
                  <header onPointerDown={(event) => {
                    event.stopPropagation()
                    const ids = selectedNodeIds.includes(node.id) ? selectedNodeIds : [node.id]
                    if (!selectedNodeIds.includes(node.id)) selectOnly(node.id)
                    const selectedForDrag = graph.nodes.filter((item) => ids.includes(item.id))
                    dragRef.current = {
                      pointerId: event.pointerId,
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      origins: Object.fromEntries(selectedForDrag.map((item) => [item.id, { x: item.x, y: item.y }])),
                      deltaX: 0, deltaY: 0,
                      moved: false,
                    }
                  }}>
                    <span>{PLAYBOOK_NODE_TYPE_LABELS[node.type]}</span>
                    <span className="playbook-workspace__path-count"><GitBranch size={12}/>{outgoing}</span>
                  </header>
                  <strong>{node.title || PLAYBOOK_NODE_TYPE_LABELS[node.type]}</strong>
                  <p>{node.content || 'Clique para escrever o conteúdo deste bloco.'}</p>
                  <button type="button" className={`playbook-workspace__connection-handle ${isConnectSource ? 'is-active' : ''}`} aria-label="Conectar este nó" title="Conectar manualmente" onClick={(event) => { event.stopPropagation(); startConnection(node.id) }}><Link2 size={12}/></button>
                  <footer>
                    <button type="button" onClick={(event) => { event.stopPropagation(); selectOnly(node.id); setQuickPath({ parentId: node.id, label: '', type: 'question' }) }}><Plus size={13}/> Caminho</button>
                  </footer>
                </article>
              })}
            </div>
          </div>

          {quickPath ? <div className="playbook-workspace__quick-path">
            <div><span>Novo caminho a partir de</span><strong>{graph.nodes.find((node) => node.id === quickPath.parentId)?.title ?? 'Nó selecionado'}</strong></div>
            <input autoFocus value={quickPath.label} onChange={(event) => setQuickPath((current) => current ? { ...current, label: event.target.value } : current)} placeholder="Ex.: Pode falar, Está sem tempo, Preço…" onKeyDown={(event) => { if (event.key === 'Enter') addNode(quickPath.type, quickPath.parentId, quickPath.label || 'Próximo'); if (event.key === 'Escape') setQuickPath(null) }}/>
            <div className="playbook-workspace__quick-types">
              {(['question','decision','objection','action','outcome'] as PlaybookConversationNodeType[]).map((type) => <button type="button" key={type} className={quickPath.type === type ? 'is-active' : ''} onClick={() => setQuickPath((current) => current ? { ...current, type } : current)}>{PLAYBOOK_NODE_TYPE_LABELS[type]}</button>)}
            </div>
            <div className="playbook-workspace__quick-actions"><Button variant="secondary" size="sm" onClick={() => setQuickPath(null)}>Cancelar</Button><Button size="sm" onClick={() => addNode(quickPath.type, quickPath.parentId, quickPath.label || 'Próximo')}><Plus size={14}/> Criar caminho</Button></div>
          </div> : null}
        </div>
      </section>

      {inspectorOpen ? <aside className="playbook-workspace__inspector">
        <div className="playbook-workspace__panel-heading"><div><span>Inspector</span><strong>{selectedNodeIds.length > 1 ? `${selectedNodeIds.length} blocos selecionados` : selectedNode?.title || 'Selecione um bloco'}</strong></div><button type="button" onClick={() => setInspectorOpen(false)} aria-label="Fechar inspector"><PanelRightClose size={16}/></button></div>
        {selectedNodeIds.length > 1 ? <section className="playbook-workspace__multi-inspector">
          <p>A seleção múltipla permite mover, agrupar e organizar vários blocos como uma unidade.</p>
          <div className="playbook-workspace__color-picker" aria-label="Cor da seleção">{nodeColors.map((color) => <button type="button" key={color} className={`color-${color}`} title={`Cor ${color}`} onClick={() => colorSelection(color)} />)}</div>
          <Button size="sm" onClick={groupSelection}><Layers3 size={14}/> Criar fase</Button>
          <Button variant="secondary" size="sm" onClick={alignSelection}>Alinhar no topo</Button>
          <Button variant="secondary" size="sm" disabled={selectedNodeIds.length < 3} onClick={distributeSelection}>Distribuir</Button>
          <Button variant="secondary" size="sm" onClick={duplicateSelection}><Copy size={14}/> Duplicar seleção</Button>
          {selectionHasGroup ? <Button variant="secondary" size="sm" onClick={removeSelectionFromGroups}>Retirar da fase</Button> : null}
          <Button variant="danger" size="sm" onClick={removeSelectedNodes}><Trash2 size={14}/> Excluir seleção</Button>
        </section> : selectedNode ? <>
          <div className="playbook-workspace__type-picker">
            {nodeTypes.map((type) => <button type="button" key={type} className={selectedNode.type === type ? 'is-active' : ''} onClick={() => updateNode({ type })}>{PLAYBOOK_NODE_TYPE_LABELS[type]}</button>)}
          </div>
          <div className="playbook-workspace__color-picker" aria-label="Cor do card">{nodeColors.map((color) => <button type="button" key={color} className={`color-${color} ${selectedNode.color === color || (!selectedNode.color && color === 'blue') ? 'is-active' : ''}`} title={`Cor ${color}`} onClick={() => updateNode({ color })} />)}</div>
          <label><span>Título</span><input value={selectedNode.title} onChange={(event) => updateNode({ title: event.target.value })}/></label>
          <label><span>Conteúdo</span><textarea rows={5} value={selectedNode.content} onChange={(event) => updateNode({ content: event.target.value })} placeholder="O que o vendedor deve perguntar, falar ou observar?"/></label>
          {inboundEdge ? <label><span>Caminho que chega aqui</span><input value={inboundEdge.label ?? ''} onChange={(event) => updateEdge(inboundEdge.id, { label: event.target.value })}/></label> : null}

          <section className="playbook-workspace__paths-panel">
            <div><span>Caminhos de saída</span><button type="button" onClick={() => setQuickPath({ parentId: selectedNode.id, label: '', type: 'question' })}><Plus size={13}/> Novo</button></div>
            {outgoingSelected.length ? outgoingSelected.map((edge) => {
              const target = graph.nodes.find((node) => node.id === edge.targetId)
              return <article key={edge.id}>
                <input value={edge.label ?? ''} onChange={(event) => updateEdge(edge.id, { label: event.target.value })} aria-label="Nome do caminho"/>
                <button type="button" onClick={() => target && selectOnly(target.id)}><span>{target ? PLAYBOOK_NODE_TYPE_LABELS[target.type] : 'Destino'}</span><strong>{target?.title ?? 'Nó ausente'}</strong><ChevronRight size={14}/></button>
              </article>
            }) : <p>Nenhum caminho ainda. Crie a próxima resposta sem sair do contexto.</p>}
          </section>

          <details className="playbook-workspace__advanced">
            <summary>Detalhes avançados</summary>
            <label><span>Objetivo deste nó</span><textarea rows={3} value={selectedNode.objective ?? ''} onChange={(event) => updateNode({ objective: event.target.value })} placeholder="O que precisa acontecer para seguir?"/></label>
          </details>
          <div className="playbook-workspace__inspector-actions"><Button variant="secondary" size="sm" onClick={duplicateNode}><Copy size={14}/> Duplicar</Button><Button variant="secondary" size="sm" className={connectFromId === selectedNode.id ? 'is-active' : ''} onClick={() => startConnection(selectedNode.id)}><Link2 size={14}/> Conectar</Button>{selectedNode.id !== graph.rootNodeId ? <Button variant="danger" size="sm" onClick={removeNode}><Trash2 size={14}/> Excluir</Button> : null}</div>
        </> : <div className="playbook-workspace__empty-inspector"><strong>Canvas livre</strong><p>Clique em um bloco para editar. Use Ctrl/⌘ ou Shift para selecionar vários. Shift + arrastar no fundo cria uma seleção por área.</p></div>}
      </aside> : null}
    </main> : null}

    {view === 'structure' ? <main className="playbook-workspace__alternate playbook-workspace__structure">
      <header><div><span>Mesmo grafo · visão estrutural</span><h2>Estrutura da conversa</h2><p>Reordene mentalmente o fluxo sem perder o vínculo com o mapa.</p></div><Button variant="secondary" size="sm" onClick={() => setGraph(autoLayoutConversationGraph(graph))}><WandSparkles size={15}/> Reorganizar mapa</Button></header>
      <div className="playbook-workspace__structure-list">{orderedNodes.map((node, index) => { const incoming = graph.edges.find((edge) => edge.targetId === node.id); return <button type="button" key={node.id} onClick={() => { selectOnly(node.id); setView('map'); setInspectorOpen(true) }}><span>{index + 1}</span><div><small>{PLAYBOOK_NODE_TYPE_LABELS[node.type]}{incoming?.label ? ` · ${incoming.label}` : ''}</small><strong>{node.title}</strong><p>{node.content || node.objective || 'Sem conteúdo.'}</p></div></button> })}</div>
    </main> : null}

    {view === 'script' ? <main className="playbook-workspace__alternate playbook-workspace__script">
      <header><div><span>Mesmo grafo · visão textual</span><h2>Script gerado automaticamente</h2><p>O texto é uma representação do mapa, não uma fonte separada de verdade.</p></div></header>
      <pre>{generatedScript || 'Adicione nós ao mapa para gerar o script.'}</pre>
    </main> : null}

    {view === 'execution' ? <main className="playbook-workspace__alternate playbook-workspace__simulation">
      <header><div><span>Mesmo grafo · teste de execução</span><h2>Simular conversa</h2><p>Teste os caminhos exatamente como eles estão desenhados no mapa.</p></div><Button variant="secondary" size="sm" onClick={resetExecution}><RotateCcw size={15}/> Reiniciar</Button></header>
      {executionNode ? <div className="playbook-workspace__simulation-stage">
        <article><span>{PLAYBOOK_NODE_TYPE_LABELS[executionNode.type]}</span><h2>{executionNode.title}</h2><p>{executionNode.content || 'Sem conteúdo configurado.'}</p>{executionNode.objective ? <aside><strong>Objetivo</strong><span>{executionNode.objective}</span></aside> : null}</article>
        <div className="playbook-workspace__simulation-paths">{outgoingExecution.length ? outgoingExecution.map((edge) => { const target = graph.nodes.find((node) => node.id === edge.targetId); return <button type="button" key={edge.id} onClick={() => goExecution(edge)}><span>{edge.label || 'Próximo'}</span><strong>{target?.title ?? 'Continuar'}</strong></button> }) : <div className="playbook-workspace__simulation-end"><Sparkles size={22}/><strong>Fim deste caminho</strong><span>Esse nó não possui uma próxima conexão.</span></div>}</div>
        <footer><Button variant="secondary" disabled={!executionHistory.length} onClick={backExecution}><ChevronLeft size={14}/> Voltar um passo</Button><span>{executionHistory.length + 1} nó(s) percorrido(s)</span></footer>
      </div> : null}
    </main> : null}
  </div>
}
