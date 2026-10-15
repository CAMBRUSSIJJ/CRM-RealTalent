import type { PropsWithChildren } from 'react'

export function StatusPill({ tone = 'neutral', children }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }>) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>
}
