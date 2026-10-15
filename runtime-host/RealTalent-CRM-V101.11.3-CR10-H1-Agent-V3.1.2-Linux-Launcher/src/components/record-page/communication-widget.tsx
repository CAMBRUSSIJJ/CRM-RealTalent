import type { ReactNode } from 'react'

export interface CommunicationAction {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  onClick(): void
}

interface Props {
  actions: readonly CommunicationAction[]
  className?: string
  widgetId?: string
}

export function CommunicationWidget({ actions, className = 'contact-record-v1016__channels', widgetId = 'communication' }: Props) {
  return <div className={className} data-record-page-widget={widgetId}>
    {actions.map((action) => <button type="button" key={action.id} disabled={action.disabled} onClick={action.onClick}>
      {action.icon}<span>{action.label}</span>
    </button>)}
  </div>
}
