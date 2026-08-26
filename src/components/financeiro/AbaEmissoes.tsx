'use client'

import { useFechamentoProcessos, useEmissoesPreview } from '@/hooks/financeiro/useFechamentoProcessos'
import { VisaoEmissoes } from '@/components/financeiro/VisaoEmissoes'
import { type FinFechamento } from '@/types/financeiro'

interface Props {
  fechamento: FinFechamento | null
  mes: number
  ano: number
}

const STATUS_SNAPSHOT = ['aprovado', 'pago', 'travado']

// Antes de aprovado, mostra dado ao vivo (direto de processos emitidos no
// mês navegado, sem exigir fechamento aberto). Depois de aprovado, mostra o
// snapshot gravado por puxar_processos_emitidos/puxar_contratos — o mesmo
// registro histórico que gerar_comissoes_a_pagar usou pra calcular comissão
// daquele mês (ver AbaAReceber, mesmo padrão).
export function AbaEmissoes({ fechamento, mes, ano }: Props) {
  const usarSnapshot = !!fechamento && STATUS_SNAPSHOT.includes(fechamento.status)

  const snapshot = useFechamentoProcessos(usarSnapshot ? fechamento!.id : undefined)
  const preview = useEmissoesPreview(mes, ano, !usarSnapshot)

  const processos = usarSnapshot ? (snapshot.data ?? []) : (preview.data ?? [])
  const isLoading = usarSnapshot ? snapshot.isLoading : preview.isLoading

  return <VisaoEmissoes processos={processos} isLoading={isLoading} vazioAoVivo={!usarSnapshot} />
}
