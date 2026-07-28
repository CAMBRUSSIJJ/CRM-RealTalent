import { BookOpenText, Clipboard, MessageSquareWarning, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import type { Playbook } from '../../domain/types'
import { PlaybookModal } from './playbook-modal'

export function PlaybooksPage() {
  const { snapshot, deletePlaybook, notify, canWrite } = useApp()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | Playbook['kind']>('all')
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const playbooks = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (snapshot?.playbooks ?? []).filter((item) => (kind === 'all' || item.kind === kind) && (!normalized || `${item.title} ${item.category} ${item.content} ${item.tags.join(' ')}`.toLowerCase().includes(normalized)))
  }, [kind, query, snapshot?.playbooks])

  const copy = async (content: string) => {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content)
    else {
      const textarea = document.createElement('textarea'); textarea.value = content; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove()
    }
    notify('success', 'Texto copiado.')
  }

  return <div className="page-stack playbooks-page">
    <section className="toolbar-card toolbar-card--wrap">
      <div className="toolbar-card__filters"><label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar scripts, objeções ou tags" /></label><select aria-label="Tipo de playbook" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">Todos</option><option value="script">Scripts</option><option value="objection">Objeções</option></select></div>
      <div className="toolbar-card__actions">{canWrite ? <Button onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={17} /> Novo playbook</Button> : null}</div>
    </section>

    <section className="playbook-summary-grid"><article className="panel playbook-summary"><BookOpenText /><div><strong>{snapshot?.playbooks.filter((item) => item.kind === 'script').length ?? 0}</strong><span>scripts</span></div></article><article className="panel playbook-summary"><MessageSquareWarning /><div><strong>{snapshot?.playbooks.filter((item) => item.kind === 'objection').length ?? 0}</strong><span>objeções</span></div></article><article className="panel playbook-summary"><Clipboard /><div><strong>{snapshot?.playbooks.filter((item) => item.active).length ?? 0}</strong><span>ativos</span></div></article></section>

    {playbooks.length ? <section className="playbook-grid">{playbooks.map((playbook) => <article className={`panel playbook-card ${!playbook.active ? 'is-inactive' : ''}`} key={playbook.id}><header><div className={`playbook-card__icon playbook-card__icon--${playbook.kind}`}>{playbook.kind === 'script' ? <BookOpenText /> : <MessageSquareWarning />}</div><div><span className="eyebrow">{playbook.category || (playbook.kind === 'script' ? 'Script' : 'Objeção')}</span><h3>{playbook.title}</h3></div><StatusPill tone={playbook.active ? 'success' : 'warning'}>{playbook.active ? 'Ativo' : 'Inativo'}</StatusPill></header><p className={expandedId === playbook.id ? 'is-expanded' : ''}>{playbook.content}</p><button className="playbook-card__expand" type="button" onClick={() => setExpandedId((current) => current === playbook.id ? null : playbook.id)}>{expandedId === playbook.id ? 'Recolher conteúdo' : 'Ver conteúdo completo'}</button><div className="playbook-card__tags">{playbook.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><footer><Button variant="secondary" size="sm" onClick={() => void copy(playbook.content)}><Clipboard size={15} /> Copiar</Button>{canWrite ? <><button className="icon-button" type="button" aria-label={`Editar ${playbook.title}`} onClick={() => { setEditing(playbook); setModalOpen(true) }}><Pencil size={16} /></button><button className="icon-button" type="button" aria-label={`Excluir ${playbook.title}`} onClick={() => { if (confirm(`Excluir “${playbook.title}”?`)) void deletePlaybook(playbook.id) }}><Trash2 size={16} /></button></> : null}</footer></article>)}</section> : <EmptyState icon={BookOpenText} title="Nenhum playbook encontrado" description="Crie scripts e respostas para padronizar as conversas da equipe." action={canWrite ? <Button onClick={() => setModalOpen(true)}><Plus size={17} /> Novo playbook</Button> : undefined} />}
    <PlaybookModal open={canWrite && modalOpen} playbook={editing} onClose={() => { setModalOpen(false); setEditing(null) }} />
  </div>
}
