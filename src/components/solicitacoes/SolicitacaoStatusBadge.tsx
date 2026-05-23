import { Badge } from '@/components/ui/badge'
import { STATUS_CORES, STATUS_LABELS, type StatusSolicitacao } from '@/types/solicitacoes-operacionais'

export function SolicitacaoStatusBadge({ status }: { status: StatusSolicitacao }) {
  return (
    <Badge variant="outline" className={`text-xs ${STATUS_CORES[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
