import { useState, type ReactNode } from 'react'
import { ChevronDown, History } from 'lucide-react'
import { RecordPageWidgetFrame } from './record-page-widget-frame'

export interface TimelineWidgetEntry {
  id: string
  kind: string
  title: string
  description: string
  dateLabel: string
  icon?: ReactNode
  kindKey?: string
}

interface Props {
  title?: string
  entries: readonly TimelineWidgetEntry[]
  header?: ReactNode
  actions?: ReactNode
  tools?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  framed?: boolean
  className?: string
  widgetId?: string
  compact?: boolean
}

function TimelineBody({ entries, emptyTitle = 'Nenhuma atividade encontrada', emptyDescription = 'Ajuste a busca ou os filtros para encontrar outro registro.', compact = false }: Pick<Props, 'entries' | 'emptyTitle' | 'emptyDescription' | 'compact'>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  return <div className={`contact-record-v1016__timeline contact-record-v1016__timeline--full ${compact ? 'contact-record-v1016__timeline--compact' : ''}`.trim()}>
    {entries.map((entry) => {
      const canExpand = compact && entry.description.length > 150
      const isExpanded = expanded.has(entry.id)
      return <article key={entry.id} data-kind={entry.kindKey ?? entry.kind.toLocaleLowerCase('pt-BR')}>
        <span className="contact-record-v1016__timeline-icon">{entry.icon}</span>
        <div>
          <div className="contact-record-v10161__timeline-head">
            <span className="contact-record-v10161__timeline-kind">{entry.icon}{entry.kind}</span>
            <small>{entry.dateLabel}</small>
          </div>
          <strong>{entry.title}</strong>
          <p className={!isExpanded && canExpand ? 'is-clamped' : ''}>{entry.description}</p>
          {canExpand ? <button type="button" className="contact-record-v10161__timeline-details" onClick={() => toggle(entry.id)}>{isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'} <ChevronDown size={13} className={isExpanded ? 'is-open' : ''}/></button> : null}
        </div>
      </article>
    })}
    {!entries.length ? <div className="contact-record-v1016__empty"><History size={24}/><strong>{emptyTitle}</strong><span>{emptyDescription}</span></div> : null}
  </div>
}

export function TimelineWidget({ title, entries, header, actions, tools, framed = true, className = '', widgetId = 'timeline', compact = false, ...empty }: Props) {
  if (!framed) return <TimelineBody entries={entries} compact={compact} {...empty} />
  return <RecordPageWidgetFrame title={title} header={header} actions={actions} className={className} widgetId={widgetId}>
    {tools}
    <TimelineBody entries={entries} compact={compact} {...empty} />
  </RecordPageWidgetFrame>
}
