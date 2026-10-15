import type { ReactNode } from 'react'

export interface TabItem {
  id: string
  label: ReactNode
  disabled?: boolean
}

export function Tabs({ items, value, onChange, ariaLabel = 'Abas', className = '' }: { items: TabItem[]; value: string; onChange(id: string): void; ariaLabel?: string; className?: string }) {
  return <div data-rt-primitive="tabs" className={`rt-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
    {items.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === value} disabled={item.disabled} className={item.id === value ? 'is-active' : ''} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </div>
}
