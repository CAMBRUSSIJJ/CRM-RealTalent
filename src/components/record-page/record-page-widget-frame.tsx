import type { ReactNode } from 'react'

interface Props {
  title?: ReactNode
  header?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  widgetId?: string
}

export function RecordPageWidgetFrame({ title, header, actions, children, className = '', widgetId }: Props) {
  return <section className={`contact-record-card ${className}`.trim()} data-record-page-widget={widgetId}>
    {(title || header || actions) ? <header>{header ?? (title ? <h3>{title}</h3> : null)}{actions}</header> : null}
    {children}
  </section>
}
