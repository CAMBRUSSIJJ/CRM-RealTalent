import type { LucideIcon } from 'lucide-react'
import type { PropsWithChildren, ReactNode } from 'react'

export interface WorkspaceViewItem<T extends string = string> {
  id: T
  label: ReactNode
  icon?: LucideIcon
  badge?: ReactNode
  disabled?: boolean
}

export function WorkspacePageHeader({ eyebrow, title, description, icon: Icon, actions, className = '' }: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  className?: string
}) {
  return <header data-rt-layout="page-header" className={`rt-workspace-page-header ${className}`.trim()}>
    <div className="rt-workspace-page-header__copy">
      {eyebrow ? <span className="rt-workspace-page-header__eyebrow">{Icon ? <Icon size={13} aria-hidden="true" /> : null}{eyebrow}</span> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="rt-workspace-page-header__actions">{actions}</div> : null}
  </header>
}

export function WorkspaceSummaryStrip({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section data-rt-layout="summary-strip" className={`rt-workspace-summary-strip ${className}`.trim()}>{children}</section>
}

export function WorkspaceSummaryMetric({ label, value, meta, icon: Icon, tone = 'neutral', active = false, progress = null, progressLabel, onClick }: {
  label: ReactNode
  value: ReactNode
  meta?: ReactNode
  icon?: LucideIcon
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'
  active?: boolean
  progress?: number | null
  progressLabel?: ReactNode
  onClick?: () => void
}) {
  const normalizedProgress = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : null
  const content = <>
    {Icon ? <span className="rt-workspace-summary-metric__icon"><Icon size={15} aria-hidden="true" /></span> : null}
    <span className="rt-workspace-summary-metric__body">
      <small>{label}</small><strong>{value}</strong>{meta ? <em>{meta}</em> : null}
      {normalizedProgress !== null ? <span className="rt-workspace-summary-metric__progress" aria-label={typeof progressLabel === 'string' ? progressLabel : `${Math.round(normalizedProgress)}%`}><i style={{ width: `${normalizedProgress}%` }} />{progressLabel ? <b>{progressLabel}</b> : null}</span> : null}
    </span>
  </>
  return onClick
    ? <button type="button" className={`rt-workspace-summary-metric is-${tone} ${active ? 'is-active' : ''}`.trim()} aria-pressed={active} onClick={onClick}>{content}</button>
    : <article className={`rt-workspace-summary-metric is-${tone} ${active ? 'is-active' : ''}`.trim()}>{content}</article>
}

export function WorkspaceViewStrip<T extends string>({ items, value, onChange, ariaLabel = 'Visualização', className = '' }: {
  items: readonly WorkspaceViewItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
}) {
  return <nav data-rt-layout="view-strip" className={`rt-workspace-view-strip ${className}`.trim()} aria-label={ariaLabel}>
    {items.map((item) => {
      const Icon = item.icon
      return <button key={item.id} type="button" className={value === item.id ? 'is-active' : ''} aria-current={value === item.id ? 'page' : undefined} disabled={item.disabled} onClick={() => onChange(item.id)}>
        {Icon ? <Icon size={15} aria-hidden="true" /> : null}<span>{item.label}</span>{item.badge != null ? <b>{item.badge}</b> : null}
      </button>
    })}
  </nav>
}

export function WorkspaceCommandBar({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section data-rt-layout="command-bar" className={`rt-workspace-command-bar ${className}`.trim()}>{children}</section>
}

export function WorkspaceCommandGroup({ children, align = 'start', className = '' }: PropsWithChildren<{ align?: 'start' | 'end'; className?: string }>) {
  return <div className={`rt-workspace-command-group is-${align} ${className}`.trim()}>{children}</div>
}
