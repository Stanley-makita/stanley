'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { PrioridadeSolicitacao, StatusSolicitacao, TipoSolicitacao } from '@/types/solicitacoes-operacionais'

// Solicitação como aparece nos painéis iniciais (Captação e Negócios): "Para mim" e "Que pedi".
export interface SolicitacaoPainel {
  id: string
  titulo: string
  tipo: TipoSolicitacao
  prioridade: PrioridadeSolicitacao
  status: StatusSolicitacao
  sla_at: string | null
  created_at: string
  lead_id: string | null
  processo_id: string | null
  responsavel_id: string | null
  solicitante_id: string
  lead: { id: string; nome: string } | null
  processo: { id: string; numero_processo: string | null; nome_imovel: string | null } | null
  solicitante: { id: string; nome: string } | null
  responsavel: { id: string; nome: string } | null
}

const ORDEM_PRIORIDADE: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function vencida(s: SolicitacaoPainel, agora: number): boolean {
  return !!s.sla_at && new Date(s.sla_at).getTime() < agora
}

// Vencidas primeiro, depois prioridade, depois a mais recente.
export function ordenarSolicitacoes(rows: SolicitacaoPainel[], agora = Date.now()): SolicitacaoPainel[] {
  return rows.slice().sort((a, b) => {
    const va = vencida(a, agora) ? 0 : 1
    const vb = vencida(b, agora) ? 0 : 1
    if (va !== vb) return va - vb
    const pa = ORDEM_PRIORIDADE[a.prioridade] ?? 9
    const pb = ORDEM_PRIORIDADE[b.prioridade] ?? 9
    if (pa !== pb) return pa - pb
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

// "Para mim" = eu sou o responsável (inclui a que pedi pra mim mesmo).
// "Que pedi" = eu pedi e OUTRA pessoa atende — a que pedi pra mim mesmo não entra aqui,
// pra não aparecer duas vezes.
export function classificarSolicitacoes(rows: SolicitacaoPainel[], usuarioId: string, agora = Date.now()) {
  return {
    paraMim: ordenarSolicitacoes(rows.filter((r) => r.responsavel_id === usuarioId), agora),
    quePedi: ordenarSolicitacoes(rows.filter((r) => r.solicitante_id === usuarioId && r.responsavel_id !== usuarioId), agora),
  }
}

const SELECT = `
  id, titulo, tipo, prioridade, status, sla_at, created_at, lead_id, processo_id, responsavel_id, solicitante_id,
  lead:leads!lead_id(id, nome),
  processo:processos!processo_id(id, numero_processo, nome_imovel),
  solicitante:usuarios!solicitante_id(id, nome),
  responsavel:usuarios!responsavel_id(id, nome)
`

// Tudo que é meu (recebi OU pedi), abertas, em qualquer lugar do sistema — lead, negócio ou
// sem vínculo. `todasDaEmpresa` (visão Equipe, só gestores) traz a empresa inteira.
export function useMinhasSolicitacoes(todasDaEmpresa = false) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const empresaId = usuario?.empresa_id

  // Tempo real: o painel não pode ficar com dado velho (antes só atualizava a cada 2-3 min).
  // Invalida também os contadores dos painéis que dependem das mesmas solicitações.
  useEffect(() => {
    if (!empresaId) return
    const channel = supabase
      .channel(`solicitacoes-painel-${empresaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_operacionais', filter: `empresa_id=eq.${empresaId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['solicitacoes'] })
          qc.invalidateQueries({ queryKey: ['leads', 'dashboard'] })
          qc.invalidateQueries({ queryKey: ['negocios', 'dashboard'] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [empresaId, qc])

  const query = useQuery({
    queryKey: ['solicitacoes', 'painel', usuario?.id, empresaId, todasDaEmpresa],
    enabled: !!usuario,
    queryFn: async (): Promise<SolicitacaoPainel[]> => {
      let q = supabase
        .from('solicitacoes_operacionais')
        .select(SELECT)
        .eq('empresa_id', empresaId!)
        .is('deleted_at', null)
        .not('status', 'in', '("concluido","cancelado")')

      if (!todasDaEmpresa) {
        q = q.or(`responsavel_id.eq.${usuario!.id},solicitante_id.eq.${usuario!.id}`)
      }

      const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
      if (error) throw error

      return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        ...(r as unknown as SolicitacaoPainel),
        lead: um(r.lead as SolicitacaoPainel['lead'] | SolicitacaoPainel['lead'][]),
        processo: um(r.processo as SolicitacaoPainel['processo'] | SolicitacaoPainel['processo'][]),
        solicitante: um(r.solicitante as SolicitacaoPainel['solicitante'] | SolicitacaoPainel['solicitante'][]),
        responsavel: um(r.responsavel as SolicitacaoPainel['responsavel'] | SolicitacaoPainel['responsavel'][]),
      }))
    },
  })

  const todas = query.data ?? []
  const { paraMim, quePedi } = usuario ? classificarSolicitacoes(todas, usuario.id) : { paraMim: [], quePedi: [] }

  return {
    isLoading: query.isLoading,
    todas: ordenarSolicitacoes(todas),
    paraMim,
    quePedi,
  }
}
