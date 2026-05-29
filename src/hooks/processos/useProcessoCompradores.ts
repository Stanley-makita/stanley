'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoComprador } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoCompradores(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'compradores'],
    queryFn: async (): Promise<ProcessoComprador[]> => {
      const { data, error } = await supabase
        .from('processo_compradores')
        .select('*')
        .eq('processo_id', processoId)
        .order('principal', { ascending: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarComprador(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: Omit<ProcessoComprador, 'id' | 'processo_id' | 'empresa_id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('processo_compradores')
        .insert({ ...input, processo_id: processoId, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'compradores'] })
      toast.success('Comprador adicionado.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao adicionar comprador.'),
  })
}

export function useEditarComprador(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ id, pessoa_id, ...input }: Partial<ProcessoComprador> & { id: string; pessoa_id?: string | null }) => {
      const { error } = await supabase
        .from('processo_compradores')
        .update(input)
        .eq('id', id)
      if (error) throw error

      // Sincronizar campos compartilhados com pessoas
      if (pessoa_id) {
        const pessoaPayload: Record<string, unknown> = {}
        if (input.nome  !== undefined) pessoaPayload.nome  = input.nome
        if (input.cpf   !== undefined) pessoaPayload.cpf   = input.cpf || null
        if (input.email !== undefined) pessoaPayload.email = input.email || null

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
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'compradores'] })
      toast.success('Comprador atualizado.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao atualizar comprador.'),
  })
}

export function useRemoverComprador(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (compradorId: string) => {
      const { error } = await supabase
        .from('processo_compradores')
        .delete()
        .eq('id', compradorId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'compradores'] })
    },
    onError: () => toast.error('Erro ao remover comprador.'),
  })
}