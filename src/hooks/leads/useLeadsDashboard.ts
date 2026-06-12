'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import { format, isToday, isBefore, parseISO } from 'date-fns'
import type { Lead } from '@/types/leads'

export type PrioridadeFila = 'urgente' | 'alta' | 'normal' | 'baixa'

export interface ContagemsLeadsDashboard {
  minhasPendencias: number
  minhasPendenciasVencidas: number
  totalLeadsAtivos: number
  totalLeadsConvertidos: number
  leadsNovos: number
  creditoAprovados: number
  creditoNaoAprovados: number
  leadsInativos: number
}

export interface FilaItem {
  id: string
  tipo: 'solicitacao' | 'tarefa'
  tipoLabel: string
  tipoCss: string
  leadId: string
  leadNome: string
  titulo: string
  prioridade: PrioridadeFila
  prazo: string | null
  vencido: boolean
  venceHoje: boolean
  createdAt: string
}

const TIPO_SOL_LABEL: Record<string, string> = {
  simulacao: 'Simulação',
  analise_credito: 'Análise',
  reanalise: 'Reanálise',
  engenharia: 'Engenharia',
  custas: 'Custas',
  documentos: 'Documentos',
  formalizacao: 'Formalização',
  registro: 'Registro',
  pendencia: 'Pendência',
  atendimento_cliente: 'Atend. cliente',
  outros: 'Outros',
}

const TIPO_SOL_CSS: Record<string, string> = {
  simulacao: 'bg-blue-100 text-blue-700',
  analise_credito: 'bg-purple-100 text-purple-700',
  reanalise: 'bg-indigo-100 text-indigo-700',
  documentos: 'bg-amber-100 text-amber-700',
  pendencia: 'bg-orange-100 text-orange-700',
  atendimento_cliente: 'bg-teal-100 text-teal-700',
  formalizacao: 'bg-cyan-100 text-cyan-700',
  engenharia: 'bg-emerald-100 text-emerald-700',
}

function normalizarPrioridade(p: string | null | undefined): PrioridadeFila {
  if (p === 'media') return 'normal'
  if (p === 'urgente' || p === 'alta' || p === 'normal' || p === 'baixa') return p
  return 'normal'
}

// Helpers compartilhados entre hooks
async function fetchIdsComTarefaFutura(supabase: ReturnType<typeof createClient>, eid: string, hoje: string) {
  const { data } = await supabase
    .from('lead_tarefas')
    .select('lead_id')
    .eq('empresa_id', eid)
    .eq('concluida', false)
    .gte('data_prazo', hoje)
    .is('deleted_at', null)
  return new Set((data ?? []).map(t => t.lead_id).filter(Boolean) as string[])
}

export function useLeadsDashboardContagens() {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['leads', 'dashboard', 'contagens', usuario?.empresa_id, usuario?.id],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 3,
    queryFn: async (): Promise<ContagemsLeadsDashboard> => {
      const hoje = format(new Date(), 'yyyy-MM-dd')
      const agora = new Date().toISOString()
      const seteAtras = new Date()
      seteAtras.setDate(seteAtras.getDate() - 7)
      const seteAtrasStr = seteAtras.toISOString()

      const uid = usuario!.id
      const eid = usuario!.empresa_id

      // Fase "Novo" desta empresa (módulo leads)
      const { data: fasesNovo } = await supabase
        .from('fases')
        .select('id')
        .eq('empresa_id', eid)
        .eq('modulo', 'leads')
        .ilike('nome', 'novo')
      const faseNovo = fasesNovo?.[0] ?? null

      // Lead IDs com tarefa futura (excluir dos inativos)
      const idsComTarefaFutura = await fetchIdsComTarefaFutura(supabase, eid, hoje)

      const [
        minhasSolAbertas,
        minhasTarefasAbertas,
        minhasSolVencidas,
        minhasTarefasVencidas,
        totalAtivos,
        totalConvertidos,
        leadsNovosRes,
        leadsCredito,
        leadsInativosRes,
      ] = await Promise.all([
        supabase.from('solicitacoes_operacionais')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).eq('responsavel_id', uid)
          .not('status', 'in', '("concluido","cancelado")')
          .not('lead_id', 'is', null).is('deleted_at', null),

        supabase.from('lead_tarefas')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).eq('responsavel_id', uid)
          .eq('concluida', false).is('deleted_at', null),

        supabase.from('solicitacoes_operacionais')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).eq('responsavel_id', uid)
          .not('status', 'in', '("concluido","cancelado")')
          .not('lead_id', 'is', null).is('deleted_at', null)
          .not('sla_at', 'is', null).lt('sla_at', agora),

        supabase.from('lead_tarefas')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).eq('responsavel_id', uid)
          .eq('concluida', false).is('deleted_at', null)
          .not('data_prazo', 'is', null).lt('data_prazo', hoje),

        supabase.from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).is('deleted_at', null).is('convertido_em', null),

        supabase.from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).is('deleted_at', null).not('convertido_em', 'is', null),

        faseNovo?.id
          ? supabase.from('leads')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', eid).eq('fase_id', faseNovo.id)
              .is('deleted_at', null).is('convertido_em', null)
          : Promise.resolve({ count: 0, data: null, error: null }),

        supabase.from('leads')
          .select('id, status:fase_statuses!status_id(nome)')
          .eq('empresa_id', eid).is('deleted_at', null)
          .not('status_id', 'is', null),

        // Busca IDs dos inativos para cruzar com tarefa futura
        supabase.from('leads')
          .select('id')
          .eq('empresa_id', eid).is('deleted_at', null).is('convertido_em', null)
          .or(`ultimo_contato.lt.${seteAtrasStr},and(ultimo_contato.is.null,created_at.lt.${seteAtrasStr})`),
      ])

      const creditoData = (leadsCredito.data ?? []) as unknown as Array<{ id: string; status: { nome: string } | { nome: string }[] | null }>
      const inativosIds = (leadsInativosRes.data ?? []).map(r => r.id)
      const inativosReais = inativosIds.filter(id => !idsComTarefaFutura.has(id)).length

      const nomeAprov = (nome: string | undefined) => !!nome?.toLowerCase().includes('aprov')
      const nomeNaoAprov = (nome: string | undefined) => {
        const n = nome?.toLowerCase() ?? ''
        return ['condicion', 'recus', 'reprov', 'não aprov', 'nao aprov'].some(k => n.includes(k))
      }

      return {
        minhasPendencias: (minhasSolAbertas.count ?? 0) + (minhasTarefasAbertas.count ?? 0),
        minhasPendenciasVencidas: (minhasSolVencidas.count ?? 0) + (minhasTarefasVencidas.count ?? 0),
        totalLeadsAtivos: totalAtivos.count ?? 0,
        totalLeadsConvertidos: totalConvertidos.count ?? 0,
        leadsNovos: leadsNovosRes.count ?? 0,
        creditoAprovados: creditoData.filter(l => nomeAprov((l.status as any)?.nome)).length,
        creditoNaoAprovados: creditoData.filter(l => nomeNaoAprov((l.status as any)?.nome)).length,
        leadsInativos: inativosReais,
      }
    },
  })
}

export function useLeadsInativos() {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['leads', 'dashboard', 'inativos', usuario?.empresa_id],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 3,
    queryFn: async (): Promise<Lead[]> => {
      const hoje = format(new Date(), 'yyyy-MM-dd')
      const eid = usuario!.empresa_id
      const seteAtras = new Date()
      seteAtras.setDate(seteAtras.getDate() - 7)
      const seteAtrasStr = seteAtras.toISOString()

      const idsComTarefaFutura = await fetchIdsComTarefaFutura(supabase, eid, hoje)

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          responsavel:usuarios!responsavel_id(id, nome),
          fase:fases!fase_id(id, nome, cor),
          status:fase_statuses!status_id(id, nome, cor)
        `)
        .eq('empresa_id', eid)
        .is('deleted_at', null)
        .is('convertido_em', null)
        .or(`ultimo_contato.lt.${seteAtrasStr},and(ultimo_contato.is.null,created_at.lt.${seteAtrasStr})`)
        .order('created_at', { ascending: false })

      if (error) throw error

      return ((data ?? []) as Lead[]).filter(l => !idsComTarefaFutura.has(l.id))
    },
  })
}

export function useFilaDeTrabalho(todasDaEmpresa: boolean) {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['leads', 'dashboard', 'fila', usuario?.id, usuario?.empresa_id, todasDaEmpresa],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<FilaItem[]> => {
      const hoje = format(new Date(), 'yyyy-MM-dd')
      const uid = usuario!.id
      const eid = usuario!.empresa_id

      const solQueryBase = supabase
        .from('solicitacoes_operacionais')
        .select('id, titulo, tipo, prioridade, sla_at, created_at, lead:leads!lead_id(id, nome)')
        .eq('empresa_id', eid)
        .not('status', 'in', '("concluido","cancelado")')
        .not('lead_id', 'is', null)
        .is('deleted_at', null)
        .limit(50)

      const tarefaQueryBase = supabase
        .from('lead_tarefas')
        .select('id, titulo, prioridade, data_prazo, created_at, lead:leads!lead_id(id, nome)')
        .eq('empresa_id', eid)
        .eq('concluida', false)
        .is('deleted_at', null)
        .limit(50)

      const [solRes, tarefaRes] = await Promise.all([
        todasDaEmpresa ? solQueryBase : solQueryBase.eq('responsavel_id', uid),
        todasDaEmpresa ? tarefaQueryBase : tarefaQueryBase.eq('responsavel_id', uid),
      ])

      const items: FilaItem[] = []

      for (const s of (solRes.data ?? []) as any[]) {
        const lead = Array.isArray(s.lead) ? s.lead[0] : s.lead
        if (!lead) continue
        const prazoStr: string | null = s.sla_at ?? null
        const prazoDate = prazoStr ? parseISO(prazoStr) : null
        const venceHoje = prazoDate ? isToday(prazoDate) : false
        const vencido = prazoDate ? isBefore(prazoDate, new Date()) && !venceHoje : false
        items.push({
          id: s.id, tipo: 'solicitacao',
          tipoLabel: TIPO_SOL_LABEL[s.tipo] ?? s.tipo,
          tipoCss: TIPO_SOL_CSS[s.tipo] ?? 'bg-gray-100 text-gray-600',
          leadId: lead.id, leadNome: lead.nome, titulo: s.titulo,
          prioridade: normalizarPrioridade(s.prioridade),
          prazo: prazoStr, vencido, venceHoje, createdAt: s.created_at,
        })
      }

      for (const t of (tarefaRes.data ?? []) as any[]) {
        const lead = Array.isArray(t.lead) ? t.lead[0] : t.lead
        if (!lead) continue
        const prazoStr: string | null = t.data_prazo ?? null
        const venceHoje = prazoStr ? prazoStr === hoje : false
        const vencido = prazoStr ? prazoStr < hoje && !venceHoje : false
        items.push({
          id: t.id, tipo: 'tarefa',
          tipoLabel: 'Tarefa', tipoCss: 'bg-gray-100 text-gray-600',
          leadId: lead.id, leadNome: lead.nome, titulo: t.titulo,
          prioridade: normalizarPrioridade(t.prioridade),
          prazo: prazoStr, vencido, venceHoje, createdAt: t.created_at,
        })
      }

      items.sort((a, b) => {
        const urgA = a.vencido ? 0 : a.venceHoje ? 1 : 2
        const urgB = b.vencido ? 0 : b.venceHoje ? 1 : 2
        if (urgA !== urgB) return urgA - urgB
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

      return items.slice(0, 60)
    },
  })
}
