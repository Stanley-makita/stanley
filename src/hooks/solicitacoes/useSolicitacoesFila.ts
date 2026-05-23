'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { SolicitacaoOperacional, StatusSolicitacao, TipoSolicitacao, PrioridadeSolicitacao } from '@/types/solicitacoes-operacionais'

interface FiltrosFila {
  tipo?: TipoSolicitacao
  status?: StatusSolicitacao
  prioridade?: PrioridadeSolicitacao
  todasDaEmpresa?: boolean  // gestores podem ver todas, não só as suas
}

const JOINS = `
  *,
  responsavel:usuarios!responsavel_id(id, nome),
  solicitante:usuarios!solicitante_id(id, nome),
  lead:leads!lead_id(id, nome),
  processo:processos!processo_id(id, nome_imovel, numero_processo),
  pessoa:pessoas!pessoa_id(id, nome)
`

export function useSolicitacoesFila(filtros: FiltrosFila = {}) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['solicitacoes', 'fila', usuario?.id, usuario?.empresa_id, filtros],
    queryFn: async (): Promise<SolicitacaoOperacional[]> => {
      let query = supabase
        .from('solicitacoes_operacionais')
        .select(JOINS)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .not('status', 'in', '("concluido","cancelado")')

      if (!filtros.todasDaEmpresa) {
        query = query.eq('responsavel_id', usuario!.id)
      }

      if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
      if (filtros.status) query = query.eq('status', filtros.status)
      if (filtros.prioridade) query = query.eq('prioridade', filtros.prioridade)

      // Ordena: prioridade (urgente→baixa) via CASE não suportado diretamente — ordena no cliente
      query = query.order('sla_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      const { data, error } = await query
      if (error) throw error

      // Reordena no cliente por prioridade (.slice() evita mutar o array em cache)
      const ordem: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }
      return (data as unknown as SolicitacaoOperacional[]).slice().sort((a, b) =>
        (ordem[a.prioridade] ?? 9) - (ordem[b.prioridade] ?? 9)
      )
    },
    staleTime: 1000 * 30, // 30s — fila precisa ser relativamente fresca
    enabled: !!usuario,
  })
}
