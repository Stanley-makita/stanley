import { type ChanceEmissao } from '@/types/processos'
import { Badge } from '@/components/ui/badge'

export function ChanceBadge({ chance }: { chance: ChanceEmissao }) {
  return (
    <Badge
      variant="outline"
      className={
        chance === 'certeza'
          ? 'bg-green-50 text-green-700 border-green-200 text-xs'
          : 'bg-amber-50 text-amber-700 border-amber-200 text-xs'
      }
    >
      {chance === 'certeza' ? 'Certeza' : 'Incerteza'}
    </Badge>
  )
}