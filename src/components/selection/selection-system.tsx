import { Check, ChevronDown, Search, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { WorkspaceMember } from '../../domain/types'
import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, type SelectHTMLAttributes } from 'react'

export interface SelectionOption {
  value: string
  label: string
  description?: string
  count?: number
  disabled?: boolean
  prefix?: ReactNode
  suffix?: ReactNode
  keywords?: string
}

export interface SelectionSelectProps {
  value: string
  options: SelectionOption[]
  onValueChange(value: string): void
  placeholder?: string
  searchPlaceholder?: string
  searchable?: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  ariaLabel?: string
  clearable?: boolean
  emptyLabel?: string
  recentValues?: string[]
}

function normalize(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function usePopoverPosition(open: boolean, anchorRef: RefObject<HTMLElement | null>) {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', left: 12, top: 60, minWidth: 220 })
  useEffect(() => {
    if (!open) return
    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.max(220, Math.min(420, rect.width))
      const maxHeight = Math.min(360, window.innerHeight - 32)
      const below = window.innerHeight - rect.bottom
      const top = below > 240 ? rect.bottom + 6 : Math.max(12, rect.top - maxHeight - 6)
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
      setStyle({ position: 'fixed', left, top, width, maxHeight })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [anchorRef, open])
  return style
}

function useDismiss(open: boolean, anchorRef: RefObject<HTMLElement | null>, surfaceRef: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const pointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!anchorRef.current?.contains(target) && !surfaceRef.current?.contains(target)) close()
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key) }
  }, [anchorRef, close, open, surfaceRef])
}

function optionMatches(option: SelectionOption, query: string) {
  const needle = normalize(query.trim())
  if (!needle) return true
  return normalize(`${option.label} ${option.description ?? ''} ${option.keywords ?? ''}`).includes(needle)
}

export function SelectionSelect({
  value, options, onValueChange, placeholder = 'Selecionar...', searchPlaceholder = 'Buscar...', searchable,
  disabled, size = 'md', className = '', ariaLabel, clearable, emptyLabel = 'Nenhuma opção encontrada.', recentValues = [],
}: SelectionSelectProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const selected = options.find((option) => option.value === value)
  const shouldSearch = searchable ?? options.length > 8
  const filtered = useMemo(() => {
    const matching = options.filter((option) => optionMatches(option, query))
    if (query || !recentValues.length) return matching
    const recent = recentValues.map((recent) => matching.find((option) => option.value === recent)).filter(Boolean) as SelectionOption[]
    const rest = matching.filter((option) => !recentValues.includes(option.value))
    return [...recent, ...rest]
  }, [options, query, recentValues])
  const style = usePopoverPosition(open, anchorRef)
  useDismiss(open, anchorRef, surfaceRef, () => setOpen(false))

  useEffect(() => { if (!open) { setQuery(''); setActiveIndex(0) } }, [open])
  useEffect(() => { if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1)) }, [activeIndex, filtered.length])

  const choose = (option: SelectionOption) => {
    if (option.disabled) return
    onValueChange(option.value)
    setOpen(false)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open && ['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setOpen(true); return }
    if (!open) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(filtered.length - 1, index + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)) }
    if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]) }
  }

  const menu = open ? <div ref={surfaceRef} className="rt-selection-menu-v101105" style={style} role="listbox" aria-label={ariaLabel ?? placeholder}>
    {shouldSearch ? <label className="rt-selection-search-v101105"><Search size={15}/><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} placeholder={searchPlaceholder}/>{query ? <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><X size={14}/></button> : null}</label> : null}
    <div className="rt-selection-options-v101105">
      {filtered.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} className={`${option.value === value ? 'is-selected' : ''} ${index === activeIndex ? 'is-active' : ''}`.trim()} key={option.value} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>
        <span className="rt-selection-option-check-v101105">{option.value === value ? <Check size={14}/> : option.prefix ?? null}</span>
        <span className="rt-selection-option-copy-v101105"><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
        {typeof option.count === 'number' ? <em>{option.count}</em> : option.suffix ?? null}
      </button>)}
      {!filtered.length ? <div className="rt-selection-empty-v101105">{emptyLabel}</div> : null}
    </div>
    {clearable && value ? <footer><button type="button" onClick={() => { onValueChange(''); setOpen(false) }}>Limpar seleção</button></footer> : null}
  </div> : null

  return <div ref={anchorRef} className={`rt-selection-v101105 rt-selection-v101105--${size} ${className}`.trim()}>
    <button type="button" className="rt-selection-trigger-v101105" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onKeyDown={onKeyDown} onClick={() => setOpen((current) => !current)}>
      <span className={selected ? '' : 'is-placeholder'}>{selected?.prefix}<span>{selected?.label ?? placeholder}</span></span><ChevronDown size={15}/>
    </button>
    {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
  </div>
}


function optionText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(optionText).join('')
  if (isValidElement(node)) return optionText((node.props as { children?: ReactNode }).children)
  return ''
}

function nativeOptions(children: ReactNode): SelectionOption[] {
  const options: SelectionOption[] = []
  const visit = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return
      if (child.type === 'option') {
        const props = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode }
        const label = optionText(props.children).trim()
        options.push({ value: String(props.value ?? label), label: label || String(props.value ?? ''), disabled: props.disabled })
        return
      }
      const nested = (child.props as { children?: ReactNode }).children
      if (nested !== undefined) visit(nested)
    })
  }
  visit(children)
  return options
}

/** Compatibility layer used by the global rollout: preserves the existing select API while rendering the RealTalent Selection System. */
export function NativeSelectionSelect({
  children, value, defaultValue, onChange, disabled, className = '', 'aria-label': ariaLabel, title,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const initial = Array.isArray(defaultValue) ? String(defaultValue[0] ?? '') : String(defaultValue ?? '')
  const [internalValue, setInternalValue] = useState(initial)
  const controlled = value !== undefined
  const currentValue = controlled ? (Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')) : internalValue
  const options = useMemo(() => nativeOptions(children), [children])
  const change = (next: string) => {
    if (!controlled) setInternalValue(next)
    if (onChange) onChange({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLSelectElement>)
  }
  return <SelectionSelect value={currentValue} options={options} onValueChange={change} disabled={disabled} className={className} ariaLabel={ariaLabel ?? title} placeholder={options[0]?.label ?? 'Selecionar...'} searchable={options.length > 8} />
}

export interface MultiSelectionProps {
  values: string[]
  options: SelectionOption[]
  onValuesChange(values: string[]): void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export function MultiSelection({ values, options, onValuesChange, placeholder = 'Selecionar...', searchPlaceholder = 'Buscar...', disabled, className = '', ariaLabel }: MultiSelectionProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const style = usePopoverPosition(open, anchorRef)
  useDismiss(open, anchorRef, surfaceRef, () => setOpen(false))
  const filtered = useMemo(() => options.filter((option) => optionMatches(option, query)), [options, query])
  const summary = values.length === 0 ? placeholder : values.length === 1 ? options.find((option) => option.value === values[0])?.label ?? '1 selecionado' : `${options.find((option) => option.value === values[0])?.label ?? 'Selecionado'} +${values.length - 1}`
  const toggle = (value: string) => onValuesChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  const menu = open ? <div ref={surfaceRef} className="rt-selection-menu-v101105" style={style} role="dialog" aria-label={ariaLabel ?? placeholder}>
    <label className="rt-selection-search-v101105"><Search size={15}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder}/></label>
    <div className="rt-selection-options-v101105">{filtered.map((option) => <button type="button" key={option.value} className={values.includes(option.value) ? 'is-selected' : ''} disabled={option.disabled} onClick={() => toggle(option.value)}><span className="rt-selection-option-check-v101105">{values.includes(option.value) ? <Check size={14}/> : null}</span><span className="rt-selection-option-copy-v101105"><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span></button>)}{!filtered.length ? <div className="rt-selection-empty-v101105">Nenhum resultado.</div> : null}</div>
    <footer><button type="button" onClick={() => onValuesChange([])}>Limpar</button><button type="button" onClick={() => setOpen(false)}>Concluir</button></footer>
  </div> : null
  return <div ref={anchorRef} className={`rt-selection-v101105 rt-selection-v101105--md ${className}`.trim()}><button type="button" disabled={disabled} className="rt-selection-trigger-v101105" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span className={values.length ? '' : 'is-placeholder'}><span>{summary}</span>{values.length > 1 ? <em>{values.length}</em> : null}</span><ChevronDown size={15}/></button>{typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}</div>
}

export function FilterSelection({ value, options, onValueChange, label, className = '' }: { value: string; options: SelectionOption[]; onValueChange(value: string): void; label: string; className?: string }) {
  const selected = options.find((option) => option.value === value)
  const defaultValue = options[0]?.value ?? ''
  return <SelectionSelect value={value} options={options} onValueChange={onValueChange} className={`rt-filter-selection-v101105 ${value !== defaultValue ? 'is-active' : ''} ${className}`.trim()} size="sm" ariaLabel={label} placeholder={label} />
}

export interface EntityOption extends SelectionOption { initials?: string; meta?: string }
export function EntityPicker({ value, options, onValueChange, placeholder = 'Selecionar...', disabled, ariaLabel }: { value: string; options: EntityOption[]; onValueChange(value: string): void; placeholder?: string; disabled?: boolean; ariaLabel?: string }) {
  return <SelectionSelect value={value} onValueChange={onValueChange} disabled={disabled} placeholder={placeholder} ariaLabel={ariaLabel} searchable searchPlaceholder="Buscar por nome, empresa ou contexto..." options={options.map((option) => ({ ...option, prefix: option.prefix ?? (option.initials ? <span className="rt-entity-avatar-v101105">{option.initials}</span> : undefined), description: option.description ?? option.meta }))} />
}

export function OwnerPicker({ value, members, onValueChange, disabled, allowUnassigned = true, ariaLabel = 'Responsável' }: { value: string; members: WorkspaceMember[]; onValueChange(value: string): void; disabled?: boolean; allowUnassigned?: boolean; ariaLabel?: string }) {
  const options: EntityOption[] = [
    ...(allowUnassigned ? [{ value: '', label: 'Sem responsável', description: 'Disponível para atribuição pela equipe', initials: '—', keywords: 'equipe nao atribuido sem responsavel' }] : []),
    ...members.map((member) => ({ value: member.userId, label: member.displayName, description: `${member.role === 'owner' ? 'Proprietário' : member.role === 'admin' ? 'Administrador' : member.role === 'viewer' ? 'Somente leitura' : 'Vendedor'} · ${member.email}`, initials: member.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(), keywords: `${member.displayName} ${member.email} ${member.role}` })),
  ]
  return <EntityPicker value={value} options={options} onValueChange={onValueChange} disabled={disabled} ariaLabel={ariaLabel} placeholder="Escolher responsável..." />
}

export function SelectionCheckbox({ checked, onCheckedChange, disabled, indeterminate, label, description, className = '', ariaLabel }: { checked: boolean; onCheckedChange(checked: boolean): void; disabled?: boolean; indeterminate?: boolean; label?: ReactNode; description?: ReactNode; className?: string; ariaLabel?: string }) {
  return <label className={`rt-checkbox-v101105 ${disabled ? 'is-disabled' : ''} ${className}`.trim()}><button type="button" role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} aria-label={ariaLabel} disabled={disabled} className={`${checked ? 'is-checked' : ''} ${indeterminate ? 'is-indeterminate' : ''}`.trim()} onClick={() => onCheckedChange(!checked)}>{indeterminate ? <span/> : checked ? <Check size={13}/> : null}</button>{label !== undefined || description !== undefined ? <span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span> : null}</label>
}

export function SelectionToolbar({ count, children, onClear, label = 'selecionados' }: { count: number; children: ReactNode; onClear?(): void; label?: string }) {
  if (!count) return null
  return <div className="rt-selection-toolbar-v101105" role="region" aria-label={`${count} ${label}`}><div><strong>{count}</strong><span>{label}</span>{onClear ? <button type="button" onClick={onClear}>Limpar</button> : null}</div><div>{children}</div></div>
}
