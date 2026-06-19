'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

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
      // Salva validade + valor no processo
      const { error: errP } = await supabase
        .from('processos')
        .update({
          validade_engenharia: validadeEngenharia,
          valor_engenharia:    valorEngenharia,
        })
        .eq('id', processoId)
      if (errP) throw errP

      // Busca imovel_id vinculado ao processo
      const { data: proc } = await supabase
        .from('processos')
        .select('imovel_id')
        .eq('id', processoId)
        .single()

      // Se tem imóvel vinculado, registra no histórico de avaliações
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
      qc.invalidateQueries({ queryKey: ['processo', processoId] })
    },
  })
}
