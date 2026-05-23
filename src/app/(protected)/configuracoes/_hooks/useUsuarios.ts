'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Usuario, UsuarioPerfil } from '@/types/configuracoes'

const supabase = createClient()

async function getToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async (): Promise<Usuario[]> => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .is('deleted_at', null)
        .order('nome')
      if (error) throw error
      return data
    },
    staleTime: 60_000,
  })
}

export function useCriarUsuario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      nome: string
      email: string
      senha: string
      perfil: UsuarioPerfil
      funcao: string | null
      ativo: boolean
    }) => {
      const token = await getToken()
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar usuário')
      return json as Usuario
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

export function useAtualizarUsuario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      nome?: string
      perfil?: UsuarioPerfil
      funcao?: string | null
      ativo?: boolean
    }) => {
      const { id, ...rest } = payload
      const token = await getToken()
      const res = await fetch(`/api/admin/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(rest),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao atualizar usuário')
      return json as Usuario
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

export function useResetSenha() {
  return useMutation({
    mutationFn: async ({ id, novaSenha }: { id: string; novaSenha: string }) => {
      const token = await getToken()
      const res = await fetch(`/api/admin/usuarios/${id}/reset-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ novaSenha }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao redefinir senha')
    },
  })
}

// mantido para compatibilidade com código existente
export function useAtualizarPerfil() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, perfil }: { id: string; perfil: UsuarioPerfil }) => {
      const { error } = await supabase.from('usuarios').update({ perfil }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}
