'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'

const JOINS = `
  *,
  responsavel:usuarios!responsavel_id(id, nome),
  solicitante:usuarios!solicitante_id(id, nome),
  lead:leads!lead_id(id, nome),
  processo:processos!processo_id(id, nome_imovel, numero_processo),
  pessoa:pessoas!pessoa_id(id, nome)
`

function useSolicitacoesBase(
  filtro: Record<string, string>,
  queryKey: unknown[],
  enabled: boolean
) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['solicitacoes', ...queryKey, usuario?.empresa_id],
    queryFn: async (): Promise<SolicitacaoOperacional[]> => {
      let query = supabase
        .from('solicitacoes_operacionais')
        .select(JOINS)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      for (const [k, v] of Object.entries(filtro)) {
        query = query.eq(k, v)
      }

      const { data, error } = await query
      if (error) throw error
      return data as unknown as SolicitacaoOperacional[]
    },
    staleTime: 1000 * 60,
    enabled: !!usuario && enabled,
  })
}

export function useSolicitacoesPorLead(leadId: string | null | undefined) {
  return useSolicitacoesBase(
    leadId ? { lead_id: leadId } : {},
    ['lead', leadId],
    !!leadId
  )
}

export function useSolicitacoesPorProcesso(processoId: string | null | undefined) {
  return useSolicitacoesBase(
    processoId ? { processo_id: processoId } : {},
    ['processo', processoId],
    !!processoId
  )
}

export function useSolicitacoesPorConversa(conversaId: string | null | undefined) {
  return useSolicitacoesBase(
    conversaId ? { conversa_id: conversaId } : {},
    ['conversa', conversaId],
    !!conversaId
  )
}
