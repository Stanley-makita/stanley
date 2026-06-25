'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
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
  // Ref evita que onAuthStateChange dispare carregarPerfil duas vezes para o mesmo uid
  const authUserIdRef = useRef<string | null>(null)

  const carregarPerfil = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('usuarios')
      .select('id, empresa_id, perfil, nome, email, ativo')
      .eq('auth_user_id', uid)
      .single()

    if (!data) {
      setUsuario(null)
      return
    }

    if (!data.ativo) {
      await supabase.auth.signOut()
      setUsuario(null)
      return
    }

    setUsuario(data as SessaoUsuario)
  }, [])

  const recarregarPerfil = useCallback(async () => {
    if (authUserIdRef.current) await carregarPerfil(authUserIdRef.current)
  }, [carregarPerfil])

  useEffect(() => {
    let active = true

    // onAuthStateChange dispara INITIAL_SESSION na montagem com a sessão atual.
    // createBrowserClient (@supabase/ssr) gerencia refresh de token automaticamente:
    // se o JWT expirou mas o refresh token é válido, ele renova antes de disparar.
    // Não chamamos getSession() nem getUser() — tudo vem pelo event listener.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!active) return

        if (session?.user) {
          if (authUserIdRef.current !== session.user.id) {
            authUserIdRef.current = session.user.id
            await carregarPerfil(session.user.id)
          }
          // Garante que carregando sai de true mesmo em TOKEN_REFRESHED para o mesmo uid
          if (active) setCarregando(false)
        } else {
          authUserIdRef.current = null
          setUsuario(null)
          if (active) setCarregando(false)
        }
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
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
          if (authUserIdRef.current) await carregarPerfil(authUserIdRef.current)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [usuario?.id, carregarPerfil])

  async function sair() {
    authUserIdRef.current = null
    setUsuario(null)
    await supabase.auth.signOut()
    // Hard redirect garante que todo estado em memória é descartado
    window.location.href = '/login'
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
