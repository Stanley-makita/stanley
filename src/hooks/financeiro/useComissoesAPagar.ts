'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinComissaoPagar, type FinStatusComissaoPagar } from '@/types/financeiro'
import { toast } from 'sonner'

export function useComissoesAPagar(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'comissoes_pagar', fechamento_id],
    queryFn: async (): Promise<FinComissaoPagar[]> => {
      const { data, error } = await supabase
        .from('financeiro_comissoes_pagar')
        .select(`
          *,
          funcionario:rh_funcionarios!funcionario_id(nome),
          usuario:usuarios!usuario_id(nome),
          regra:rh_regras_comissao!regra_id(nome)
        `)
        .eq('fechamento_id', fechamento_id!)
        .order('papel', { ascending: true })
        .order('valor_final', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

// Preview ao vivo: calcula direto de `processos` emitidos no mês (comercial
// agregado pela regra do RH sobre a produção mensal, operacional/parceiro
// por processo), sem exigir fechamento aberto/puxado.
export function useComissoesAPagarPreview(mes: number, ano: number, enabled = true) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'comissoes_pagar_preview', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<FinComissaoPagar[]> => {
      const { data, error } = await supabase.rpc('comissoes_a_pagar_mes_preview', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return (data ?? []).map((r: {
        id: string; processo_id: string | null; usuario_id: string | null; funcionario_id: string | null
        tipo_destinatario: string; papel: string; pessoa_nome: string
        valor_base: number; percentual: number; valor_calculado: number
      }) => ({
        id: r.id,
        empresa_id: usuario!.empresa_id,
        fechamento_id: '',
        processo_id: r.processo_id,
        pessoa_id: null,
        usuario_id: r.usuario_id,
        funcionario_id: r.funcionario_id,
        tipo_destinatario: r.tipo_destinatario as FinComissaoPagar['tipo_destinatario'],
        papel: r.papel as FinComissaoPagar['papel'],
        regra_id: null,
        parceiro_id: null,
        valor_base: r.valor_base,
        percentual: r.percentual,
        valor_calculado: r.valor_calculado,
        ajuste_manual: 0,
        valor_final: r.valor_calculado,
        status: 'calculada' as const,
        data_prevista_pagamento: null,
        data_pagamento: null,
        observacoes: null,
        created_at: '',
        updated_at: '',
        funcionario: r.funcionario_id ? { nome: r.pessoa_nome } : undefined,
        usuario: !r.funcionario_id ? { nome: r.pessoa_nome } : undefined,
      }))
    },
    enabled: !!usuario && enabled,
  })
}

export function useAtualizarComissaoPagar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ajuste_manual,
      motivo_ajuste,
      status,
      data_pagamento,
      observacoes,
    }: {
      id: string
      ajuste_manual?: number
      motivo_ajuste?: string
      status?: FinStatusComissaoPagar
      data_pagamento?: string
      observacoes?: string
    }) => {
      const { error } = await supabase
        .from('financeiro_comissoes_pagar')
        .update({
          ...(ajuste_manual !== undefined && { ajuste_manual }),
          ...(status && { status }),
          ...(data_pagamento !== undefined && { data_pagamento }),
          ...(observacoes !== undefined && { observacoes }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'comissoes_pagar'] })
      toast.success('Comissão atualizada.')
    },
    onError: () => toast.error('Erro ao atualizar comissão.'),
  })
}

export function useAdicionarComissaoPagar() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinComissaoPagar, 'id' | 'empresa_id' | 'valor_final' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('financeiro_comissoes_pagar')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'comissoes_pagar'] })
      toast.success('Comissão adicionada.')
    },
    onError: () => toast.error('Erro ao adicionar comissão.'),
  })
}

export function useRemoverComissaoPagar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financeiro_comissoes_pagar')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'comissoes_pagar'] })
      toast.success('Comissão removida.')
    },
    onError: () => toast.error('Erro ao remover comissão.'),
  })
}

export function useMarcarComissoesPagas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ids, data_pagamento }: { ids: string[]; data_pagamento: string }) => {
      const { error } = await supabase
        .from('financeiro_comissoes_pagar')
        .update({ status: 'paga', data_pagamento })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'comissoes_pagar'] })
      toast.success('Comissões marcadas como pagas.')
    },
    onError: () => toast.error('Erro ao marcar pagamento.'),
  })
}
