import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedShell } from '@/components/layout/ProtectedShell'
import type { SessaoUsuario } from '@/types/auth'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('id, empresa_id, perfil, nome, email, ativo')
    .eq('auth_user_id', user.id)
    .single()

  if (!perfil || !perfil.ativo) redirect('/login')

  return (
    <AuthProvider initialUser={perfil as SessaoUsuario}>
      <ProtectedShell>
        {children}
      </ProtectedShell>
    </AuthProvider>
  )
}
