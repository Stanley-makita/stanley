'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type Convite, type UsuarioPerfil } from '@/types/auth'
import { toast } from 'sonner'

export function useConvites() {
  return useQuery({
    queryKey: ['convites'],
    queryFn: async (): Promise<Convite[]> => {
      const { data, error } = await supabase
        .from('convites')
        .select('*')
        .is('aceito_em', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5,
  })
}

interface CriarConviteInput {
  email: string
  perfil: UsuarioPerfil
}

export function useCriarConvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CriarConviteInput): Promise<Convite> => {
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, empresa_id')
        .single()

      if (!usuario) throw new Error('Usuário não encontrado')

      const { data, error } = await supabase
        .from('convites')
        .insert({
          email: input.email,
          perfil: input.perfil,
          empresa_id: usuario.empresa_id,
          criado_por: usuario.id,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convites'] })
      toast.success('Convite enviado com sucesso!', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
    onError: () => {
      toast.error('Erro ao enviar convite. Tente novamente.')
    },
  })
}

export function useCancelarConvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conviteId: string) => {
      const { error } = await supabase
        .from('convites')
        .delete()
        .eq('id', conviteId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convites'] })
      toast.success('Convite cancelado.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
  })
}