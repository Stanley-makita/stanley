'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { somarComissoesConsorcio, type ComissoesConsorcio } from '@/lib/processos/comissoesConsorcio'

type Linha = { processo_id: string; valor_parcela: number | string | null }
const PAGINA = 1000  // limite de linhas por resposta do PostgREST — sem paginar, a soma sai cortada em silêncio

async function todasAsParcelas(tabela: 'financeiro_consorcio_receber' | 'financeiro_consorcio_comercial_pagar', ids: string[]): Promise<Linha[]> {
  const linhas: Linha[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase.from(tabela).select('processo_id, valor_parcela')
      .in('processo_id', ids).order('id').range(de, de + PAGINA - 1)
    if (error) throw error
    linhas.push(...((data ?? []) as Linha[]))
    if (!data || data.length < PAGINA) return linhas
  }
}

// Comissão empresa/comercial de cada consórcio, somando o fluxo financeiro (ver comissoesConsorcio.ts).
export function useComissoesConsorcio(processoIds: string[], habilitado: boolean) {
  return useQuery({
    queryKey: ['financeiro', 'consorcio-comissoes-por-processo', processoIds],
    enabled: habilitado && processoIds.length > 0,
    queryFn: async (): Promise<ComissoesConsorcio> => {
      const [receber, pagar] = await Promise.all([
        todasAsParcelas('financeiro_consorcio_receber', processoIds),
        todasAsParcelas('financeiro_consorcio_comercial_pagar', processoIds),
      ])
      return somarComissoesConsorcio(receber, pagar)
    },
  })
}
