'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

const CACHE_KEY = 'fonti:logo_url'

function getCachedLogoUrl(): string | null {
  try { return sessionStorage.getItem(CACHE_KEY) } catch { return null }
}

function setCachedLogoUrl(url: string) {
  try { sessionStorage.setItem(CACHE_KEY, url) } catch { /* */ }
}

export function usePersonalizacao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['empresa-personalizacao', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    staleTime: 60_000,
    // Logo guardada no sessionStorage evita o flash de imagem no F5
    placeholderData: () => {
      const cached = getCachedLogoUrl()
      return cached ? { logo_url: cached } as any : undefined
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome, cnpj, telefone, email, email_contato, site, logo_url, logo_path')
        .eq('id', usuario!.empresa_id)
        .single()
      if (error) throw error
      if (data?.logo_url) setCachedLogoUrl(data.logo_url)
      return data
    },
  })
}
