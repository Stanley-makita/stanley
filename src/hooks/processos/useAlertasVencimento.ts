'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { differenceInDays, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { TipoValidade } from './useSalvarValidadeProcesso'
import { LABEL_VALIDADE } from './useSalvarValidadeProcesso'

export type TipoAlerta = `${TipoValidade}_10` | `${TipoValidade}_5`

export interface AlertaPendente {
  tipo: TipoAlerta
  tipoValidade: TipoValidade
  label: string
  diasRestantes: number
  validadeData: string
  vencida: boolean
}

function calcularAlertas(
  validades: Record<TipoValidade, string | null | undefined>,
  lidos: Set<string>,
): AlertaPendente[] {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alertas: AlertaPendente[] = []

  for (const tipo of ['credito', 'engenharia', 'matricula'] as TipoValidade[]) {
    const data = validades[tipo]
    if (!data) continue

    const dias = differenceInDays(parseISO(data), hoje)
    if (dias > 10) continue

    if (dias <= 5) {
      const chave = `${tipo}_5__${data}`
      if (!lidos.has(chave)) {
        alertas.push({ tipo: `${tipo}_5`, tipoValidade: tipo, label: LABEL_VALIDADE[tipo], diasRestantes: dias, validadeData: data, vencida: dias < 0 })
      }
    } else {
      const chave = `${tipo}_10__${data}`
      if (!lidos.has(chave)) {
        alertas.push({ tipo: `${tipo}_10`, tipoValidade: tipo, label: LABEL_VALIDADE[tipo], diasRestantes: dias, validadeData: data, vencida: false })
      }
    }
  }

  return alertas
}

export function useAlertasVencimento(
  processoId: string,
  validades: { validade_credito?: string | null; validade_engenharia?: string | null; validade_matricula?: string | null },
) {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  const { data: lidos = [] } = useQuery({
    queryKey: ['alertas-lidos', processoId, usuario?.id],
    enabled: Boolean(processoId && usuario?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from('processo_alertas_lidos')
        .select('tipo, validade_data')
        .eq('processo_id', processoId)
        .eq('usuario_id', usuario!.id)
      return data ?? []
    },
  })

  const lidosSet = new Set(lidos.map(r => `${r.tipo}__${r.validade_data}`))

  const alertasPendentes = calcularAlertas(
    { credito: validades.validade_credito, engenharia: validades.validade_engenharia, matricula: validades.validade_matricula },
    lidosSet,
  )

  const confirmar = useMutation({
    mutationFn: async (alertas: AlertaPendente[]) => {
      const rows = alertas.map(a => ({
        processo_id:   processoId,
        usuario_id:    usuario!.id,
        tipo:          a.tipo,
        validade_data: a.validadeData,
      }))
      const { error } = await supabase.from('processo_alertas_lidos').upsert(rows, { onConflict: 'processo_id,usuario_id,tipo,validade_data' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alertas-lidos', processoId, usuario?.id] })
    },
  })

  const alertasBloqueantes = alertasPendentes.filter(a => !a.vencida)
  const alertasVencidos    = alertasPendentes.filter(a => a.vencida)

  return { alertasPendentes, alertasBloqueantes, alertasVencidos, confirmar }
}
