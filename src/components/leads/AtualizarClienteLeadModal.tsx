'use client'

import { useQueryClient } from '@tanstack/react-query'
import { type Lead } from '@/types/leads'
import { useInteressadosLead } from '@/hooks/leads/useInteressadosLead'
import { ComunicarPartesModal } from '@/components/comunicacao/ComunicarPartesModal'

interface Props {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Wrapper fino de contexto (Lead) sobre o núcleo genérico ComunicarPartesModal — só resolve a
// fonte de dados (useInteressadosLead, endpoint, invalidação de query) específica do Lead.
export function AtualizarClienteLeadModal({ lead, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const { data: interessados = [], isLoading } = useInteressadosLead(lead.id, open)

  return (
    <ComunicarPartesModal
      open={open}
      onOpenChange={onOpenChange}
      interessados={interessados}
      carregandoInteressados={isLoading}
      endpointEnvio={`/api/leads/${lead.id}/atualizar-cliente`}
      onEnviado={() => queryClient.invalidateQueries({ queryKey: ['leads', lead.id, 'historico'] })}
    />
  )
}
