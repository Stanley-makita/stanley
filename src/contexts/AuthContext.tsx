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

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser?: SessaoUsuario | null
}) {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(initialUser ?? null)
  // Se o servidor já entregou o perfil, não há carregamento inicial no cliente
  const [carregando, setCarregando] = useState(initialUser == null)
  const authUserIdRef = useRef<string | null>(null)
  // Evita chamar carregarPerfil no INITIAL_SESSION quando o perfil veio do servidor
  const serverLoadedRef = useRef(initialUser != null)

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!active) return

        if (session?.user) {
          const isNewUser = authUserIdRef.current !== session.user.id
          authUserIdRef.current = session.user.id

          if (isNewUser) {
            if (serverLoadedRef.current) {
              // Perfil já veio do servidor — apenas registra o uid, sem nova query
              serverLoadedRef.current = false
            } else {
              await carregarPerfil(session.user.id)
            }
          }

          if (active) setCarregando(false)
        } else {
          authUserIdRef.current = null
          serverLoadedRef.current = false
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

  // Segurança: encerra sessão ao fechar/recarregar a página.
  // pagehide dispara em: F5, fechar aba, fechar browser, navegar para outro site.
  // NÃO dispara em navegação interna do Next.js (Link/router.push) — sessão preservada.
  useEffect(() => {
    function handlePageHide() {
      // Apaga cookies do Supabase de forma SÍNCRONA.
      // signOut() é async e o browser fecha antes do fetch completar —
      // por isso apagamos os cookies diretamente via document.cookie.
      // O middleware não encontra sessão válida no próximo acesso → redireciona para /login.
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.trim().split('=')[0]
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=; max-age=0; path=/`
        }
      })
      // Tenta revogar o token no servidor (best-effort, pode não completar)
      supabase.auth.signOut({ scope: 'local' })
    }

    function handlePageShow(e: PageTransitionEvent) {
      // BFCache: página restaurada da memória após pagehide (botão voltar do browser).
      // Cookies já foram apagados — força redirect.
      if (e.persisted) {
        window.location.replace('/login')
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

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
