import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EntityListItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  avatar?: ReactNode
  heading: ReactNode
  meta?: ReactNode
  details?: ReactNode
  trailing?: ReactNode
}

export function EntityListItem({
  avatar,
  heading,
  meta,
  details,
  trailing,
  className,
  ...props
}: EntityListItemProps) {
  return (
    <button
      type="button"
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-2 text-left transition-all hover:border-[#253B29]/30 hover:shadow-sm',
        className
      )}
      {...props}
    >
      {avatar && <div className="shrink-0">{avatar}</div>}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-gray-900">{heading}</span>
          {meta}
        </div>
        {details && (
          <div className="mt-0.5 flex min-w-0 items-center gap-3">
            {details}
          </div>
        )}
      </div>

      {trailing && <div className="shrink-0">{trailing}</div>}
    </button>
  )
}
