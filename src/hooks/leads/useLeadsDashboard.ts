'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import { format, isToday, isBefore, parseISO } from 'date-fns'

export type PrioridadeFila = 'urgente' | 'alta' | 'normal' | 'baixa'

export interface ContagemsLeadsDashboard {
  minhasPendencias: number
  minhasPendenciasVencidas: number
  leadsAguardandoAcao: number
  docsAguardandoConferencia: number
  docsAguardandoExtracao: number
  creditoEmAnalise: number
  creditoPreAprovado: number
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

      const [
        minhasSolAbertas,
        minhasTarefasAbertas,
        minhasSolVencidas,
        minhasTarefasVencidas,
        todasSolLeadIds,
        tarefasVencidasLeadIds,
        docsOcrLeadIds,
        docsConferencia,
        docsExtracao,
        leadsCredito,
        leadsInativos,
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

        // lead_ids de solicitações abertas (para contar distintos)
        supabase.from('solicitacoes_operacionais')
          .select('lead_id')
          .eq('empresa_id', eid)
          .not('status', 'in', '("concluido","cancelado")')
          .not('lead_id', 'is', null).is('deleted_at', null),

        // lead_ids de tarefas vencidas
        supabase.from('lead_tarefas')
          .select('lead_id')
          .eq('empresa_id', eid).eq('concluida', false)
          .not('data_prazo', 'is', null).lt('data_prazo', hoje).is('deleted_at', null),

        // lead_ids de docs com OCR concluído (aguardando revisão)
        supabase.from('documentos_clientes')
          .select('lead_id')
          .eq('empresa_id', eid).eq('ocr_status', 'concluido')
          .not('lead_id', 'is', null).is('deleted_at', null),

        supabase.from('documentos_clientes')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).eq('ocr_status', 'concluido')
          .not('lead_id', 'is', null).is('deleted_at', null),

        supabase.from('documentos_clientes')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).in('ocr_status', ['pendente', 'processando'])
          .not('lead_id', 'is', null).is('deleted_at', null),

        supabase.from('leads')
          .select('status_analise')
          .eq('empresa_id', eid).is('deleted_at', null)
          .in('status_analise', ['em_analise_credito', 'pre_aprovado']),

        supabase.from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).is('deleted_at', null).is('convertido_em', null)
          .or(`ultimo_contato.lt.${seteAtrasStr},and(ultimo_contato.is.null,created_at.lt.${seteAtrasStr})`),
      ])

      // Leads aguardando ação = leads distintos com qualquer pendência
      const leadIdsAguardando = new Set<string>()
      ;(todasSolLeadIds.data ?? []).forEach(r => { if (r.lead_id) leadIdsAguardando.add(r.lead_id) })
      ;(tarefasVencidasLeadIds.data ?? []).forEach(r => { if (r.lead_id) leadIdsAguardando.add(r.lead_id) })
      ;(docsOcrLeadIds.data ?? []).forEach(r => { if (r.lead_id) leadIdsAguardando.add(r.lead_id) })

      const creditoData = leadsCredito.data ?? []

      return {
        minhasPendencias: (minhasSolAbertas.count ?? 0) + (minhasTarefasAbertas.count ?? 0),
        minhasPendenciasVencidas: (minhasSolVencidas.count ?? 0) + (minhasTarefasVencidas.count ?? 0),
        leadsAguardandoAcao: leadIdsAguardando.size,
        docsAguardandoConferencia: docsConferencia.count ?? 0,
        docsAguardandoExtracao: docsExtracao.count ?? 0,
        creditoEmAnalise: creditoData.filter(l => l.status_analise === 'em_analise_credito').length,
        creditoPreAprovado: creditoData.filter(l => l.status_analise === 'pre_aprovado').length,
        leadsInativos: leadsInativos.count ?? 0,
      }
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
        todasDaEmpresa
          ? solQueryBase
          : solQueryBase.eq('responsavel_id', uid),
        todasDaEmpresa
          ? tarefaQueryBase
          : tarefaQueryBase.eq('responsavel_id', uid),
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
          id: s.id,
          tipo: 'solicitacao',
          tipoLabel: TIPO_SOL_LABEL[s.tipo] ?? s.tipo,
          tipoCss: TIPO_SOL_CSS[s.tipo] ?? 'bg-gray-100 text-gray-600',
          leadId: lead.id,
          leadNome: lead.nome,
          titulo: s.titulo,
          prioridade: normalizarPrioridade(s.prioridade),
          prazo: prazoStr,
          vencido,
          venceHoje,
          createdAt: s.created_at,
        })
      }

      for (const t of (tarefaRes.data ?? []) as any[]) {
        const lead = Array.isArray(t.lead) ? t.lead[0] : t.lead
        if (!lead) continue
        const prazoStr: string | null = t.data_prazo ?? null
        const venceHoje = prazoStr ? prazoStr === hoje : false
        const vencido = prazoStr ? prazoStr < hoje && !venceHoje : false
        items.push({
          id: t.id,
          tipo: 'tarefa',
          tipoLabel: 'Tarefa',
          tipoCss: 'bg-gray-100 text-gray-600',
          leadId: lead.id,
          leadNome: lead.nome,
          titulo: t.titulo,
          prioridade: normalizarPrioridade(t.prioridade),
          prazo: prazoStr,
          vencido,
          venceHoje,
          createdAt: t.created_at,
        })
      }

      // Ordenar: vencidos → hoje → pendentes; dentro de cada grupo, mais antigos primeiro
      items.sort((a, b) => {
        const urgA = a.vencido ? 0 : a.venceHoje ? 1 : 2
        const urgB = b.vencido ? 0 : b.venceHoje ? 1 : 2
        if (urgA !== urgB) return urgA - urgB
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

      return items.slice(0, 30)
    },
  })
}
