import { ArrowLeft, ArrowUpDown, Check, ChevronDown, Filter, MoreHorizontal, Plus, Search, Star, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { Button } from '../ui/button'

export type WorkspaceFilterOption = { value: string; label: string; count?: number; description?: string }
export type WorkspaceFilterKind = 'enum' | 'user' | 'date' | 'number' | 'currency' | 'boolean' | 'text'
export type WorkspaceFilterField = {
  key: string
  label: string
  value: string
  options: WorkspaceFilterOption[]
  allValue?: string
  allLabel?: string
  group?: string
  searchable?: boolean
  kind?: WorkspaceFilterKind
  description?: string
  operatorLabel?: string
}

export type WorkspaceSortOption = { value: string; label: string; description?: string }

const QUICK_FILTER_KEY = 'realtalent.workspace.quick-filters.v10169'
const FILTER_USAGE_KEY = 'realtalent.workspace.filter-usage.v10170'

type FilterUsage = { recent: string[]; counts: Record<string, number> }

function fieldDefault(field: WorkspaceFilterField) { return field.allValue ?? 'all' }
function fieldActive(field: WorkspaceFilterField) { return field.value !== fieldDefault(field) && field.value !== '' }
function fieldValueLabel(field: WorkspaceFilterField) {
  if (!fieldActive(field)) return field.allLabel ?? 'Qualquer'
  return field.options.find((item) => item.value === field.value)?.label ?? field.value
}

function readFilterUsage(workspaceKey: string): FilterUsage {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTER_USAGE_KEY) || '{}') as Record<string, FilterUsage>
    return parsed[workspaceKey] ?? { recent: [], counts: {} }
  } catch { return { recent: [], counts: {} } }
}
function writeFilterUsage(workspaceKey: string, usage: FilterUsage) {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTER_USAGE_KEY) || '{}') as Record<string, FilterUsage>
    parsed[workspaceKey] = usage
    localStorage.setItem(FILTER_USAGE_KEY, JSON.stringify(parsed))
  } catch { /* storage is optional */ }
}
function rememberFilter(workspaceKey: string, key: string) {
  const usage = readFilterUsage(workspaceKey)
  const next = {
    recent: [key, ...usage.recent.filter((item) => item !== key)].slice(0, 8),
    counts: { ...usage.counts, [key]: (usage.counts[key] ?? 0) + 1 },
  }
  writeFilterUsage(workspaceKey, next)
  return next
}

function useAnchoredPortal(open: boolean, anchorRef: RefObject<HTMLElement | null>, width = 380) {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', left: 16, top: 72, width })
  useEffect(() => {
    if (!open) return
    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const resolvedWidth = Math.min(width, Math.max(300, viewportWidth - 24))
      const left = Math.max(12, Math.min(rect.left, viewportWidth - resolvedWidth - 12))
      const desiredHeight = Math.min(620, viewportHeight - 24)
      const below = viewportHeight - rect.bottom
      const top = below >= Math.min(420, desiredHeight) ? rect.bottom + 8 : Math.max(12, rect.top - desiredHeight - 8)
      setStyle({ position: 'fixed', left, top, width: resolvedWidth, maxHeight: desiredHeight })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [anchorRef, open, width])
  return style
}

function useDismissableSurface(open: boolean, anchorRef: RefObject<HTMLElement | null>, surfaceRef: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!anchorRef.current?.contains(target) && !surfaceRef.current?.contains(target)) close()
    }
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true })
    }
  }, [anchorRef, close, open, surfaceRef])
}

function SurfaceHeader({ title, description, onClose, back }: { title: string; description?: string; onClose(): void; back?: () => void }) {
  return <header className="rt-surface-header-v10172">
    <div className="rt-surface-header-v10172__title">
      {back ? <button type="button" className="rt-surface-icon-button-v10172" onClick={back} aria-label="Voltar"><ArrowLeft size={17}/></button> : null}
      <div><strong>{title}</strong>{description ? <span>{description}</span> : null}</div>
    </div>
    <button type="button" className="rt-surface-icon-button-v10172" onClick={onClose} aria-label="Fechar"><X size={17}/></button>
  </header>
}

export function WorkspaceFilterMenu({
  workspaceKey,
  fields,
  activeCount = 0,
  onChange,
  onClearAll,
  onOpenAdvanced,
  label = 'Filtro',
  variant = 'ghost',
}: {
  workspaceKey: string
  fields: WorkspaceFilterField[]
  activeCount?: number
  onChange(key: string, value: string): void
  onClearAll?(): void
  onOpenAdvanced?(): void
  label?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [optionQuery, setOptionQuery] = useState('')
  const [tab, setTab] = useState<'recent' | 'popular' | 'all'>('all')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [usage, setUsage] = useState<FilterUsage>(() => readFilterUsage(workspaceKey))
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const portalStyle = useAnchoredPortal(open, anchorRef, 430)
  const close = useCallback(() => setOpen(false), [])

  useDismissableSurface(open, anchorRef, popoverRef, close)
  useEffect(() => { setUsage(readFilterUsage(workspaceKey)); setEditingKey(null); setQuery(''); setOptionQuery(''); setTab('all') }, [workspaceKey])
  useEffect(() => { if (!open) { setEditingKey(null); setOptionQuery('') } }, [open])

  const activeFields = useMemo(() => fields.filter(fieldActive), [fields])
  const availableFields = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    let source = fields
    if (tab === 'recent') source = usage.recent.map((key) => fields.find((field) => field.key === key)).filter(Boolean) as WorkspaceFilterField[]
    if (tab === 'popular') source = [...fields].sort((a, b) => (usage.counts[b.key] ?? 0) - (usage.counts[a.key] ?? 0)).slice(0, 8)
    if (normalized) source = source.filter((field) => `${field.label} ${field.group ?? ''} ${field.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalized))
    return source
  }, [fields, query, tab, usage])
  const grouped = useMemo(() => availableFields.reduce<Record<string, WorkspaceFilterField[]>>((acc, field) => {
    const group = field.group || 'Propriedades'
    ;(acc[group] ||= []).push(field)
    return acc
  }, {}), [availableFields])
  const editingField = fields.find((field) => field.key === editingKey) ?? null
  const editingOptions = useMemo(() => {
    if (!editingField) return []
    const needle = optionQuery.trim().toLocaleLowerCase('pt-BR')
    if (!needle) return editingField.options
    return editingField.options.filter((item) => `${item.label} ${item.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(needle))
  }, [editingField, optionQuery])

  const openField = (field: WorkspaceFilterField) => {
    setEditingKey(field.key)
    setOptionQuery('')
    setUsage(rememberFilter(workspaceKey, field.key))
  }
  const change = (field: WorkspaceFilterField, value: string) => {
    onChange(field.key, value)
    setUsage(rememberFilter(workspaceKey, field.key))
  }

  const catalog = <>
    <SurfaceHeader title="Filtros" description={activeCount ? `${activeCount} ativo${activeCount === 1 ? '' : 's'} nesta exibição` : 'Refine os registros exibidos'} onClose={close}/>
    <div className="rt-surface-body-v10172 workspace-filter-popover-v10170__body">
      <label className="rt-surface-search-v10172"><Search size={16}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar propriedade..." /></label>
      <div className="rt-segmented-v10172" role="tablist" aria-label="Catálogo de filtros">
        <button type="button" className={tab === 'recent' ? 'is-active' : ''} onClick={() => setTab('recent')}>Recentes</button>
        <button type="button" className={tab === 'popular' ? 'is-active' : ''} onClick={() => setTab('popular')}>Mais usados</button>
        <button type="button" className={tab === 'all' ? 'is-active' : ''} onClick={() => setTab('all')}>Todos</button>
      </div>
      {activeFields.length ? <section className="rt-filter-section-v10172 is-selected">
        <header><strong>Usados nesta exibição</strong>{onClearAll ? <button type="button" onClick={onClearAll}>Limpar</button> : null}</header>
        <div className="rt-property-list-v10172">{activeFields.map((field) => <button type="button" className="rt-property-row-v10172 is-active" key={`active-${field.key}`} onClick={() => openField(field)}><span className="rt-property-row-v10172__icon"><Check size={14}/></span><span><strong>{field.label}</strong><small>{fieldValueLabel(field)}</small></span><ChevronDown size={14}/></button>)}</div>
      </section> : null}
      <div className="workspace-filter-popover-v10170__catalog rt-filter-catalog-v10172">
        {Object.entries(grouped).map(([group, groupFields]) => <section className="rt-filter-section-v10172" key={group}><header><strong>{group}</strong></header><div className="rt-property-list-v10172">{groupFields.map((field) => <button type="button" className={`rt-property-row-v10172 ${fieldActive(field) ? 'is-active' : ''}`} key={field.key} onClick={() => openField(field)}><span className="rt-property-row-v10172__icon">{fieldActive(field) ? <Check size={14}/> : <Plus size={14}/>}</span><span><strong>{field.label}</strong><small>{fieldActive(field) ? fieldValueLabel(field) : field.description ?? field.allLabel ?? 'Qualquer'}</small></span><ChevronDown size={14}/></button>)}</div></section>)}
        {!Object.keys(grouped).length ? <div className="rt-surface-empty-v10172">Nenhuma propriedade encontrada.</div> : null}
      </div>
    </div>
    <footer className="rt-surface-footer-v10172">{onOpenAdvanced ? <button type="button" className="rt-surface-link-v10172" onClick={() => { close(); onOpenAdvanced() }}>Mais opções de filtro</button> : <span/>}<Button size="sm" onClick={close}>Concluir</Button></footer>
  </>

  const editor = editingField ? <>
    <SurfaceHeader title={editingField.label} description={editingField.description ?? `Escolha como filtrar por ${editingField.label.toLocaleLowerCase('pt-BR')}`} back={() => setEditingKey(null)} onClose={close}/>
    <div className="rt-surface-body-v10172 rt-filter-editor-v10172">
      <div className="rt-filter-operator-v10172"><span>Condição</span><div className="rt-filter-operator-v10172__value">{editingField.operatorLabel ?? 'é qualquer um de'}</div></div>
      {editingField.options.length > 7 || editingField.searchable ? <label className="rt-surface-search-v10172"><Search size={16}/><input autoFocus value={optionQuery} onChange={(event) => setOptionQuery(event.target.value)} placeholder={`Buscar ${editingField.label.toLocaleLowerCase('pt-BR')}...`} /></label> : null}
      <div className="rt-value-picker-v10172" role="radiogroup" aria-label={`Valores de ${editingField.label}`}>
        <button type="button" role="radio" aria-checked={!fieldActive(editingField)} className={!fieldActive(editingField) ? 'is-selected' : ''} onClick={() => change(editingField, fieldDefault(editingField))}><span className="rt-value-check-v10172">{!fieldActive(editingField) ? <Check size={14}/> : null}</span><span><strong>{editingField.allLabel ?? 'Qualquer'}</strong><small>Não restringir por esta propriedade</small></span></button>
        {editingOptions.map((option) => <button type="button" role="radio" aria-checked={editingField.value === option.value} className={editingField.value === option.value ? 'is-selected' : ''} key={`${editingField.key}-${option.value}`} onClick={() => change(editingField, option.value)}><span className="rt-value-check-v10172">{editingField.value === option.value ? <Check size={14}/> : null}</span><span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : typeof option.count === 'number' ? <small>{option.count} registro(s)</small> : null}</span>{typeof option.count === 'number' ? <em>{option.count}</em> : null}</button>)}
        {!editingOptions.length ? <div className="rt-surface-empty-v10172">Nenhum valor encontrado.</div> : null}
      </div>
    </div>
    <footer className="rt-surface-footer-v10172"><button type="button" className="rt-surface-link-v10172" onClick={() => change(editingField, fieldDefault(editingField))}>Limpar propriedade</button><Button size="sm" onClick={() => setEditingKey(null)}>Aplicar</Button></footer>
  </> : null

  const popover = open ? <div ref={popoverRef} className="workspace-filter-popover-v10170 rt-surface-v10172 rt-filter-builder-v10172" style={portalStyle} role="dialog" aria-modal="false" aria-label="Filtros do workspace">{editor ?? catalog}</div> : null

  return <div className="workspace-filter-trigger-v10170" ref={anchorRef}>
    <Button variant={activeCount ? 'secondary' : variant} className={activeCount ? 'rt-trigger-active-v10172' : ''} onClick={() => setOpen((value) => !value)} aria-expanded={open}><Filter size={16}/>{label}{activeCount ? <span className="rt-trigger-count-v10172">{activeCount}</span> : null}</Button>
    {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
  </div>
}

export function WorkspaceFilterChips({ fields, onChange, onClearAll }: { fields: WorkspaceFilterField[]; onChange(key: string, value: string): void; onClearAll?(): void }) {
  const active = fields.filter(fieldActive)
  if (!active.length) return null
  return <section className="workspace-filter-chips-v10170 rt-filter-chips-v10172" aria-label="Filtros aplicados">
    {active.map((field) => <button type="button" key={field.key} onClick={() => onChange(field.key, fieldDefault(field))}><strong>{field.label}:</strong> {fieldValueLabel(field)} <X size={12}/></button>)}
    {onClearAll ? <button type="button" className="is-clear" onClick={onClearAll}>Limpar tudo</button> : null}
  </section>
}

/** @deprecated V101.7.0: mantido apenas para compatibilidade de extensões antigas. */
export function WorkspaceQuickFilters(props: {
  workspaceKey: string
  fields: WorkspaceFilterField[]
  defaultQuickKeys: string[]
  onChange(key: string, value: string): void
  onOpenAdvanced?(): void
  activeCount?: number
  onClearAll?(): void
}) {
  return <div className="workspace-quick-filter-compat-v10170" data-deprecated-quick-filter="true"><WorkspaceFilterMenu workspaceKey={props.workspaceKey} fields={props.fields} activeCount={props.activeCount} onChange={props.onChange} onOpenAdvanced={props.onOpenAdvanced} onClearAll={props.onClearAll}/><WorkspaceFilterChips fields={props.fields} onChange={props.onChange} onClearAll={props.onClearAll}/></div>
}

export type WorkspaceViewStripItem = {
  id: string
  label: string
  active?: boolean
  favorite?: boolean
  count?: number
  icon?: ReactNode
  accent?: 'blue' | 'red' | 'orange' | 'green' | 'purple' | 'neutral'
  onClick(): void
  menu?: Array<{ label: string; onClick(): void; danger?: boolean; disabled?: boolean }>
}

export function WorkspaceViewStrip({ items, onAdd, addLabel = 'Nova exibição' }: { items: WorkspaceViewStripItem[]; onAdd?(): void; addLabel?: string }) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const proxyRef = useRef<HTMLElement | null>(null)
  proxyRef.current = menuAnchor
  const menuStyle = useAnchoredPortal(Boolean(menuId), proxyRef, 224)

  useEffect(() => {
    if (!menuId) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuAnchor?.contains(target) && !menuRef.current?.contains(target)) setMenuId(null)
    }
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setMenuId(null) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', onKey) }
  }, [menuAnchor, menuId])

  const handleViewKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = Math.max(0, items.length - 1)
    else return
    event.preventDefault()
    const buttons = event.currentTarget.closest('.workspace-view-strip-v10169')?.querySelectorAll<HTMLButtonElement>('.workspace-view-chip-v10169__main')
    buttons?.[next]?.focus(); items[next]?.onClick()
  }
  const activeItem = items.find((item) => item.id === menuId)
  const menu = menuId && activeItem?.menu?.length ? <div ref={menuRef} className="workspace-view-menu-v10170 rt-menu-v10172" style={menuStyle} role="menu">{activeItem.menu.map((action, index) => <button type="button" role="menuitem" disabled={action.disabled} className={action.danger ? 'is-danger' : ''} key={`${activeItem.id}-${index}`} onClick={() => { action.onClick(); setMenuId(null) }}>{action.label}</button>)}</div> : null

  return <section className="workspace-view-strip-v10169 workspace-view-strip-v10170" aria-label="Exibições">
    <div className="workspace-view-strip-v10169__scroll" role="tablist" aria-label="Exibições do workspace">
      {items.map((item, index) => <div key={item.id} className={`workspace-view-chip-v10169 workspace-view-chip-v10169--${item.accent ?? 'neutral'} ${item.active ? 'is-active' : ''}`}>
        <button type="button" role="tab" className="workspace-view-chip-v10169__main" onClick={item.onClick} onKeyDown={(event) => handleViewKey(event, index)} aria-selected={Boolean(item.active)} tabIndex={item.active ? 0 : -1}>
          {item.icon ? <span className="workspace-view-chip-v10169__icon">{item.icon}</span> : null}<strong>{item.label}</strong>{typeof item.count === 'number' ? <em>{item.count}</em> : null}{item.favorite ? <Star size={12}/> : null}
        </button>
        {item.menu?.length ? <button type="button" className="workspace-view-chip-menu-trigger-v10170" aria-label={`Opções de ${item.label}`} onClick={(event) => { setMenuAnchor(event.currentTarget); setMenuId((current) => current === item.id ? null : item.id) }}><MoreHorizontal size={14}/></button> : null}
      </div>)}
    </div>
    {onAdd ? <Button size="sm" variant="ghost" onClick={onAdd}><Plus size={15}/>{addLabel}</Button> : null}
    {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
  </section>
}

export function WorkspaceCommandBar({ query, onQueryChange, placeholder, left, actions }: { query?: string; onQueryChange?(value: string): void; placeholder?: string; left?: ReactNode; actions?: ReactNode }) {
  return <section className="workspace-command-bar-v10169 workspace-command-bar-v10170"><div className="workspace-command-bar-v10169__left">{typeof query === 'string' && onQueryChange ? <label className="workspace-command-search-v10169"><Search size={17}/><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder ?? 'Buscar...'} /></label> : null}{left}</div><div className="workspace-command-bar-v10169__actions">{actions}</div></section>
}

export function WorkspaceSortMenu({ label = 'Classificar', options, value, onChange }: { label?: string; options: WorkspaceSortOption[]; value: string; onChange(value: string): void }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const style = useAnchoredPortal(open, anchorRef, 320)
  const close = useCallback(() => setOpen(false), [])
  useDismissableSurface(open, anchorRef, popoverRef, close)
  const selected = options.find((option) => option.value === value)
  const popover = open ? <div ref={popoverRef} className="rt-surface-v10172 rt-sort-popover-v10172" style={style} role="dialog" aria-label="Classificar registros">
    <SurfaceHeader title="Classificar" description="Defina a ordem desta exibição" onClose={close}/>
    <div className="rt-surface-body-v10172 rt-sort-list-v10172">{options.map((option) => <button type="button" key={option.value} className={value === option.value ? 'is-selected' : ''} onClick={() => { onChange(option.value); close() }}><span className="rt-value-check-v10172">{value === option.value ? <Check size={14}/> : null}</span><span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span></button>)}</div>
  </div> : null
  return <div ref={anchorRef} className="rt-sort-trigger-v10172"><Button variant="ghost" onClick={() => setOpen((current) => !current)} aria-expanded={open}><ArrowUpDown size={16}/><span>{label}</span>{selected ? <em>{selected.label}</em> : null}<ChevronDown size={14}/></Button>{typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}</div>
}

export function WorkspaceDisplayMenu({ label = 'Exibição', modes, value, onChange, extra }: { label?: string; modes: Array<{ value: string; label: string; icon?: ReactNode; description?: string }>; value: string; onChange(value: string): void; extra?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const style = useAnchoredPortal(open, anchorRef, 340)
  const close = useCallback(() => setOpen(false), [])
  useDismissableSurface(open, anchorRef, popoverRef, close)
  const selected = modes.find((mode) => mode.value === value)
  const popover = open ? <div ref={popoverRef} className="workspace-display-popover-v10170 rt-surface-v10172 rt-display-popover-v10172" style={style} role="dialog" aria-label="Configurar exibição">
    <SurfaceHeader title="Exibição" description="Escolha como visualizar este workspace" onClose={close}/>
    <div className="rt-surface-body-v10172"><span className="rt-surface-kicker-v10172">Modo</span><div className="rt-display-options-v10172">{modes.map((mode) => <button type="button" key={mode.value} className={value === mode.value ? 'is-selected' : ''} onClick={() => { onChange(mode.value); close() }}><span className="rt-display-option-icon-v10172">{mode.icon}{value === mode.value ? <Check size={13}/> : null}</span><span><strong>{mode.label}</strong>{mode.description ? <small>{mode.description}</small> : null}</span></button>)}</div></div>{extra ? <footer className="rt-surface-footer-v10172 is-stacked">{extra}</footer> : null}
  </div> : null
  return <div ref={anchorRef} className="workspace-display-trigger-v10170"><Button variant="secondary" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{label}{selected ? <span className="rt-display-current-v10172">· {selected.label}</span> : null}<ChevronDown size={14}/></Button>{typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}</div>
}

export function WorkspaceAdvancedFilterDrawer({ title, eyebrow, description, onClose, onClear, children }: { title: string; eyebrow: string; description?: string; onClose(): void; onClear?(): void; children: ReactNode }) {
  return <><button type="button" className="rt-drawer-backdrop-v10172" aria-label="Fechar painel" onClick={onClose}/><aside className="workspace-advanced-filter-drawer-v10169 rt-drawer-v10172" aria-label={title} role="dialog" aria-modal="true"><header><div><span>{eyebrow}</span><strong>{title}</strong>{description ? <small>{description}</small> : null}</div><button type="button" className="rt-surface-icon-button-v10172" onClick={onClose} aria-label="Fechar filtros"><X size={18}/></button></header><div className="workspace-advanced-filter-drawer-v10169__body">{children}</div><footer>{onClear ? <Button variant="secondary" onClick={onClear}>Limpar filtros</Button> : <span/>}<Button onClick={onClose}>Aplicar</Button></footer></aside></>
}

// Compatibilidade de storage da V101.6.9 para upgrades sem perda de preferências.
export function readLegacyQuickFilterKeys(workspaceKey: string, defaults: string[]) {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUICK_FILTER_KEY) || '{}') as Record<string, string[]>
    const value = parsed[workspaceKey]
    return Array.isArray(value) && value.length ? value : defaults
  } catch { return defaults }
}
