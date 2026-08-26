'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  type FinContaReceber,
  type FinNotaFiscal,
  type FinRecebimento,
  type FinStatusContaReceber,
} from '@/types/financeiro'
import { toast } from 'sonner'

// A Receber sempre ao vivo: cada linha usa o registro persistido em
// financeiro_contas_receber quando já existe (de qualquer fechamento,
// aprovado ou não), ou um valor calculado ao vivo quando o processo ainda
// não tem registro nenhum. Ver AbaAReceber — substitui o antigo par
// snapshot/preview: não existe mais estado "travado" por causa de
// fechamento não aprovado, só quando o fechamento está com status
// 'travado' de fato.
export function useContasAReceberVivo(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'contas_receber_vivo', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<FinContaReceber[]> => {
      const { data, error } = await supabase.rpc('contas_a_receber_mes_vivo', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error

      const linhas = (data ?? []) as Array<{
        id: string; persistido: boolean; processo_id: string | null
        banco_id: string | null; banco_nome: string | null; banco_cor: string | null
        cliente_nome: string | null; origem: string; valor_previsto: number
        valor_recebido: number; status: string; data_prevista: string | null
      }>

      const idsPersistidos = linhas.filter(l => l.persistido).map(l => l.id)
      let notas: Record<string, FinNotaFiscal[]> = {}
      let recebimentos: Record<string, FinRecebimento[]> = {}

      if (idsPersistidos.length > 0) {
        const [nfRes, recRes] = await Promise.all([
          supabase.from('financeiro_notas_fiscais').select('*').in('conta_receber_id', idsPersistidos),
          supabase.from('financeiro_recebimentos').select('*').in('conta_receber_id', idsPersistidos),
        ])
        if (nfRes.error) throw nfRes.error
        if (recRes.error) throw recRes.error
        notas = groupBy(nfRes.data as FinNotaFiscal[], 'conta_receber_id')
        recebimentos = groupBy(recRes.data as FinRecebimento[], 'conta_receber_id')
      }

      return linhas.map(l => ({
        id: l.id,
        empresa_id: usuario!.empresa_id,
        fechamento_id: null,
        processo_id: l.processo_id,
        banco_id: l.banco_id,
        cliente_nome: l.cliente_nome,
        origem: l.origem as FinContaReceber['origem'],
        valor_base: l.valor_previsto,
        percentual_previsto: 0,
        valor_previsto: l.valor_previsto,
        valor_recebido: l.valor_recebido,
        status: l.status as FinContaReceber['status'],
        data_prevista: l.data_prevista,
        data_recebimento: null,
        observacoes: null,
        created_at: '',
        updated_at: '',
        persistido: l.persistido,
        banco: l.banco_nome ? { nome: l.banco_nome, cor: l.banco_cor } : undefined,
        notas_fiscais: notas[l.id] ?? [],
        recebimentos: recebimentos[l.id] ?? [],
      }))
    },
    enabled: !!usuario,
  })
}

function groupBy<T extends { conta_receber_id: string }>(rows: T[], _key: 'conta_receber_id'): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const r of rows) {
    (out[r.conta_receber_id] ??= []).push(r)
  }
  return out
}

// Garante que existe um registro persistido de contas a receber pra um
// processo (cria sob demanda se ainda não existir) — chamado antes de
// lançar a primeira NF/Recebimento de uma linha que só existia ao vivo.
export function useGarantirContaReceber() {
  return useMutation({
    mutationFn: async (processo_id: string): Promise<string> => {
      const { data, error } = await supabase.rpc('garantir_conta_receber_processo', {
        p_processo_id: processo_id,
      })
      if (error) throw error
      return data as string
    },
  })
}

export function useAdicionarContaReceber() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinContaReceber, 'id' | 'empresa_id' | 'valor_recebido' | 'status' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('financeiro_contas_receber')
        .insert({ ...payload, empresa_id: usuario!.empresa_id, origem: payload.origem ?? 'avulso' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber_vivo'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'painel'] })
      toast.success('Conta a receber adicionada.')
    },
    onError: () => toast.error('Erro ao adicionar conta a receber.'),
  })
}

export function useAdicionarNotaFiscal() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinNotaFiscal, 'id' | 'empresa_id' | 'status' | 'created_at'>) => {
      const { error } = await supabase
        .from('financeiro_notas_fiscais')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber_vivo'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'painel'] })
      toast.success('Nota fiscal registrada.')
    },
    onError: () => toast.error('Erro ao registrar nota fiscal.'),
  })
}

export function useAdicionarRecebimento() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinRecebimento, 'id' | 'empresa_id' | 'created_at'>) => {
      const { error } = await supabase
        .from('financeiro_recebimentos')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber_vivo'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'painel'] })
      toast.success('Recebimento registrado.')
    },
    onError: () => toast.error('Erro ao registrar recebimento.'),
  })
}

export function useRemoverRecebimento() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financeiro_recebimentos')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber_vivo'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'painel'] })
      toast.success('Recebimento removido.')
    },
    onError: () => toast.error('Erro ao remover recebimento.'),
  })
}

export function useAtualizarStatusConta() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FinStatusContaReceber }) => {
      const { error } = await supabase
        .from('financeiro_contas_receber')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber_vivo'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'painel'] })
    },
    onError: () => toast.error('Erro ao atualizar status.'),
  })
}
