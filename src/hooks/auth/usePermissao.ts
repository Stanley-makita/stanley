'use client'

import { usePerfilPermissoes } from '@/hooks/auth/usePerfilPermissoes'

/**
 * Hook para verificar permissão de uma ação específica.
 * Uso: const { pode } = usePermissao(); if (pode('leads.criar')) { ... }
 *
 * Wrapper fino sobre usePerfilPermissoes — assinatura pública mantida
 * (`{ pode }`) para não exigir mudança nos consumidores existentes.
 */
export function usePermissao() {
  const { pode } = usePerfilPermissoes()
  return { pode }
}