import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

export interface RecordPageTab {
  id: string
  label: string
}

interface Props {
  backLabel: string
  onBack(): void
  headerActions?: ReactNode
  left: ReactNode
  right: ReactNode
  tabs: readonly RecordPageTab[]
  activeTab: string
  onTabChange(id: string): void
  children: ReactNode
  className?: string
  definitionId?: string
  recordObjectKey?: string
  recordId?: string
}

export function RecordPageShell({
  backLabel, onBack, headerActions, left, right, tabs, activeTab, onTabChange, children, className = '', definitionId, recordObjectKey, recordId,
}: Props) {
  return <div
    className={`contact-record-v1016 contact-record-v10161 ${className}`.trim()}
    data-record-page-shell="101.9.2"
    data-record-page-definition={definitionId}
    data-record-object={recordObjectKey}
    data-record-id={recordId}
  >
    <div className="contact-record-v1016__topbar">
      <button type="button" className="contact-record-v1016__back" onClick={onBack}><ArrowLeft size={17}/>{backLabel}</button>
      <div className="contact-record-v1016__top-actions">{headerActions}</div>
    </div>

    <div className="contact-record-v1016__layout">
      <aside className="contact-record-v1016__left">{left}</aside>
      <main className="contact-record-v1016__main">
        <nav className="contact-record-v1016__tabs" aria-label="Áreas do registro">
          {tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''} onClick={() => onTabChange(tab.id)}>{tab.label}</button>)}
        </nav>
        {children}
      </main>
      <aside className="contact-record-v1016__right">{right}</aside>
    </div>
  </div>
}
