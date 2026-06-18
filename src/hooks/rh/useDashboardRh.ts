'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { getMonth, getYear, parseISO, addDays } from 'date-fns'

export interface DashboardRhData {
  totalFuncionarios: number
  emFerias: number
  afastados: number
  presentesHoje: number
  atrasados: number
  aniversariantesMes: number
  aniversarioEmpresaMes: number
  proximasFerias: number
}

export function useDashboardRh() {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'dashboard', usuario?.empresa_id],
    enabled: !!usuario,
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardRhData> => {
      const eid = usuario!.empresa_id
      const hoje = new Date()
      const mesAtual = getMonth(hoje) + 1
      const anoAtual = getYear(hoje)
      const dataHoje = hoje.toISOString().split('T')[0]
      const dataLimite = addDays(hoje, 30).toISOString().split('T')[0]

      const [
        funcRes,
        pontoRes,
        feriasRes,
        anivRes,
      ] = await Promise.all([
        supabase.from('rh_funcionarios').select('id, status, data_nascimento, data_admissao').eq('empresa_id', eid),
        supabase.from('rh_ponto').select('id, entrada, funcionario_id').eq('empresa_id', eid).eq('data', dataHoje),
        supabase.from('rh_ferias').select('id, status, ferias_inicio, ferias_fim').eq('empresa_id', eid).in('status', ['agendado','em_andamento']),
        supabase.from('rh_funcionarios').select('id').eq('empresa_id', eid).eq('status', 'ativo'),
      ])

      const funcionarios = funcRes.data ?? []
      const pontoHoje = pontoRes.data ?? []
      const feriasAtivas = feriasRes.data ?? []

      const totalFuncionarios = funcionarios.filter(f => f.status !== 'inativo').length
      const emFerias = funcionarios.filter(f => f.status === 'ferias').length
      const afastados = funcionarios.filter(f => f.status === 'afastado').length

      const presentesHoje = pontoHoje.filter(p => p.entrada).length

      const HORA_LIMITE = '08:15'
      const atrasados = pontoHoje.filter(p => p.entrada && p.entrada > HORA_LIMITE).length

      const aniversariantesMes = funcionarios.filter(f => {
        if (!f.data_nascimento) return false
        const d = parseISO(f.data_nascimento)
        return getMonth(d) + 1 === mesAtual
      }).length

      const aniversarioEmpresaMes = funcionarios.filter(f => {
        if (!f.data_admissao) return false
        const d = parseISO(f.data_admissao)
        return getMonth(d) + 1 === mesAtual && getYear(d) < anoAtual
      }).length

      const proximasFerias = feriasAtivas.filter(f => {
        if (!f.ferias_inicio) return false
        return f.ferias_inicio >= dataHoje && f.ferias_inicio <= dataLimite
      }).length

      return {
        totalFuncionarios,
        emFerias,
        afastados,
        presentesHoje,
        atrasados,
        aniversariantesMes,
        aniversarioEmpresaMes,
        proximasFerias,
      }
    },
  })
}
