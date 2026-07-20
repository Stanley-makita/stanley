'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useInteressadosProcesso } from '@/hooks/processos/useInteressadosProcesso'
import { ComunicarPartesModal } from '@/components/comunicacao/ComunicarPartesModal'

interface Props {
  processoId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Wrapper fino de contexto (Processo/Negócio) sobre o núcleo genérico ComunicarPartesModal —
// mesmo padrão de AtualizarClienteLeadModal.tsx. Invalida as mesmas queries que a Fase 1
// (AtualizarClienteModal.tsx) já invalidava: 'comentarios' e 'timeline' do Processo.
export function ComunicarPartesProcessoModal({ processoId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const { data: interessados = [], isLoading } = useInteressadosProcesso(processoId, open)

  return (
    <ComunicarPartesModal
      open={open}
      onOpenChange={onOpenChange}
      interessados={interessados}
      carregandoInteressados={isLoading}
      endpointEnvio={`/api/processos/${processoId}/atualizar-cliente`}
      onEnviado={() => {
        queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'comentarios'] })
        queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'timeline'] })
      }}
    />
  )
}
