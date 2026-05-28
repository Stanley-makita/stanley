'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import { format, addDays, subDays } from 'date-fns'
import type { TarefaAgenda } from '@/types/agenda'
import type { SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'

const FINANCIAMENTO_MODS = new Set(['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI'])

export interface NegociosContagens {
  financiamento: { certeza: number; incerteza: number }
  consorcio:     { contratados: number; negociando: number }
  contrato:      { minutaPronta: number; elaborando: number }
  registro:      { protocolados: number; preparando: number }
}

export function useNegociosDashboard() {
  const supabase = createClient()
  const { usuario } = useAuth()

  const contagens = useQuery({
    queryKey: ['negocios', 'dashboard', 'contagens', usuario?.empresa_id],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 3,
    queryFn: async (): Promise<NegociosContagens> => {
      const { data, error } = await supabase
        .from('processos')
        .select('modalidade, chance_emissao, status_processo')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .not('status_processo', 'in', '("cancelado","reprovado")')

      if (error) throw error

      const result: NegociosContagens = {
        financiamento: { certeza: 0, incerteza: 0 },
        consorcio:     { contratados: 0, negociando: 0 },
        contrato:      { minutaPronta: 0, elaborando: 0 },
        registro:      { protocolados: 0, preparando: 0 },
      }

      for (const p of data ?? []) {
        if (FINANCIAMENTO_MODS.has(p.modalidade)) {
          if (p.chance_emissao === 'certeza') result.financiamento.certeza++
          else result.financiamento.incerteza++
        } else if (p.modalidade === 'Consorcio') {
          if (p.status_processo === 'aprovado') result.consorcio.contratados++
          else result.consorcio.negociando++
        } else if (p.modalidade === 'Contrato') {
          if (p.status_processo === 'aprovado') result.contrato.minutaPronta++
          else result.contrato.elaborando++
        } else if (p.modalidade === 'Registro') {
          if (p.status_processo === 'aprovado') result.registro.protocolados++
          else result.registro.preparando++
        }
      }

      return result
    },
  })

  const hoje = new Date()
  const dataInicio = format(subDays(hoje, 30), 'yyyy-MM-dd')
  const dataFim    = format(addDays(hoje, 30), 'yyyy-MM-dd')
  const uid        = usuario?.id

  const tarefasHoje = useQuery({
    queryKey: ['negocios', 'dashboard', 'tarefas-proximas', uid],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<TarefaAgenda[]> => {
      const { data, error } = await supabase
        .from('processo_tarefas')
        .select(`
          id, titulo, prioridade, concluida, concluida_em,
          data_prazo, vencimento, data_vencimento,
          responsavel_id, criado_por,
          processo:processos!processo_id (id, nome_imovel, numero_processo)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .eq('concluida', false)
        .is('deleted_at', null)
        .or(`responsavel_id.eq.${uid},criado_por.eq.${uid}`)
        .or(`data_prazo.is.null,and(data_prazo.gte.${dataInicio},data_prazo.lte.${dataFim})`)
        .order('data_prazo', { ascending: true, nullsFirst: false })
        .limit(20)

      if (error) throw error

      return (data ?? []).map((t: any): TarefaAgenda => ({
        tarefa_id:            t.id,
        tarefa_titulo:        t.titulo,
        tarefa_vencimento:    t.data_prazo ?? t.vencimento ?? t.data_vencimento ?? null,
        tarefa_prioridade:    t.prioridade,
        concluida:            t.concluida,
        concluida_em:         t.concluida_em,
        processo_id:          t.processo?.id ?? null,
        processo_nome_imovel: t.processo?.nome_imovel ?? '',
        processo_numero:      t.processo?.numero_processo ?? '',
        responsavel_id:       t.responsavel_id ?? t.criado_por,
        responsavel_nome:     '',
        fonte:                'processo',
        lead_id:              null,
      }))
    },
  })

  const solicitacoes = useQuery({
    queryKey: ['negocios', 'dashboard', 'solicitacoes', usuario?.id],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<SolicitacaoOperacional[]> => {
      const { data, error } = await supabase
        .from('solicitacoes_operacionais')
        .select('id, titulo, tipo, prioridade, status, sla_at, created_at, solicitante:usuarios!solicitante_id(id, nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('responsavel_id', usuario!.id)
        .is('deleted_at', null)
        .not('status', 'in', '("concluido","cancelado")')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return (data ?? []) as unknown as SolicitacaoOperacional[]
    },
  })

  return { contagens, tarefasHoje, solicitacoes }
}
