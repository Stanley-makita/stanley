import { cn } from '@/lib/utils'

interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  count?: number
}

export function FilterChip({ active = false, count, className, children, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-[#253B29] bg-[#253B29] text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {count != null && count > 0 && (
        <span className={cn('tabular-nums', active ? 'text-white/75' : 'text-gray-400')}>
          {count}
        </span>
      )}
    </button>
  )
}
