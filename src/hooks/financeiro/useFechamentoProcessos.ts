'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinFechamentoProcesso } from '@/types/financeiro'
import { toast } from 'sonner'

export function useFechamentoProcessos(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'fechamento_processos', fechamento_id],
    queryFn: async (): Promise<FinFechamentoProcesso[]> => {
      const { data, error } = await supabase
        .from('financeiro_fechamento_processos')
        .select(`
          *,
          banco:bancos!banco_id(nome, cor),
          comercial:usuarios!comercial_id(nome),
          operacional:usuarios!operacional_id(nome)
        `)
        .eq('fechamento_id', fechamento_id!)
        .order('data_emissao', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

export function useAdicionarProcessoManual() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({
      fechamento_id,
      processo_id,
      observacoes,
    }: {
      fechamento_id: string
      processo_id: string
      observacoes?: string
    }) => {
      const { data: proc, error: errProc } = await supabase
        .from('processos')
        .select('id, cliente_id, banco_id, modalidade, valor_financiado, data_emissao, comercial_id, operacional_id, status_emissao')
        .eq('id', processo_id)
        .single()
      if (errProc) throw errProc

      const { data: cliente } = await supabase
        .from('clientes')
        .select('nome')
        .eq('id', proc.cliente_id)
        .maybeSingle()

      const { error } = await supabase
        .from('financeiro_fechamento_processos')
        .insert({
          fechamento_id,
          empresa_id: usuario!.empresa_id,
          processo_id,
          cliente_nome: cliente?.nome ?? null,
          banco_id: proc.banco_id,
          modalidade: proc.modalidade,
          valor_financiado: proc.valor_financiado,
          data_emissao: proc.data_emissao,
          comercial_id: proc.comercial_id,
          operacional_id: proc.operacional_id,
          status_origem: proc.status_emissao,
          incluido_manual: true,
          observacoes: observacoes ?? null,
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'fechamento_processos'] })
      toast.success('Processo adicionado manualmente.')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao adicionar processo.'),
  })
}

export function useRemoverProcessoFechamento() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financeiro_fechamento_processos')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'fechamento_processos'] })
      toast.success('Processo removido do fechamento.')
    },
    onError: () => toast.error('Erro ao remover processo.'),
  })
}
