import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { TarefaAgenda } from '@/types/agenda'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'

export function useAgendaTarefas(mes: Date, responsavelId?: string) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  const dataInicio = format(startOfMonth(addMonths(mes, -1)), 'yyyy-MM-dd')
  const dataFim    = format(endOfMonth(addMonths(mes, 1)), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['agenda-tarefas', usuario?.empresa_id, dataInicio, dataFim, responsavelId],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<TarefaAgenda[]> => {
      let ptQuery = supabase
        .from('processo_tarefas')
        .select(`
          id, titulo, prioridade, concluida, concluida_em,
          data_prazo, vencimento, data_vencimento,
          responsavel_id, criado_por,
          processo:processos!processo_id (
            id, nome_imovel, numero_processo,
            compradores:processo_compradores(nome, principal)
          ),
          responsavel:usuarios!responsavel_id (nome)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .or(`data_prazo.is.null,and(data_prazo.gte.${dataInicio},data_prazo.lte.${dataFim})`)

      if (responsavelId) {
        ptQuery = ptQuery.or(`responsavel_id.eq.${responsavelId},criado_por.eq.${responsavelId}`)
      }

      let ltQuery = supabase
        .from('lead_tarefas')
        .select(`
          id, titulo, prioridade, concluida, concluida_em, data_prazo,
          lead_id, responsavel_id, criado_por,
          lead:leads!lead_id (id, nome),
          responsavel:usuarios!responsavel_id (nome)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .or(`data_prazo.is.null,and(data_prazo.gte.${dataInicio},data_prazo.lte.${dataFim})`)

      if (responsavelId) {
        ltQuery = ltQuery.or(`responsavel_id.eq.${responsavelId},criado_por.eq.${responsavelId}`)
      }

      let cpQuery = supabase
        .from('compromissos')
        .select('id, titulo, descricao, local, data, hora_inicio, hora_fim, concluido, concluido_em, usuario_id, criado_por, usuario:usuarios!usuario_id(nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .gte('data', dataInicio)
        .lte('data', dataFim)

      if (responsavelId) {
        cpQuery = cpQuery.or(`usuario_id.eq.${responsavelId},criado_por.eq.${responsavelId}`)
      }

      const [{ data: pt, error: ptErr }, { data: lt, error: ltErr }, { data: cp, error: cpErr }] =
        await Promise.all([ptQuery, ltQuery, cpQuery])

      if (ptErr) throw ptErr
      if (ltErr) throw ltErr
      if (cpErr) throw cpErr

      const processoTarefas: TarefaAgenda[] = (pt ?? []).map((t: any) => {
        const p = t.processo
        const nomeComprador =
          p?.compradores?.find((c: any) => c.principal)?.nome ??
          p?.compradores?.[0]?.nome ??
          p?.nome_imovel ?? ''
        return {
          tarefa_id:            t.id,
          tarefa_titulo:        t.titulo,
          tarefa_vencimento:    t.data_prazo ?? t.vencimento ?? t.data_vencimento ?? null,
          tarefa_prioridade:    t.prioridade,
          concluida:            t.concluida,
          concluida_em:         t.concluida_em,
          processo_id:          p?.id ?? null,
          processo_nome_imovel: nomeComprador,
          processo_numero:      p?.numero_processo ?? '',
          responsavel_id:       t.responsavel_id ?? t.criado_por,
          responsavel_nome:     t.responsavel?.nome ?? 'Sem responsável',
          fonte:                'processo',
          lead_id:              null,
        }
      })

      const leadTarefas: TarefaAgenda[] = (lt ?? []).map((t: any) => ({
        tarefa_id:            t.id,
        tarefa_titulo:        t.titulo,
        tarefa_vencimento:    t.data_prazo ?? null,
        tarefa_prioridade:    t.prioridade,
        concluida:            t.concluida,
        concluida_em:         t.concluida_em,
        processo_id:          null,
        processo_nome_imovel: t.lead?.nome ?? 'Lead',
        processo_numero:      'Lead',
        responsavel_id:       t.responsavel_id ?? t.criado_por,
        responsavel_nome:     t.responsavel?.nome ?? 'Sem responsável',
        fonte:                'lead',
        lead_id:              t.lead_id,
      }))

      const compromissos: TarefaAgenda[] = (cp ?? []).map((c: any) => ({
        tarefa_id:              c.id,
        tarefa_titulo:          c.titulo,
        tarefa_vencimento:      c.data,
        tarefa_prioridade:      'media',
        concluida:              c.concluido,
        concluida_em:           c.concluido_em,
        processo_id:            null,
        processo_nome_imovel:   '',
        processo_numero:        '',
        responsavel_id:         c.usuario_id,
        responsavel_nome:       c.usuario?.nome ?? 'Sem responsável',
        fonte:                  'compromisso' as const,
        lead_id:                null,
        compromisso_local:      c.local,
        compromisso_descricao:  c.descricao,
        compromisso_hora_inicio: c.hora_inicio,
        compromisso_hora_fim:    c.hora_fim,
      }))

      return [...processoTarefas, ...leadTarefas, ...compromissos].sort((a, b) => {
        if (!a.tarefa_vencimento) return 1
        if (!b.tarefa_vencimento) return -1
        return a.tarefa_vencimento.localeCompare(b.tarefa_vencimento)
      })
    },
  })
}
