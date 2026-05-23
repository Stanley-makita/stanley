import { Badge } from '@/components/ui/badge'
import { PRIORIDADE_CORES, type PrioridadeSolicitacao } from '@/types/solicitacoes-operacionais'

const LABELS: Record<PrioridadeSolicitacao, string> = {
  urgente: 'Urgente',
  alta:    'Alta',
  normal:  'Normal',
  baixa:   'Baixa',
}

export function SolicitacaoPrioridadeBadge({ prioridade }: { prioridade: PrioridadeSolicitacao }) {
  return (
    <Badge variant="outline" className={`text-xs font-medium ${PRIORIDADE_CORES[prioridade]}`}>
      {LABELS[prioridade]}
    </Badge>
  )
}
