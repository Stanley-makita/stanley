'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinAnaliseComissaoLinha, type FinAnaliseComissaoContratoLinha, type FinComissaoApurada } from '@/types/financeiro'

// Ao vivo, sempre — mesmo padrão de useEmissoesPreview/useContasAReceberVivo:
// uma linha por processo de financiamento emitido no mês (mesmo filtro de
// emissoes_mes_preview), com a comissão da empresa (comissoes_padrao) e a
// comissão do comercial (comissao_comercial_calculada, já com o CGI
// especial embutido quando aplicável — migration 298/299).
export function useAnaliseComissoesMes(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'analise_comissoes', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<FinAnaliseComissaoLinha[]> => {
      const { data, error } = await supabase.rpc('analise_comissoes_mes', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
  })
}

export function useAnaliseComissoesContratosMes(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'analise_comissoes_contratos', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<FinAnaliseComissaoContratoLinha[]> => {
      const { data, error } = await supabase.rpc('analise_comissoes_contratos_mes', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
  })
}

export function useComissaoApuradaMes(comercialId: string | null, mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'comissao_apurada', usuario?.empresa_id, comercialId, mes, ano],
    queryFn: async (): Promise<FinComissaoApurada | null> => {
      const { data, error } = await supabase.rpc('comissao_apurada_mes', {
        p_empresa_id: usuario!.empresa_id,
        p_comercial_usuario_id: comercialId,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data?.[0] ?? null
    },
    enabled: !!usuario && !!comercialId,
  })
}
