'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { type SessaoUsuario } from '@/types/auth'

interface AuthContextValue {
  usuario: SessaoUsuario | null
  carregando: boolean
  sair: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // Inicializa sessão ao montar
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await carregarPerfil(session.user.id)
      }
      setCarregando(false)
    })

    // Observa mudanças de sessão
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await carregarPerfil(session.user.id)
        } else {
          setUsuario(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function carregarPerfil(authUserId: string) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, empresa_id, perfil, nome, email, ativo')
      .eq('auth_user_id', authUserId)
      .single()

    if (data) {
      setUsuario(data)
    }
  }

  async function sair() {
    await supabase.auth.signOut()
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, sair }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext deve ser usado dentro de AuthProvider')
  return ctx
}