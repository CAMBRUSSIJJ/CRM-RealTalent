import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  subtitle?: string
  footer?: ReactNode
  headerActions?: ReactNode
  onClose(): void
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const EXIT_DURATION_MS = 180
let modalLockCount = 0

export function Modal({ open, title, subtitle, footer, headerActions, onClose, size = 'md', children }: PropsWithChildren<ModalProps>) {
  const titleId = useId()
  const subtitleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const timer = window.setTimeout(() => { setMounted(false); setClosing(false) }, EXIT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [mounted, open])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    window.requestAnimationFrame(() => {
      const autofocus = dialogRef.current?.querySelector<HTMLElement>('[autofocus]')
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(focusableSelector)
      ;(autofocus ?? firstFocusable ?? dialogRef.current)?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => !element.hidden)
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return }
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    modalLockCount += 1
    document.body.classList.add('modal-open')
    return () => {
      modalLockCount = Math.max(0, modalLockCount - 1)
      if (modalLockCount === 0) document.body.classList.remove('modal-open')
    }
  }, [open])

  if (!mounted) return null
  return (
    <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (open && event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} tabIndex={-1} className={`modal modal--${size} ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined}>
        <header className="modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
          </div>
          <div className="modal__header-actions">
            {headerActions}
            <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
          </div>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
