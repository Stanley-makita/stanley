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

// Tenta encontrar uma pessoa pelo CPF usando o client público (RLS filtra por empresa)
async function buscarPessoaIdPorCpf(cpf: string, empresaId: string): Promise<string | null> {
  const cpfNorm = cpf.replace(/\D/g, '')
  if (!cpfNorm) return null
  const { data } = await supabase
    .from('pessoas')
    .select('id')
    .eq('empresa_id', empresaId)
    .or(`cpf.eq.${cpfNorm},cpf.eq.${cpf.trim()}`)
    .maybeSingle()
  return data?.id ?? null
}

export function useAdicionarComprador(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: Omit<ProcessoComprador, 'id' | 'processo_id' | 'empresa_id' | 'created_at' | 'updated_at'>) => {
      const { data: inserted, error } = await supabase
        .from('processo_compradores')
        .insert({ ...input, processo_id: processoId, empresa_id: usuario!.empresa_id })
        .select('id')
        .single()
      if (error) throw error

      // Tentar vincular pessoa pelo CPF para habilitar sync futuro
      if (input.cpf?.trim() && inserted?.id) {
        const pessoaId = await buscarPessoaIdPorCpf(input.cpf, usuario!.empresa_id)
        if (pessoaId) {
          await supabase
            .from('processo_compradores')
            .update({ pessoa_id: pessoaId })
            .eq('id', inserted.id)
        }
      }
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
      // Se pessoa_id não existe mas temos CPF, tentar resolver agora
      let resolvedPessoaId = pessoa_id ?? null
      if (!resolvedPessoaId && input.cpf?.trim() && usuario?.empresa_id) {
        resolvedPessoaId = await buscarPessoaIdPorCpf(input.cpf, usuario.empresa_id)
        if (resolvedPessoaId) {
          // Persistir o vínculo para evitar nova busca na próxima edição
          await supabase
            .from('processo_compradores')
            .update({ pessoa_id: resolvedPessoaId })
            .eq('id', id)
        }
      }

      const { error } = await supabase
        .from('processo_compradores')
        .update(input)
        .eq('id', id)
      if (error) throw error

      // Sincronizar campos compartilhados com pessoas
      if (resolvedPessoaId) {
        const pessoaPayload: Record<string, unknown> = {}
        if (input.nome  !== undefined) pessoaPayload.nome  = input.nome
        if (input.cpf   !== undefined) pessoaPayload.cpf   = input.cpf || null
        if (input.email !== undefined) pessoaPayload.email = input.email || null

        if (Object.keys(pessoaPayload).length > 0) {
          await supabase.from('pessoas').update(pessoaPayload).eq('id', resolvedPessoaId)
          if (usuario?.id && usuario?.empresa_id) {
            await supabase.from('pessoas_alteracoes').insert({
              pessoa_id:          resolvedPessoaId,
              empresa_id:         usuario.empresa_id,
              usuario_id:         usuario.id,
              campos_alterados:   Object.keys(pessoaPayload),
              valores_anteriores: {},
              valores_novos:      pessoaPayload,
              origem:             'processos',
            })
          }
        }
      }
    },
    onSuccess: () => {
      // Invalida compradores E o processo (cujo título lê compradores via JOIN)
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'compradores'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
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
