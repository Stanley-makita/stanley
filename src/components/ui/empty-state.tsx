import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center text-gray-400', className)}>
      <Icon className="mb-3 h-12 w-12 opacity-30" />
      <p className="font-medium text-gray-500">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
