'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface SalvarCustasParams {
  nomeCliente?: string
  cpfCliente?: string
  resultadoJson?: Record<string, unknown>
  leadId?: string
  processoId?: string
}

export function useSalvarCustasCentral() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: SalvarCustasParams) => {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('Não autenticado')

      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('id, empresa_id')
        .eq('id', user.id)
        .maybeSingle()

      if (uErr || !usuario) throw new Error('Usuário não encontrado')

      const { data, error } = await supabase
        .from('simulacoes_central')
        .insert({
          empresa_id:     usuario.empresa_id,
          tipo:           'custas',
          status:         'concluida',
          nome_cliente:   params.nomeCliente ?? null,
          cpf_cliente:    params.cpfCliente ?? null,
          resultado_json: params.resultadoJson ?? null,
          responsavel_id: usuario.id,
          lead_id:        params.leadId ?? null,
          processo_id:    params.processoId ?? null,
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
