'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'

interface SalvarFinancParams {
  resultado: ResultadoCompleto
  leadId?: string
  processoId?: string
}

export function useSalvarSimulacaoCentral() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ resultado, leadId, processoId }: SalvarFinancParams) => {
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
          empresa_id:     usuario.empresa_id,
          tipo:           'financiamento',
          status:         'concluida',
          nome_cliente:   resultado.input.nomeCliente ?? null,
          cpf_cliente:    resultado.input.cpfCliente ?? null,
          banco:          melhor?.bancoNome ?? null,
          responsavel_id: usuario.id,
          resultado_json: resultado as unknown as Record<string, unknown>,
          lead_id:        leadId ?? null,
          processo_id:    processoId ?? null,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['simulacoes-central'] })
      if (vars.leadId) {
        qc.invalidateQueries({ queryKey: ['simulacoes-lead', vars.leadId] })
      }
    },
  })
}
