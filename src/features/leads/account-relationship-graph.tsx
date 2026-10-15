import { Maximize2, Plus, ZoomIn, ZoomOut } from 'lucide-react'
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ContactRecord, ContactRelationship, DecisionRole } from '../../domain/types'
import { initials } from '../../domain/formatters'
import { decisionRoleLabels, relationshipTypeLabels, stanceLabels } from '../../services/account-intelligence'

interface Point { x: number; y: number }
interface Props {
  contacts: ContactRecord[]
  relationships: ContactRelationship[]
  scores: Record<string, number>
  missingRoleGroups: string[]
  readOnly?: boolean
  onEdit(contact: ContactRecord): void
  onAddRole(role: DecisionRole): void
}

const WIDTH = 980
const HEIGHT = 560
const NODE_W = 180
const NODE_H = 104
const roleRank: Record<DecisionRole, number> = {
  economic_buyer: 0, decision_maker: 0, champion: 1, finance: 1, procurement: 1,
  influencer: 2, technical_evaluator: 2, gatekeeper: 2, blocker: 2, operational: 3, user: 3, unknown: 3,
}
const missingRole: Record<string, DecisionRole> = { 'Decisão': 'economic_buyer', 'Champion': 'champion', 'Financeiro/Compras': 'finance', 'Influência/Operação': 'influencer' }
const levelLabels = ['Decisão final', 'Patrocínio e aprovação', 'Influência e validação', 'Operação e uso']

const initialLayout = (contacts: ContactRecord[]) => {
  const levels = new Map<number, ContactRecord[]>()
  contacts.forEach((contact) => {
    const rank = roleRank[contact.decisionRole] ?? 3
    levels.set(rank, [...(levels.get(rank) ?? []), contact])
  })
  const positions: Record<string, Point> = {}
  for (const [rank, items] of levels) {
    const y = 48 + rank * 128
    const gap = WIDTH / (items.length + 1)
    items.forEach((contact, index) => { positions[contact.id] = { x: Math.max(24, gap * (index + 1) - NODE_W / 2), y } })
  }
  return positions
}

export function AccountRelationshipGraph({ contacts, relationships, scores, missingRoleGroups, readOnly = false, onEdit, onAddRole }: Props) {
  const initial = useMemo(() => initialLayout(contacts), [contacts])
  const [positions, setPositions] = useState<Record<string, Point>>(initial)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const panDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const drag = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const suppressClick = useRef<string | null>(null)
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts])
  const effective = useMemo(() => ({ ...initial, ...positions }), [initial, positions])

  const fitView = () => {
    const viewport = viewportRef.current
    if (!viewport) { setZoom(1); setPan({ x: 0, y: 0 }); return }
    const nextZoom = Math.max(.55, Math.min(1.15, (viewport.clientWidth - 24) / WIDTH, (viewport.clientHeight - 24) / HEIGHT))
    setZoom(Number(nextZoom.toFixed(2)))
    setPan({ x: Math.max(0, (viewport.clientWidth - WIDTH * nextZoom) / 2), y: Math.max(0, (viewport.clientHeight - HEIGHT * nextZoom) / 2) })
  }
  const resetView = () => { setPositions(initial); window.requestAnimationFrame(fitView) }
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || current.id !== event.currentTarget.dataset.nodeId) return
    const dx = (event.clientX - current.startX) / zoom
    const dy = (event.clientY - current.startY) / zoom
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) current.moved = true
    setPositions((value) => ({ ...value, [current.id]: { x: Math.max(8, Math.min(WIDTH - NODE_W - 8, current.originX + dx)), y: Math.max(8, Math.min(HEIGHT - NODE_H - 8, current.originY + dy)) } }))
  }

  return <div className="relationship-graph-shell">
    <div className="relationship-graph-toolbar">
      <span><strong>Organograma de decisão</strong><small>Leia de cima para baixo: decisão, apoio, influência e operação. Arraste pessoas para reorganizar.</small></span>
      <div><button type="button" onClick={() => setZoom((value) => Math.max(.7, Number((value - .1).toFixed(1))))} aria-label="Diminuir zoom"><ZoomOut size={16}/></button><b>{Math.round(zoom * 100)}%</b><button type="button" onClick={() => setZoom((value) => Math.min(1.35, Number((value + .1).toFixed(1))))} aria-label="Aumentar zoom"><ZoomIn size={16}/></button><button type="button" onClick={resetView} aria-label="Ajustar visualização"><Maximize2 size={16}/></button></div>
    </div>
    <div ref={viewportRef} className="relationship-graph-viewport"
      onPointerDown={(event) => { if (event.target !== event.currentTarget) return; panDrag.current = { startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={(event) => { const current = panDrag.current; if (!current) return; setPan({ x: current.originX + event.clientX - current.startX, y: current.originY + event.clientY - current.startY }) }}
      onPointerUp={(event) => { panDrag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onDoubleClick={(event) => { if (event.target === event.currentTarget) fitView() }}>
      <div className="relationship-graph-canvas" style={{ width: WIDTH, height: HEIGHT, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        <div className="relationship-graph-levels" aria-hidden="true">{levelLabels.map((label, index) => <div key={label} style={{ top: 26 + index * 128 }}><span>{label}</span></div>)}</div>
        <svg className="relationship-graph-edges" width={WIDTH} height={HEIGHT} aria-hidden="true">
          {relationships.map((relation) => {
            const from = effective[relation.fromContactId]
            const to = effective[relation.toContactId]
            if (!from || !to) return null
            const x1 = from.x + NODE_W / 2, y1 = from.y + NODE_H / 2, x2 = to.x + NODE_W / 2, y2 = to.y + NODE_H / 2
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
            return <g key={relation.id} className="relationship-graph-edge"><line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={Math.max(1.5, relation.strength / 28)} /><circle cx={x2} cy={y2} r="4"/><rect x={mx - 52} y={my - 11} width="104" height="22" rx="11"/><text x={mx} y={my + 4} textAnchor="middle">{relationshipTypeLabels[relation.relationshipType]}</text></g>
          })}
        </svg>
        {contacts.map((contact) => {
          const point = effective[contact.id] ?? { x: 20, y: 20 }
          return <button
            key={contact.id}
            type="button"
            data-node-id={contact.id}
            className={`relationship-graph-node relationship-graph-node--${contact.stance ?? 'unknown'} ${contact.isPrimary ? 'is-primary' : ''}`}
            style={{ left: point.x, top: point.y }}
            onClick={() => { if (suppressClick.current === contact.id) { suppressClick.current = null; return }; onEdit(contact) }}
            onPointerDown={(event) => {
              if (readOnly) return
              const p = effective[contact.id] ?? { x: 0, y: 0 }
              drag.current = { id: contact.id, startX: event.clientX, startY: event.clientY, originX: p.x, originY: p.y, moved: false }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={pointerMove}
            onPointerUp={(event) => { if (drag.current?.moved) suppressClick.current = contact.id; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
          >
            <span className="relationship-graph-node__avatar">{initials(contact.name)}</span>
            <span className="relationship-graph-node__content"><strong>{contact.name}</strong><small>{contact.jobTitle || decisionRoleLabels[contact.decisionRole]}</small><em>{decisionRoleLabels[contact.decisionRole]} · {stanceLabels[contact.stance ?? 'unknown']}</em><span className={`relationship-graph-contact-state ${contact.lastContactAt ? 'is-contacted' : 'is-uncontacted'}`}>{contact.lastContactAt ? 'Já contatado' : 'Ainda não contatado'}</span></span>
            <b>{scores[contact.id] ?? 0}%</b>
          </button>
        })}
        {!readOnly ? missingRoleGroups.map((group, index) => {
          const role = missingRole[group]
          if (!role) return null
          const y = 48 + Math.min(3, roleRank[role]) * 128
          return <button key={group} type="button" className="relationship-graph-gap" style={{ left: WIDTH - 208, top: Math.min(HEIGHT - 86, y + index * 8) }} onClick={() => onAddRole(role)}><Plus size={18}/><span><strong>{group}</strong><small>Não identificado · adicionar pessoa</small></span></button>
        }) : null}
      </div>
    </div>
    {!relationships.length && contacts.length > 1 ? <div className="relationship-graph-hint">Cadastre relações entre as pessoas para visualizar linhas de influência, reporte e parceria.</div> : null}
  </div>
}
