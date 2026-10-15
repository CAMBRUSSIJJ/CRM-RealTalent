import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg'
  tone?: 'default' | 'danger'
}

export function IconButton({ size = 'md', tone = 'default', className = '', children, type = 'button', ...props }: PropsWithChildren<IconButtonProps>) {
  return <button type={type} data-rt-primitive="icon-button" className={`rt-icon-button rt-icon-button--${size} rt-icon-button--${tone} icon-button ${className}`.trim()} {...props}>{children}</button>
}
