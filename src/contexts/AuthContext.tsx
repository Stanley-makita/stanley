'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { type SessaoUsuario } from '@/types/auth'
import { ABA_ATIVA_KEY, marcarAbaAtiva } from '@/lib/auth/abaSessao'

interface AuthContextValue {
  usuario: SessaoUsuario | null
  carregando: boolean
  saindo: boolean
  sair: () => Promise<void>
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Logout automático só depois de muito tempo parado — usuário só deve ser
// deslogado ao clicar em "Sair", fechar a aba (ver ABA_ATIVA_KEY abaixo) ou
// ficar 12h sem interagir.
const LIMITE_INATIVIDADE_MS = 12 * 60 * 60 * 1000

// Cookie de sessão é compartilhado por todo o navegador, não por aba — ele
// sobrevive ao fechar só esta aba se outras abas/janelas continuarem
// abertas. Para que "fechar a aba" valha como logout, marcamos cada aba
// autenticada no sessionStorage (não sobrevive a fechar a aba, mas
// sobrevive a F5/navegação dentro da mesma aba). Se uma aba nova aparece
// com uma sessão de cookie mas sem essa marca — e não é um login/recuperação
// de senha acontecendo agora nela — é sessão sobrando de aba já fechada.
// A marca em si é setada em LoginForm/RedefinirSenhaPage (ver
// lib/auth/abaSessao.ts) — o evento SIGNED_IN abaixo é só uma rede de
// segurança pra qualquer outro fluxo de login que passe a existir.

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
  // Logout em andamento: o listener onAuthStateChange zera `usuario` assim que
  // SIGNED_OUT é emitido, ainda durante o signOut() — sem esse flag, o
  // RouteGuard vê usuario=null na página protegida atual e mostra "sem
  // permissão" por um instante antes do redirect para /login completar.
  const [saindo, setSaindo] = useState(false)
  const authUserIdRef = useRef<string | null>(null)
  // Evita chamar carregarPerfil no INITIAL_SESSION quando o perfil veio do servidor
  const serverLoadedRef = useRef(initialUser != null)

  const carregarPerfil = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('usuarios')
      .select('id, empresa_id, perfil, perfil_customizado_id, nome, email, ativo')
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
      async (event, session) => {
        if (!active) return

        if (session?.user) {
          const abaJaAtiva = sessionStorage.getItem(ABA_ATIVA_KEY) === '1'
          const eventoDeLoginNestaAba = event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY'

          if (!abaJaAtiva && !eventoDeLoginNestaAba) {
            // Sessão de cookie sobrando de uma aba já fechada — trata como deslogado
            setSaindo(true)
            authUserIdRef.current = null
            serverLoadedRef.current = false
            setUsuario(null)
            setCarregando(false)
            await supabase.auth.signOut()
            window.location.href = '/login'
            return
          }

          marcarAbaAtiva()

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

  // Logout automático por inatividade
  useEffect(() => {
    if (!usuario) return

    let ultimaAtividade = Date.now()
    const registrarAtividade = () => { ultimaAtividade = Date.now() }
    const eventos = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const
    eventos.forEach((evento) => window.addEventListener(evento, registrarAtividade, { passive: true }))

    const intervalo = setInterval(() => {
      if (Date.now() - ultimaAtividade >= LIMITE_INATIVIDADE_MS) {
        sair()
      }
    }, 60_000)

    return () => {
      eventos.forEach((evento) => window.removeEventListener(evento, registrarAtividade))
      clearInterval(intervalo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

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
    setSaindo(true)
    try {
      sessionStorage.removeItem(ABA_ATIVA_KEY)
      await supabase.auth.signOut()
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, saindo, sair, recarregarPerfil }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext deve ser usado dentro de AuthProvider')
  return ctx
}
