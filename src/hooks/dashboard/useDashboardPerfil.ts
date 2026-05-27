'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import { format, startOfMonth, endOfMonth } from 'date-fns'

// ── Comercial ──────────────────────────────────────────────────────────────

export interface KpisComercial {
  meusProcessos: number
  meusLeads: number
  meusLeadsMes: number
  processosCerteza: number
  processosIncerteza: number
}

export function useDashboardKpisComercial() {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['dashboard', 'kpis-comercial', usuario?.id],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<KpisComercial> => {
      const inicioMes = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      const fimMes    = format(endOfMonth(new Date()), 'yyyy-MM-dd')

      const [processos, leadsTotal, leadsMes] = await Promise.all([
        supabase
          .from('processos')
          .select('chance_emissao')
          .eq('empresa_id', usuario!.empresa_id)
          .eq('comercial_id', usuario!.id)
          .is('deleted_at', null)
          .not('status_processo', 'in', '("cancelado","reprovado")'),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', usuario!.empresa_id)
          .eq('responsavel_id', usuario!.id)
          .is('deleted_at', null),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', usuario!.empresa_id)
          .eq('responsavel_id', usuario!.id)
          .gte('created_at', inicioMes)
          .lte('created_at', fimMes)
          .is('deleted_at', null),
      ])

      const data = processos.data ?? []
      return {
        meusProcessos:      data.length,
        processosCerteza:   data.filter((p) => p.chance_emissao === 'certeza').length,
        processosIncerteza: data.filter((p) => p.chance_emissao === 'incerteza').length,
        meusLeads:          leadsTotal.count ?? 0,
        meusLeadsMes:       leadsMes.count ?? 0,
      }
    },
  })
}

// ── Operacional ───────────────────────────────────────────────────────────

export interface KpisOperacional {
  solPendentes:    number
  solEmAndamento:  number
  solConcluidasHoje: number
  solTotal:        number
}

export function useDashboardKpisOperacional() {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['dashboard', 'kpis-operacional', usuario?.id],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<KpisOperacional> => {
      const hoje      = format(new Date(), 'yyyy-MM-dd')
      const amanha    = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')

      const { data } = await supabase
        .from('solicitacoes_operacionais')
        .select('status, concluido_em')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('responsavel_id', usuario!.id)
        .is('deleted_at', null)

      const rows = data ?? []
      return {
        solPendentes:     rows.filter((r) => r.status === 'pendente').length,
        solEmAndamento:   rows.filter((r) => r.status === 'em_andamento' || r.status === 'aguardando_resposta' || r.status === 'aguardando_cliente').length,
        solConcluidasHoje:rows.filter((r) => r.status === 'concluido' && r.concluido_em && r.concluido_em >= hoje && r.concluido_em < amanha).length,
        solTotal:         rows.filter((r) => r.status !== 'cancelado').length,
      }
    },
  })
}

// ── Jurídico ──────────────────────────────────────────────────────────────

export interface KpisJuridico {
  contratosAtivos:  number
  registrosAtivos:  number
  emAnalise:        number
  aprovados:        number
}

export function useDashboardKpisJuridico() {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['dashboard', 'kpis-juridico', usuario?.empresa_id],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<KpisJuridico> => {
      const { data } = await supabase
        .from('processos')
        .select('modalidade, status_processo')
        .eq('empresa_id', usuario!.empresa_id)
        .in('modalidade', ['Contrato', 'Registro'])
        .is('deleted_at', null)
        .not('status_processo', 'in', '("cancelado","reprovado")')

      const rows = data ?? []
      return {
        contratosAtivos: rows.filter((r) => r.modalidade === 'Contrato').length,
        registrosAtivos: rows.filter((r) => r.modalidade === 'Registro').length,
        emAnalise:       rows.filter((r) => r.status_processo === 'em_analise' || r.status_processo === 'pendente').length,
        aprovados:       rows.filter((r) => r.status_processo === 'aprovado').length,
      }
    },
  })
}
