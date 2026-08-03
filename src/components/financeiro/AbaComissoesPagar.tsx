'use client'

import { useComissoesAPagar, useComissoesAPagarPreview } from '@/hooks/financeiro/useComissoesAPagar'
import { VisaoComissoesAPagar } from '@/components/financeiro/VisaoComissoesAPagar'
import { type FinFechamento } from '@/types/financeiro'

interface Props {
  fechamento: FinFechamento | null
  mes: number
  ano: number
}

const STATUS_SNAPSHOT = ['aprovado', 'pago', 'travado']

// Antes de aprovado, mostra dado ao vivo (comercial agregado pela regra do
// RH sobre a produção mensal, operacional/parceiro por processo — direto de
// processos emitidos, sem exigir fechamento puxado). Depois de aprovado,
// mostra o snapshot gravado (editável: ajuste manual, marcar como pago).
export function AbaComissoesPagar({ fechamento, mes, ano }: Props) {
  const usarSnapshot = !!fechamento && STATUS_SNAPSHOT.includes(fechamento.status)

  const snapshot = useComissoesAPagar(usarSnapshot ? fechamento!.id : undefined)
  const preview = useComissoesAPagarPreview(mes, ano, !usarSnapshot)

  const comissoes = usarSnapshot ? (snapshot.data ?? []) : (preview.data ?? [])
  const isLoading = usarSnapshot ? snapshot.isLoading : preview.isLoading
  const travado = usarSnapshot ? fechamento!.status === 'travado' : true

  return <VisaoComissoesAPagar comissoes={comissoes} isLoading={isLoading} travado={travado} />
}
