'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TipoSolicitacao, PrioridadeSolicitacao } from '@/types/solicitacoes-operacionais'
import { avancarFaseLead } from '@/lib/leads/avancarFaseLead'

// Tipos que NÃO disparam avanço para "Atendimento" (apenas regra 1 se estiver em "Novo")
const TIPOS_SEM_AVANCO: TipoSolicitacao[] = [
  'custas', 'documentos', 'analise_credito', 'engenharia', 'formalizacao', 'registro',
]

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
    onSuccess: async (_, params) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })

      if (!params.lead_id) return

      let faseDestino: string | null = null

      if (params.tipo === 'simulacao') {
        faseDestino = 'Simulação'
      } else if (!TIPOS_SEM_AVANCO.includes(params.tipo)) {
        faseDestino = 'Prospecção'
      }

      if (faseDestino) {
        await avancarFaseLead(supabase, qc, params.lead_id, faseDestino)
      }
    },
  })
}
