'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinContaBancaria, type FinSaldoBancario } from '@/types/financeiro'
import { toast } from 'sonner'

export function useContasBancarias() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'contas_bancarias', usuario?.empresa_id],
    queryFn: async (): Promise<FinContaBancaria[]> => {
      const { data, error } = await supabase
        .from('financeiro_contas_bancarias')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativa', true)
        .order('apelido', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!usuario,
  })
}

export function useSaldosBancarios(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'saldos_bancarios', fechamento_id],
    queryFn: async (): Promise<FinSaldoBancario[]> => {
      const { data, error } = await supabase
        .from('financeiro_saldos_bancarios')
        .select('*, conta_bancaria:financeiro_contas_bancarias!conta_bancaria_id(apelido, banco_nome)')
        .eq('fechamento_id', fechamento_id!)
        .order('data_saldo', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

export function useSalvarContaBancaria() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinContaBancaria, 'id' | 'empresa_id' | 'created_at'>) => {
      const { error } = await supabase
        .from('financeiro_contas_bancarias')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_bancarias'] })
      toast.success('Conta bancária salva.')
    },
    onError: () => toast.error('Erro ao salvar conta bancária.'),
  })
}

export function useRegistrarSaldo() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinSaldoBancario, 'id' | 'empresa_id' | 'created_at'>) => {
      const { error } = await supabase
        .from('financeiro_saldos_bancarios')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'saldos_bancarios'] })
      toast.success('Saldo registrado.')
    },
    onError: () => toast.error('Erro ao registrar saldo.'),
  })
}
