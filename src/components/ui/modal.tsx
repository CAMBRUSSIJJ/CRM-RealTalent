import { X } from 'lucide-react'
import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  subtitle?: string
  footer?: ReactNode
  onClose(): void
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, title, subtitle, footer, onClose, size = 'md', children }: PropsWithChildren<ModalProps>) {
  const titleId = useId()
  const subtitleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
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
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('modal-open')
      previouslyFocused?.focus()
    }
  }, [onClose, open])

  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} tabIndex={-1} className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined}>
        <header className="modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
