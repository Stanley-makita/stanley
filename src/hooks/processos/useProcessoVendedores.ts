'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoVendedor } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoVendedores(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'vendedores'],
    queryFn: async (): Promise<ProcessoVendedor[]> => {
      const { data, error } = await supabase
        .from('processo_vendedores')
        .select('*')
        .eq('processo_id', processoId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarVendedor(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: Omit<ProcessoVendedor, 'id' | 'processo_id' | 'empresa_id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('processo_vendedores')
        .insert({ ...input, processo_id: processoId, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
      toast.success('Vendedor adicionado.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao adicionar vendedor.'),
  })
}

export function useEditarVendedor(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ id, pessoa_id, ...input }: Partial<ProcessoVendedor> & { id: string; pessoa_id?: string | null }) => {
      const { error } = await supabase
        .from('processo_vendedores')
        .update(input)
        .eq('id', id)
      if (error) throw error

      // Sincronizar campos compartilhados com pessoas
      if (pessoa_id) {
        const pessoaPayload: Record<string, unknown> = {}
        if (input.nome          !== undefined) pessoaPayload.nome          = input.nome
        if (input.cpf           !== undefined) pessoaPayload.cpf           = input.cpf || null
        if (input.email         !== undefined) pessoaPayload.email         = input.email || null
        if (input.estado_civil  !== undefined) pessoaPayload.estado_civil  = input.estado_civil || null
        if (input.conjuge_nome  !== undefined) pessoaPayload.conjuge_nome  = input.conjuge_nome || null
        if (input.conjuge_cpf   !== undefined) pessoaPayload.conjuge_cpf   = input.conjuge_cpf || null
        if (input.conjuge_data_nasc !== undefined) pessoaPayload.conjuge_data_nascimento = input.conjuge_data_nasc || null
        if (input.regime_casamento !== undefined) {
          // processo_vendedores usa conjuge_papel mas pessoas usa regime_casamento via leads
        }

        if (Object.keys(pessoaPayload).length > 0) {
          await supabase.from('pessoas').update(pessoaPayload).eq('id', pessoa_id)
          if (usuario?.id && usuario?.empresa_id) {
            await supabase.from('pessoas_alteracoes').insert({
              pessoa_id,
              empresa_id: usuario.empresa_id,
              usuario_id: usuario.id,
              campos_alterados: Object.keys(pessoaPayload),
              valores_anteriores: {},
              valores_novos: pessoaPayload,
              origem: 'processos',
            })
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
      toast.success('Vendedor atualizado.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao atualizar vendedor.'),
  })
}

export function useRemoverVendedor(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vendedorId: string) => {
      const { error } = await supabase
        .from('processo_vendedores')
        .delete()
        .eq('id', vendedorId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
    },
    onError: () => toast.error('Erro ao remover vendedor.'),
  })
}