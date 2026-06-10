'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { ResultadoApuracao } from '@/lib/documentos/apurar-renda'

export interface ApuracaoRenda {
  id: string
  empresa_id: string
  lead_id: string | null
  processo_id: string | null
  usuario_id: string | null
  renda_apurada: number | null
  media_mensal_entradas: number | null
  media_mensal_saidas: number | null
  media_liquida: number | null
  periodo_inicio: string | null
  periodo_fim: string | null
  documentos_ids: string[] | null
  confianca: 'alta' | 'media' | 'baixa' | null
  status: 'pendente' | 'concluida' | 'revisada' | 'descartada'
  resultado_json: ResultadoApuracao
  created_at: string
}

interface Params {
  leadId?: string | null
  processoId?: string | null
}

export function useApuracaoRenda({ leadId, processoId }: Params) {
  const { usuario } = useAuth()

  const id = leadId ?? processoId
  const campo = leadId ? 'lead_id' : 'processo_id'

  const { data, isLoading } = useQuery<ApuracaoRenda[]>({
    queryKey: ['apuracao-renda', campo, id],
    enabled: !!usuario && !!id,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('apuracoes_renda')
        .select('*')
        .eq(campo, id!)
        .eq('empresa_id', usuario!.empresa_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as ApuracaoRenda[]
    },
  })

  const apuracoes = data ?? []
  const ultima = apuracoes[0] ?? null

  return { apuracoes, ultima, isLoading }
}
