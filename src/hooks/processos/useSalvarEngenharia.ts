'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

interface Input {
  processoId: string
  validadeEngenharia: string
  valorEngenharia: number
}

export function useSalvarEngenharia() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ processoId, validadeEngenharia, valorEngenharia }: Input) => {
      const { error: errP } = await supabase
        .from('processos')
        .update({
          validade_engenharia: validadeEngenharia,
          valor_engenharia:    valorEngenharia,
        })
        .eq('id', processoId)
      if (errP) throw errP

      const { data: proc } = await supabase
        .from('processos')
        .select('imovel_id')
        .eq('id', processoId)
        .single()

      if (proc?.imovel_id) {
        const { error: errA } = await supabase.from('imovel_avaliacoes').insert({
          empresa_id:          usuario!.empresa_id,
          imovel_id:           proc.imovel_id,
          processo_id:         processoId,
          valor_avaliado:      valorEngenharia,
          validade_engenharia: validadeEngenharia,
        })
        if (errA) console.error('[useSalvarEngenharia] erro ao salvar avaliação do imóvel:', errA.message)

        qc.invalidateQueries({ queryKey: ['imovel-avaliacoes', proc.imovel_id] })
      }
    },
    onSuccess: (_, { processoId }) => {
      qc.invalidateQueries({ queryKey: ['processos', processoId] })
      qc.invalidateQueries({ queryKey: ['processos'] })
      toast.success('Validade atualizada com sucesso.')
    },
    onError: () => {
      toast.error('Não foi possível atualizar a validade. Tente novamente.')
    },
  })
}
