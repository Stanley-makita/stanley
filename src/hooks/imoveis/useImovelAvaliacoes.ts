'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ImovelAvaliacao {
  id: string
  processo_id: string | null
  valor_avaliado: number
  validade_engenharia: string | null
  criado_em: string
  processo?: { numero_processo: string | null } | null
}

export function useImovelAvaliacoes(imovelId: string | null | undefined) {
  return useQuery({
    queryKey: ['imovel-avaliacoes', imovelId],
    enabled: Boolean(imovelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('imovel_avaliacoes')
        .select('id, processo_id, valor_avaliado, validade_engenharia, criado_em, processo:processos(numero_processo)')
        .eq('imovel_id', imovelId!)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ImovelAvaliacao[]
    },
  })
}
