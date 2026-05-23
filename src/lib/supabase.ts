import { createBrowserClient } from '@supabase/ssr'

// Singleton para uso nos hooks client-side
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
