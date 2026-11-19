import { useEffect, type ButtonHTMLAttributes, type PropsWithChildren } from 'react'
import { ensureBlobFilter } from './blob-filter'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  /** "blob": no hover, bolhas sobem e preenchem o botão (efeito do Blue Ocean). Opcional. */
  effect?: 'blob'
}

export function Button({ variant = 'primary', size = 'md', loading = false, effect, disabled, children, className = '', ...props }: PropsWithChildren<ButtonProps>) {
  useEffect(() => { if (effect === 'blob') ensureBlobFilter() }, [effect])
  const blob = effect === 'blob' && !disabled && !loading
  return (
    <button className={`button button--${variant} button--${size} ${blob ? 'button--blob' : ''} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} data-loading={loading ? 'true' : undefined} {...props}>
      {loading ? <span className="button__spinner" aria-hidden="true" /> : null}
      {blob ? (
        <>
          <span className="button--blob__fill" aria-hidden="true">
            <span className="button--blob__blob" />
            <span className="button--blob__blob" />
            <span className="button--blob__blob" />
            <span className="button--blob__blob" />
          </span>
          <span className="button--blob__sweep" aria-hidden="true" />
          <span className="button--blob__label">{children}</span>
        </>
      ) : children}
    </button>
  )
}
