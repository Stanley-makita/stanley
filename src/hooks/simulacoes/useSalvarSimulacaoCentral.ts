'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'

export function useSalvarSimulacaoCentral() {
  const qc = useQueryClient()
  const { data: usuario } = useUsuarioAtual()

  return useMutation({
    mutationFn: async (resultado: ResultadoCompleto) => {
      if (!usuario?.empresa_id) throw new Error('Usuário não autenticado')

      const melhor = resultado.bancos.find((b) => b.elegivel)

      const { data, error } = await supabase
        .from('simulacoes_central')
        .insert({
          empresa_id:    usuario.empresa_id,
          tipo:          'financiamento',
          status:        'concluida',
          nome_cliente:  resultado.input.nomeCliente ?? null,
          cpf_cliente:   resultado.input.cpfCliente ?? null,
          banco:         melhor?.bancoNome ?? null,
          responsavel_id: usuario.id,
          resultado_json: resultado as unknown as Record<string, unknown>,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['simulacoes-central'] })
    },
  })
}
