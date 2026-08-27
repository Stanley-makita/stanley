'use client'

import { useContasAReceberVivo } from '@/hooks/financeiro/useContasAReceber'
import { VisaoAReceber } from '@/components/financeiro/VisaoAReceber'
import { type FinFechamento } from '@/types/financeiro'

interface Props {
  fechamento: FinFechamento | null
  mes: number
  ano: number
}

// Sempre ao vivo: cada linha usa o registro persistido quando já existe
// (de qualquer fechamento), ou um cálculo ao vivo enquanto não existe.
// Só trava edição (NF/Recebimento) quando o fechamento está 'travado' de
// fato — aprovar o fechamento não bloqueia mais o lançamento.
export function AbaAReceber({ fechamento, mes, ano }: Props) {
  const { data: contas = [], isLoading } = useContasAReceberVivo(mes, ano)
  const travado = fechamento?.status === 'travado'

  return <VisaoAReceber contas={contas} isLoading={isLoading} travado={travado} />
}
