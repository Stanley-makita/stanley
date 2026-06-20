'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface DadosConsorcio {
  administradora?: string | null
  grupo_consorcio?: string | null
  cota_consorcio?: string | null
  valor_carta?: number | null
  parcela_consorcio?: number | null
  prazo_meses?: number | null
  credito_desejado?: number | null
  carta_sugerida?: number | null
  justificativa_carta?: string | null
}

export function useEditarConsorcio() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ processoId, dados }: { processoId: string; dados: DadosConsorcio }) => {
      const { error } = await supabase
        .from('processos')
        .update(dados)
        .eq('id', processoId)
      if (error) throw error
    },
    onSuccess: (_data, { processoId }) => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      toast.success('Consórcio atualizado.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: () => toast.error('Erro ao salvar consórcio.'),
  })
}
