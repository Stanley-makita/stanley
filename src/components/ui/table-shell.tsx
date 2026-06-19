import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TableShellProps {
  children: ReactNode
  className?: string
}

export function TableShell({ children, className }: TableShellProps) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-gray-200 bg-white', className)}>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  )
}
