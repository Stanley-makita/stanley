'use client'

import { useProcesso } from '@/hooks/processos/useProcessos'
import { useProcessoCompradores } from '@/hooks/processos/useProcessoCompradores'
import { useAuth } from '@/hooks/auth/useAuth'
import { SimuladorCustas } from '@/components/simulador/SimuladorCustas'

interface Props {
  processoId: string
}

export function AbaCustas({ processoId }: Props) {
  const { data: processo } = useProcesso(processoId)
  const { data: compradores = [] } = useProcessoCompradores(processoId)
  const { usuario } = useAuth()

  const compradorPrincipal =
    compradores.find((c) => c.principal)?.nome ?? compradores[0]?.nome

  return (
    <SimuladorCustas
      processoId={processoId}
      numero={processo?.numero_processo}
      bancoNomeInicial={processo?.banco?.nome ?? ''}
      valorCVInicial={processo?.valor_imovel ?? 0}
      valorFinanciadoInicial={processo?.valor_financiado ?? 0}
      clienteNome={compradorPrincipal}
      responsavelNome={usuario?.nome}
    />
  )
}
