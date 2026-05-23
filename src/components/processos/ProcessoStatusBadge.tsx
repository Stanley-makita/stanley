import { type StatusProcesso } from '@/types/processos'
import { Badge } from '@/components/ui/badge'

const CONFIG: Record<StatusProcesso, { label: string; className: string }> = {
  em_analise: { label: 'Em Análise', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  aprovado:   { label: 'Aprovado',   className: 'bg-green-100 text-green-700 border-green-200' },
  pendente:   { label: 'Pendente',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  reprovado:  { label: 'Reprovado',  className: 'bg-red-100 text-red-600 border-red-200' },
  cancelado:  { label: 'Cancelado',  className: 'bg-gray-100 text-gray-500 border-gray-200' },
}

export function ProcessoStatusBadge({ status }: { status: StatusProcesso }) {
  const { label, className } = CONFIG[status]
  return <Badge variant="outline" className={`text-xs font-medium ${className}`}>{label}</Badge>
}