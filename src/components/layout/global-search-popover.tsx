import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { globalSearchKindLabel, type GlobalSearchResult } from '../../services/global-search'

export type GlobalFindGroup = {
  key: string
  label: string
  items: GlobalSearchResult[]
}

interface Props {
  anchorRef: RefObject<HTMLDivElement | null>
  query: string
  groups: GlobalFindGroup[]
  total: number
  activeIndex: number
  onOpen: (result: GlobalSearchResult) => void
  onClose: () => void
  onAllContacts: () => void
}

/** Portal bypasses the sidebar, transformed shell, and inherited button layouts. */
export function GlobalSearchPopover({
  anchorRef, query, groups, total, activeIndex, onOpen, onClose, onAllContacts,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 64, left: 80, width: 420 })

  useLayoutEffect(() => {
    const reposition = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(Math.max(390, rect.width), 460, window.innerWidth - 24)
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
      setPosition({ top: rect.bottom + 8, left, width })
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [anchorRef])

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [anchorRef, onClose])

  let index = -1
  return createPortal(
    <div
      id="global-search-results"
      ref={popoverRef}
      className="rt-global-find"
      role="listbox"
      aria-label="Resultados da busca global"
      style={{ top: position.top, left: position.left, width: position.width }}
    >
      <div className="rt-global-find__heading">
        <div><strong>Busca global</strong><small>Encontre pessoas, negócios e módulos</small></div>
        <span aria-live="polite">{total === 1 ? '1 resultado' : total + ' resultados'}</span>
      </div>
      <div className="rt-global-find__content">
        {groups.length ? groups.map(group => (
          <section key={group.key} aria-label={group.label} className="rt-global-find__group">
            <div className="rt-global-find__group-heading">
              <span>{group.label}</span><b>{group.items.length}</b>
            </div>
            {group.items.map(result => {
              index += 1
              const rowIndex = index
              return (
                <button
                  key={result.id}
                  id={'rt-global-find-result-' + rowIndex}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === rowIndex}
                  tabIndex={-1}
                  className={'rt-global-find__option' + (activeIndex === rowIndex ? ' is-active' : '')}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => onOpen(result)}
                >
                  <span className="rt-global-find__kind">{globalSearchKindLabel[result.kind]}</span>
                  <span className="rt-global-find__copy">
                    <strong>{result.title}</strong><small>{result.subtitle}</small>
                  </span>
                </button>
              )
            })}
          </section>
        )) : (
          <div className="rt-global-find__empty">
            <Search size={21} />
            <strong>Nenhum resultado para “{query.trim()}”</strong>
            <span>Pesquise por contato, empresa, oportunidade ou módulo.</span>
          </div>
        )}
      </div>
      <div className="rt-global-find__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> fechar</span>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={onAllContacts}>
          Abrir contatos
        </button>
      </div>
    </div>,
    document.body,
  )
}
