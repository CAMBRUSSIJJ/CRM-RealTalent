import type { PropsWithChildren, TableHTMLAttributes } from 'react'

export function DataGrid({ className = '', children, ...props }: PropsWithChildren<TableHTMLAttributes<HTMLTableElement>>) {
  return <table data-rt-primitive="data-grid" className={`rt-data-grid data-table ${className}`.trim()} {...props}>{children}</table>
}
