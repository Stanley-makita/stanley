'use client'

import { useAuth } from './useAuth'
import { podeExecutar } from '@/lib/auth/permissions'
import { type Acao } from '@/types/auth'

export function usePermissao() {
  const { usuario } = useAuth()

  function pode(acao: Acao): boolean {
    if (!usuario) return false
    return podeExecutar(usuario.perfil, acao)
  }

  return { pode }
}