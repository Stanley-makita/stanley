import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SegmentedControlItem<T extends string> {
  value: T
  label: string
  icon: LucideIcon
  title?: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  items: SegmentedControlItem<T>[]
  onChange: (value: T) => void
  iconOnly?: boolean
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  items,
  onChange,
  iconOnly = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn('inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5', className)}>
      {items.map((item) => {
        const Icon = item.icon
        const active = item.value === value

        return (
          <button
            key={item.value}
            type="button"
            title={item.title ?? item.label}
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors',
              iconOnly ? 'w-8 px-0' : 'px-3',
              active
                ? 'bg-[#253B29] text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-50 hover:text-[#253B29]'
            )}
          >
            <Icon className={cn('shrink-0', iconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
            {!iconOnly && <span>{item.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
