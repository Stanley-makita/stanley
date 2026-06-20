import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type StatusBadgeVariant = 'neutral' | 'success' | 'warning' | 'brand'

const variantClass: Record<StatusBadgeVariant, string> = {
  neutral: 'border-gray-200 bg-gray-50 text-gray-500',
  success: 'border-green-200 bg-green-50 text-green-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  brand: 'border-fonti-accent bg-fonti-accent-hover text-fonti-primary',
}

interface StatusBadgeProps {
  variant?: StatusBadgeVariant
  children: ReactNode
  className?: string
}

export function StatusBadge({ variant = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        variantClass[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
