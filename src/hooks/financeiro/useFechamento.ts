'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinFechamento, type FinFechamentoStatus } from '@/types/financeiro'
import { toast } from 'sonner'

export function useFechamento(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'fechamento', usuario?.empresa_id, ano, mes],
    queryFn: async (): Promise<FinFechamento | null> => {
      const { data, error } = await supabase
        .from('financeiro_fechamentos')
        .select('*, aprovado_por_usuario:usuarios!aprovado_por(nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('competencia_mes', mes)
        .eq('competencia_ano', ano)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!usuario,
  })
}

export function useFechamentos() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'fechamentos', usuario?.empresa_id],
    queryFn: async (): Promise<FinFechamento[]> => {
      const { data, error } = await supabase
        .from('financeiro_fechamentos')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .order('competencia_ano', { ascending: false })
        .order('competencia_mes', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!usuario,
  })
}

export function useAbrirFechamento() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ mes, ano }: { mes: number; ano: number }) => {
      const { data, error } = await supabase.rpc('abrir_fechamento', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'fechamento'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'fechamentos'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'despesas'] })
      toast.success('Fechamento aberto com sucesso.')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao abrir fechamento.'),
  })
}

export function usePuxarProcessos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fechamento_id: string) => {
      const { data, error } = await supabase.rpc('puxar_processos_emitidos', {
        p_fechamento_id: fechamento_id,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      toast.success(`${count} processo(s) importado(s) para o fechamento.`)
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao puxar processos.'),
  })
}

export function usePuxarContratos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fechamento_id: string) => {
      const { data, error } = await supabase.rpc('puxar_contratos', {
        p_fechamento_id: fechamento_id,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      toast.success(`${count} contrato(s) importado(s) para o fechamento.`)
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao puxar contratos.'),
  })
}

export function useGerarComissoesAPagar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fechamento_id: string) => {
      const { data, error } = await supabase.rpc('gerar_comissoes_a_pagar', {
        p_fechamento_id: fechamento_id,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      toast.success(`${count} comissão(ões) gerada(s).`)
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao gerar comissões.'),
  })
}

export function useGerarFolha() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fechamento_id: string) => {
      const { data, error } = await supabase.rpc('gerar_folha', {
        p_fechamento_id: fechamento_id,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'folha'] })
      toast.success('Folha gerada com sucesso.')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao gerar folha.'),
  })
}

export function useExecutarConferencias() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fechamento_id: string) => {
      const { data, error } = await supabase.rpc('executar_conferencias', {
        p_fechamento_id: fechamento_id,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (pendentes) => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'conferencias'] })
      if (pendentes > 0) {
        toast.warning(`${pendentes} conferência(s) pendente(s) encontrada(s).`)
      } else {
        toast.success('Todas as conferências estão em ordem.')
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao executar conferências.'),
  })
}

export function useAprovarFechamento() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fechamento_id: string) => {
      const { error } = await supabase.rpc('aprovar_fechamento', {
        p_fechamento_id: fechamento_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'fechamento'] })
      toast.success('Fechamento aprovado.')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao aprovar fechamento.'),
  })
}

export function useTravarFechamento() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fechamento_id: string) => {
      const { error } = await supabase.rpc('travar_fechamento', {
        p_fechamento_id: fechamento_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'fechamento'] })
      toast.success('Fechamento travado. Mês encerrado.')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao travar fechamento.'),
  })
}

export function useReabrirFechamento() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ fechamento_id, motivo }: { fechamento_id: string; motivo: string }) => {
      const { error } = await supabase.rpc('reabrir_fechamento', {
        p_fechamento_id: fechamento_id,
        p_motivo: motivo,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'fechamento'] })
      toast.success('Fechamento reaberto.')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao reabrir fechamento.'),
  })
}

export function useAtualizarFechamento() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status, observacoes }: {
      id: string
      status?: FinFechamentoStatus
      observacoes?: string
    }) => {
      const { error } = await supabase
        .from('financeiro_fechamentos')
        .update({ ...(status && { status }), ...(observacoes !== undefined && { observacoes }) })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'fechamento'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao atualizar fechamento.'),
  })
}
