'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthContext } from '@/contexts/AuthContext'

const CACHE_KEY = 'fonti:logo_url'

function getCachedLogoUrl(): string | null {
  try { return sessionStorage.getItem(CACHE_KEY) } catch { return null }
}

function setCachedLogoUrl(url: string) {
  try { sessionStorage.setItem(CACHE_KEY, url) } catch { /* */ }
}

export function usePersonalizacao() {
  const supabase = createClient()
  // Lê empresa_id do AuthContext (dado síncrono vindo do servidor via initialUser)
  // em vez de useUsuarioAtual() (fetch assíncrono), eliminando o waterfall que
  // causava flash da logo branca enquanto o segundo fetch não completava.
  const { usuario } = useAuthContext()
  const empresaId = usuario?.empresa_id

  return useQuery({
    queryKey: ['empresa-personalizacao', empresaId],
    enabled: !!empresaId,
    staleTime: 60_000,
    placeholderData: () => {
      const cached = getCachedLogoUrl()
      return cached ? { logo_url: cached } as any : undefined
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome, cnpj, telefone, email, email_contato, site, logo_url, logo_path')
        .eq('id', empresaId!)
        .single()
      if (error) throw error
      if (data?.logo_url) setCachedLogoUrl(data.logo_url)
      return data
    },
  })
}
