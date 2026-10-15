import type { ReactNode } from 'react'
import { RecordPageWidgetFrame } from './record-page-widget-frame'

export interface QuickActionItem {
  id: string
  title: string
  description: string
  icon?: ReactNode
  disabled?: boolean
  onClick(): void
}

interface Props {
  title: string
  actions: readonly QuickActionItem[]
  widgetId?: string
}

export function QuickActionsWidget({ title, actions, widgetId = 'quick-actions' }: Props) {
  return <RecordPageWidgetFrame title={title} widgetId={widgetId}>
    <div className="contact-record-v1016__next-grid">
      {actions.map((action) => <button type="button" key={action.id} disabled={action.disabled} onClick={action.onClick}>
        {action.icon}<span><strong>{action.title}</strong><small>{action.description}</small></span>
      </button>)}
    </div>
  </RecordPageWidgetFrame>
}
