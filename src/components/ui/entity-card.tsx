import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EntityCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  children: ReactNode
}

export function EntityCard({ interactive = false, className, children, ...props }: EntityCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-4 transition-all',
        interactive && 'cursor-pointer hover:border-[#C2AA6A] hover:shadow-md',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
