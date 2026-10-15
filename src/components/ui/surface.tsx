import type { HTMLAttributes, PropsWithChildren } from 'react'

export function Surface({ className = '', children, ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return <section data-rt-primitive="surface" className={`rt-surface ${className}`.trim()} {...props}>{children}</section>
}
