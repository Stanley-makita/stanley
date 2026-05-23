'use client'

import { useAuth } from '@/hooks/auth/useAuth'
import { podeExecutar } from './permissions'
import { type Acao } from '@/types/auth'

/**
 * Hook para verificar permissão de uma ação específica.
 * Uso: const { pode } = usePermissao(); if (pode('leads.criar')) { ... }
 */
export function usePermissao() {
  const { usuario } = useAuth()

  function pode(acao: Acao): boolean {
    if (!usuario) return false
    return podeExecutar(usuario.perfil, acao)
  }

  return { pode }
}