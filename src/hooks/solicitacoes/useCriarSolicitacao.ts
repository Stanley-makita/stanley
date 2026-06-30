'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { TipoSolicitacao, PrioridadeSolicitacao } from '@/types/solicitacoes-operacionais'

interface CriarSolicitacaoParams {
  tipo: TipoSolicitacao
  titulo: string
  descricao?: string
  prioridade?: PrioridadeSolicitacao
  responsavel_id?: string
  lead_id?: string | null
  processo_id?: string | null
  pessoa_id?: string | null
  conversa_id?: string | null
}

export function useCriarSolicitacao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: CriarSolicitacaoParams): Promise<string> => {
      const { data, error } = await supabase.rpc('criar_solicitacao_operacional', {
        p_tipo:           params.tipo,
        p_titulo:         params.titulo,
        p_descricao:      params.descricao ?? null,
        p_prioridade:     params.prioridade ?? 'normal',
        p_responsavel_id: params.responsavel_id ?? null,
        p_lead_id:        params.lead_id ?? null,
        p_processo_id:    params.processo_id ?? null,
        p_pessoa_id:      params.pessoa_id ?? null,
        p_conversa_id:    params.conversa_id ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      toast.success('Solicitação criada.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
  })
}
