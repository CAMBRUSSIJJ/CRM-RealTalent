import { Fragment, type ReactNode } from 'react'
import { RecordPageWidgetFrame } from './record-page-widget-frame'

export interface RelatedRecordItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  leading?: ReactNode
  className?: string
}

interface Props {
  title: ReactNode
  items: readonly RelatedRecordItem[]
  actions?: ReactNode
  empty?: ReactNode
  renderItem?: (item: RelatedRecordItem) => ReactNode
  className?: string
  listClassName?: string
  widgetId?: string
}

export function RelatedRecordsWidget({
  title, items, actions, empty, renderItem, className = '', listClassName = '', widgetId = 'related-records',
}: Props) {
  const content = <>
    {items.map((item) => <Fragment key={item.id}>{renderItem ? renderItem(item) : <article className={item.className}>
      {item.leading}<div><strong>{item.title}</strong>{item.subtitle ? <small>{item.subtitle}</small> : null}</div>{item.meta}
    </article>}</Fragment>)}
    {!items.length ? empty : null}
  </>

  return <RecordPageWidgetFrame title={title} actions={actions} className={className} widgetId={widgetId}>
    {listClassName ? <div className={listClassName}>{content}</div> : content}
  </RecordPageWidgetFrame>
}
