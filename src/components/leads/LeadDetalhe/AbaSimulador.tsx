'use client'

import { useLead } from '@/hooks/leads/useLeads'
import { SimuladorCustas } from '@/components/simulador/SimuladorCustas'

interface Props { leadId: string }

export function AbaSimulador({ leadId }: Props) {
  const { data: lead } = useLead(leadId)

  return (
    <SimuladorCustas
      leadId={leadId}
      valorFinanciadoInicial={lead?.valor_pretendido ?? 0}
      clienteNome={lead?.nome}
    />
  )
}
