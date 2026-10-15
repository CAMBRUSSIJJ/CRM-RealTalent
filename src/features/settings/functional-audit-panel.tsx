import { AlertTriangle, CheckCircle2, Download, Eye, Gauge, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { hasSupabaseConfig } from '../../lib/env'
import {
  buildFunctionalCapabilityAudit,
  functionalCapabilityStatusLabel,
  summarizeFunctionalCapabilityAudit,
  type FunctionalCapabilityStatus,
} from '../../services/functional-capability-audit'
import { usePreferences } from './preferences-context'

const statusTone: Record<FunctionalCapabilityStatus, 'success' | 'warning' | 'info' | 'danger'> = {
  functional: 'success', partial: 'warning', visual_only: 'info', not_implemented: 'danger',
}
const statusIcon = { functional: CheckCircle2, partial: AlertTriangle, visual_only: Eye, not_implemented: XCircle }

const downloadAudit = (value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `realtalent-auditoria-funcional-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function FunctionalAuditPanel() {
  const { repositoryMode, snapshot } = useAppWorkspace()
  const { preferences } = usePreferences()
  const [filter, setFilter] = useState<'all' | FunctionalCapabilityStatus>('all')
  const items = useMemo(() => buildFunctionalCapabilityAudit({
    repositoryMode,
    hasSupabaseConfig,
    extensionEnabled: preferences.integrations.extensionEnabled,
    assistedWhatsapp: preferences.integrations.assistedWhatsapp,
    assistedEmail: preferences.integrations.assistedEmail,
    snapshot,
  }), [preferences.integrations.assistedEmail, preferences.integrations.assistedWhatsapp, preferences.integrations.extensionEnabled, repositoryMode, snapshot])
  const summary = useMemo(() => summarizeFunctionalCapabilityAudit(items), [items])
  const filtered = filter === 'all' ? items : items.filter((item) => item.status === filter)

  return <>
    <article className="panel functional-audit-overview">
      <div className="panel__heading"><div><span className="eyebrow">V100.74 · Auditoria funcional</span><h3>O que funciona de verdade hoje</h3></div><Gauge size={22} /></div>
      <p className="settings-copy">A classificação abaixo separa implementação funcional, recurso parcial, interface apenas visual e item ainda não implementado. Integrações externas só são consideradas completas quando existe caminho real de conexão — modo demonstração não conta como integração ativa.</p>
      <div className="functional-audit-score"><strong>{summary.weighted}%</strong><span>maturidade funcional da base auditada</span></div>
      <div className="functional-audit-metrics">
        <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}><small>Total</small><strong>{summary.total}</strong></button>
        <button type="button" className={filter === 'functional' ? 'is-active' : ''} onClick={() => setFilter('functional')}><small>Funcional</small><strong>{summary.counts.functional}</strong></button>
        <button type="button" className={filter === 'partial' ? 'is-active' : ''} onClick={() => setFilter('partial')}><small>Parcial</small><strong>{summary.counts.partial}</strong></button>
        <button type="button" className={filter === 'visual_only' ? 'is-active' : ''} onClick={() => setFilter('visual_only')}><small>Visual apenas</small><strong>{summary.counts.visual_only}</strong></button>
        <button type="button" className={filter === 'not_implemented' ? 'is-active' : ''} onClick={() => setFilter('not_implemented')}><small>Não implementado</small><strong>{summary.counts.not_implemented}</strong></button>
      </div>
      <div className="settings-actions"><Button variant="secondary" onClick={() => downloadAudit({ generatedAt: new Date().toISOString(), repositoryMode, hasSupabaseConfig, summary, items })}><Download size={16} /> Exportar auditoria JSON</Button></div>
    </article>

    <section className="functional-audit-list" aria-label="Matriz de funcionalidades do CRM">
      {filtered.map((item) => {
        const Icon = statusIcon[item.status]
        return <article className={`panel functional-audit-item functional-audit-item--${item.status}`} key={item.id}>
          <header><span className="functional-audit-item__icon"><Icon size={18} /></span><div><small>{item.area}</small><h3>{item.name}</h3></div><StatusPill tone={statusTone[item.status]}>{functionalCapabilityStatusLabel[item.status]}</StatusPill></header>
          <p>{item.summary}</p>
          <dl><div><dt>Limitação atual</dt><dd>{item.limitation}</dd></div><div><dt>Próximo passo</dt><dd>{item.nextStep}</dd></div></dl>
          <details><summary>Base técnica verificada</summary><div>{item.technicalEvidence.map((evidence) => <code key={evidence}>{evidence}</code>)}</div></details>
        </article>
      })}
    </section>
  </>
}
