import { type StatusComissao } from '@/types/financeiro'
import { Badge } from '@/components/ui/badge'

const CONFIG: Record<StatusComissao, { label: string; className: string }> = {
  a_receber: { label: 'A Receber', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  recebido:  { label: 'Recebido',  className: 'bg-green-50 text-green-700 border-green-200' },
  cancelado: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500 border-gray-200' },
}

export function StatusComissaoBadge({ status }: { status: StatusComissao }) {
  const { label, className } = CONFIG[status]
  return <Badge variant="outline" className={`text-xs font-medium ${className}`}>{label}</Badge>
}