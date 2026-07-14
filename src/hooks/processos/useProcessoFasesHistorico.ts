'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoFaseHistorico } from '@/types/processos'
import { dadosFinanceirosIncompletos } from '@/lib/processos/validacaoFinanceira'
import { toast } from 'sonner'

export function useProcessoFasesHistorico(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'fases-historico'],
    queryFn: async (): Promise<ProcessoFaseHistorico[]> => {
      const { data, error } = await supabase
        .from('processo_fases_historico')
        .select('*, fase:fases!fase_id(id, nome, cor), usuario:usuarios!usuario_id(nome)')
        .eq('processo_id', processoId)
        .order('entrou_em', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAvancarFase(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ faseId, observacao }: { faseId: string; observacao?: string }) => {
      // Trava obrigatória (não só client-side): não avança fase com dados
      // financeiros incompletos/inconsistentes, seja qual for o caminho de
      // chamada (pipeline bar, aba de fases, etc).
      const { data: proc, error: procFetchError } = await supabase
        .from('processos')
        .select('banco_id, taxa_juros, sistema_amortizacao, valor_imovel, valor_financiado, valor_fgts')
        .eq('id', processoId)
        .single()
      if (procFetchError) throw procFetchError
      if (dadosFinanceirosIncompletos(proc)) {
        throw new Error('DADOS_FINANCEIROS_PENDENTES')
      }

      // 1. Registrar no histórico
      const { error: histError } = await supabase
        .from('processo_fases_historico')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          fase_id: faseId,
          usuario_id: usuario!.id,
          observacao: observacao ?? null,
        })
      if (histError) throw histError

      // 2. Atualizar fase atual no processo
      const { error: procError } = await supabase
        .from('processos')
        .update({ fase_atual_id: faseId })
        .eq('id', processoId)
      if (procError) throw procError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'fases-historico'] })
      toast.success('Fase avançada com sucesso.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: (err: Error) => {
      if (err.message === 'DADOS_FINANCEIROS_PENDENTES') {
        toast.error('Existem informações financeiras obrigatórias pendentes.', {
          description: 'Complete os Dados do Negócio para continuar.',
        })
        return
      }
      toast.error('Erro ao avançar fase.')
    },
  })
}