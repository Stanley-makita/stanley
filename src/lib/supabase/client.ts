import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Cookie de sessão do navegador: expira ao fechar o navegador,
      // não sobrevive como cookie persistente de 400 dias (padrão da lib).
      cookieOptions: { maxAge: undefined },
    }
  )
}
