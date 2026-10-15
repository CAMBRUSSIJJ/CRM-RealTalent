import type { ReactNode } from 'react'
import { RecordPageWidgetFrame } from './record-page-widget-frame'

export interface FieldsWidgetItem {
  id: string
  label: string
  value: ReactNode
}

interface Props {
  title: string
  fields: readonly FieldsWidgetItem[]
  onEdit?: () => void
  editLabel?: string
  widgetId?: string
}

export function FieldsWidget({ title, fields, onEdit, editLabel = 'Editar', widgetId = 'fields' }: Props) {
  return <RecordPageWidgetFrame
    title={title}
    widgetId={widgetId}
    actions={onEdit ? <button type="button" onClick={onEdit}>{editLabel}</button> : null}
  >
    <dl className="contact-record-v1016__facts">
      {fields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
    </dl>
  </RecordPageWidgetFrame>
}
