import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, children, className = '', ...props }: PropsWithChildren<ButtonProps>) {
  return (
    <button className={`button button--${variant} button--${size} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} data-loading={loading ? 'true' : undefined} {...props}>
      {loading ? <span className="button__spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
