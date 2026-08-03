'use client'

import { useContasAReceber, useContasAReceberPreview } from '@/hooks/financeiro/useContasAReceber'
import { VisaoAReceber } from '@/components/financeiro/VisaoAReceber'
import { type FinFechamento } from '@/types/financeiro'

interface Props {
  fechamento: FinFechamento | null
  mes: number
  ano: number
}

const STATUS_SNAPSHOT = ['aprovado', 'pago', 'travado']

// Antes de aprovado, mostra dado ao vivo (direto de processos emitidos, sem
// exigir fechamento puxado). Depois de aprovado, mostra o snapshot gravado
// (registro histórico, com NF/recebimento rastreados).
export function AbaAReceber({ fechamento, mes, ano }: Props) {
  const usarSnapshot = !!fechamento && STATUS_SNAPSHOT.includes(fechamento.status)

  const snapshot = useContasAReceber(usarSnapshot ? fechamento!.id : undefined)
  const preview = useContasAReceberPreview(mes, ano, !usarSnapshot)

  const contas = usarSnapshot ? (snapshot.data ?? []) : (preview.data ?? [])
  const isLoading = usarSnapshot ? snapshot.isLoading : preview.isLoading
  const travado = usarSnapshot ? fechamento!.status === 'travado' : true

  return <VisaoAReceber contas={contas} isLoading={isLoading} travado={travado} />
}
