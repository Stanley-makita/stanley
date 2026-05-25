'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { type SessaoUsuario } from '@/types/auth'

interface AuthContextValue {
  usuario: SessaoUsuario | null
  carregando: boolean
  sair: () => Promise<void>
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [authUserId, setAuthUserId] = useState<string | null>(null)

  const carregarPerfil = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('usuarios')
      .select('id, empresa_id, perfil, nome, email, ativo')
      .eq('auth_user_id', uid)
      .single()

    if (data) {
      if (!data.ativo) {
        // Usuário desativado — forçar logout
        await supabase.auth.signOut()
        setUsuario(null)
      } else {
        setUsuario(data)
      }
    } else {
      setUsuario(null)
    }
  }, [])

  const recarregarPerfil = useCallback(async () => {
    if (authUserId) await carregarPerfil(authUserId)
  }, [authUserId, carregarPerfil])

  useEffect(() => {
    // Usa getUser() — valida o JWT com o servidor (mais confiável que getSession)
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setAuthUserId(user.id)
        await carregarPerfil(user.id)
      }
      setCarregando(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setAuthUserId(session.user.id)
          await carregarPerfil(session.user.id)
        } else {
          setAuthUserId(null)
          setUsuario(null)
        }
        setCarregando(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [carregarPerfil])

  // Realtime: detecta mudanças no perfil/ativo do usuário logado sem precisar de F5
  useEffect(() => {
    if (!usuario?.id) return

    const channel = supabase
      .channel(`usuario-perfil-${usuario.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'usuarios',
          filter: `id=eq.${usuario.id}`,
        },
        async () => {
          if (authUserId) await carregarPerfil(authUserId)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [usuario?.id, authUserId, carregarPerfil])

  async function sair() {
    await supabase.auth.signOut()
    setUsuario(null)
    setAuthUserId(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, sair, recarregarPerfil }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext deve ser usado dentro de AuthProvider')
  return ctx
}
