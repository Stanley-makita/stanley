'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

// Mesmo conjunto de modalidades que useProcessos.ts usa pro filtro
// produto='financiamento' (inclui CGI, exclui Contrato/Consórcio/Registro).
const FINANCIAMENTO_MODALIDADES = ['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI']

export interface FinanciamentoPrevistoRow {
  data_emissao: string | null
  comissao_empresa_calculada: number | null
  comissao_comercial_calculada: number | null
}

// Previsto (regime de competência) — direto de `processos`, os mesmos
// valores computados ao vivo que já aparecem na tela de Negócios (colunas
// Comissão Empresa/Comercial). Funciona pra qualquer período, inclusive o
// mês vigente, independente do Fechamento daquele mês já ter sido aprovado
// ou não — diferente de financeiro_contas_receber/_comissoes_pagar, que só
// ganham linha depois que um Fechamento é aprovado.
export function useFinanciamentoPrevisto(anoInicio: string, anoFim: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'financiamento_previsto', usuario?.empresa_id, anoInicio, anoFim],
    queryFn: async (): Promise<FinanciamentoPrevistoRow[]> => {
      const { data, error } = await supabase
        .from('processos')
        .select('data_emissao, comissao_empresa_calculada, comissao_comercial_calculada')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .eq('status_emissao', 'emitido')
        .in('modalidade', FINANCIAMENTO_MODALIDADES)
        .gte('data_emissao', anoInicio)
        .lte('data_emissao', anoFim)
      if (error) throw error
      return data as unknown as FinanciamentoPrevistoRow[]
    },
    enabled: !!usuario,
  })
}

export interface FinanciamentoRealizadoRow {
  tipo: 'receita' | 'despesa'
  valor: number
  data: string
}

// Realizado (regime de caixa) — soma o que já foi de fato recebido do banco
// (financeiro_contas_receber.valor_recebido) e pago ao comercial
// (financeiro_comissoes_pagar.valor_final, só linhas com status 'paga').
// Só existe linha aqui depois que um Fechamento foi aprovado (ou um
// lançamento avulso foi feito) — antes disso o realizado é corretamente
// zero, mesmo que o Previsto já mostre a comissão esperada.
export function useFinanciamentoRealizado(anoInicio: string, anoFim: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'financiamento_realizado', usuario?.empresa_id, anoInicio, anoFim],
    queryFn: async (): Promise<FinanciamentoRealizadoRow[]> => {
      const [receberRes, pagarRes] = await Promise.all([
        supabase
          .from('financeiro_contas_receber')
          .select('valor_recebido, data_recebimento, processos!inner(modalidade)')
          .eq('empresa_id', usuario!.empresa_id)
          .in('processos.modalidade', FINANCIAMENTO_MODALIDADES)
          .not('data_recebimento', 'is', null)
          .gte('data_recebimento', anoInicio)
          .lte('data_recebimento', anoFim),
        supabase
          .from('financeiro_comissoes_pagar')
          .select('valor_final, data_pagamento, processos!inner(modalidade)')
          .eq('empresa_id', usuario!.empresa_id)
          .eq('status', 'paga')
          .eq('papel', 'comercial')
          .in('processos.modalidade', FINANCIAMENTO_MODALIDADES)
          .not('data_pagamento', 'is', null)
          .gte('data_pagamento', anoInicio)
          .lte('data_pagamento', anoFim),
      ])
      if (receberRes.error) throw receberRes.error
      if (pagarRes.error) throw pagarRes.error

      const receita = (receberRes.data ?? []).map((r) => ({
        tipo: 'receita' as const,
        valor: r.valor_recebido ?? 0,
        data: r.data_recebimento as string,
      }))
      const despesa = (pagarRes.data ?? []).map((r) => ({
        tipo: 'despesa' as const,
        valor: r.valor_final ?? 0,
        data: r.data_pagamento as string,
      }))
      return [...receita, ...despesa]
    },
    enabled: !!usuario,
  })
}
