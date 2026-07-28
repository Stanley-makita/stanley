'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

const JANELA_DIAS = 30

function diasUteisNoIntervalo(inicio: Date, fim: Date): number {
  let count = 0
  const d = new Date(inicio)
  d.setHours(0, 0, 0, 0)
  const limite = new Date(fim)
  limite.setHours(0, 0, 0, 0)
  while (d <= limite) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

// Assiduidade dos últimos 30 dias (ou desde a admissão, se mais recente):
// % de dias úteis sem falta injustificada registrada em rh_ausencias.
// Não usa rh_ponto (registro diário de entrada/saída) — hoje ele só é
// consultável dia a dia, sem histórico por período/funcionário.
export function useAssiduidadeFuncionario(funcionarioId: string, dataAdmissao: string) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'assiduidade', funcionarioId],
    enabled: !!usuario && !!funcionarioId,
    queryFn: async () => {
      const hoje = new Date()
      const admissao = new Date(`${dataAdmissao}T00:00:00`)
      const inicioJanela = new Date(hoje)
      inicioJanela.setDate(inicioJanela.getDate() - JANELA_DIAS)
      const inicio = admissao > inicioJanela ? admissao : inicioJanela

      const { data, error } = await supabase
        .from('rh_ausencias')
        .select('data_inicio, data_fim, tipo')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('funcionario_id', funcionarioId)
        .eq('tipo', 'falta_injustificada')
        .lte('data_inicio', hoje.toISOString().slice(0, 10))
        .gte('data_fim', inicio.toISOString().slice(0, 10))
      if (error) throw error

      const diasUteisTotal = diasUteisNoIntervalo(inicio, hoje)
      let diasFalta = 0
      for (const a of data ?? []) {
        const ini = new Date(`${a.data_inicio}T00:00:00`)
        const fim = new Date(`${a.data_fim}T00:00:00`)
        const iniRecortado = ini < inicio ? inicio : ini
        const fimRecortado = fim > hoje ? hoje : fim
        if (iniRecortado <= fimRecortado) diasFalta += diasUteisNoIntervalo(iniRecortado, fimRecortado)
      }

      const percentual = diasUteisTotal > 0
        ? Math.max(0, Math.min(100, ((diasUteisTotal - diasFalta) / diasUteisTotal) * 100))
        : 100

      return { diasUteisTotal, diasFalta, percentual, janelaInicio: inicio, janelaFim: hoje }
    },
  })
}
