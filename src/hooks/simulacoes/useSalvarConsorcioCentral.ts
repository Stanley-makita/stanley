'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ResultadoConsorcio } from '@/lib/simuladorConsorcio/tipos'

interface SalvarConsorcioParams {
  resultado: ResultadoConsorcio
  leadId?: string
  processoId?: string
}

export function useSalvarConsorcioCentral() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: SalvarConsorcioParams) => {
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
          tipo:           'consorcio',
          status:         'concluida',
          nome_cliente:   params.resultado.input.nomeCliente ?? null,
          cpf_cliente:    params.resultado.input.cpfCliente ?? null,
          banco:          'Itaú',
          resultado_json: params.resultado as unknown as Record<string, unknown>,
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
