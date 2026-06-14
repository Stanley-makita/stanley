'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'

export function useSalvarSimulacaoCentral() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (resultado: ResultadoCompleto) => {
      // Obtém usuário e empresa_id em tempo real (sem depender de hook assíncrono)
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('Não autenticado')

      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('id, empresa_id')
        .eq('id', user.id)
        .maybeSingle()

      if (uErr || !usuario) throw new Error('Usuário não encontrado')

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
