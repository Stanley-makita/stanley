'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { urlBase64ToUint8Array } from '@/lib/push/vapid'

type Estado =
  | 'verificando'
  | 'sem_suporte'
  | 'ios_nao_instalado'
  | 'pode_ativar'
  | 'negado'
  | 'ativo'

// Detecta iOS pelo user agent — não há uma API melhor pra isso; `navigator.userAgentData`
// não cobre Safari/iOS. Falso-positivo em iPadOS com user agent "de desktop" é aceitável
// aqui (o iPad também exige instalação como PWA pra push, mesma regra).
function ehIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

// iOS só entrega push dentro do PWA instalado na Tela de Início — pedir
// Notification.requestPermission() numa aba comum do Safari falha sem
// nenhum aviso claro pro usuário, então detectamos e explicamos antes.
function estaInstaladoComoPWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

/**
 * "Ativar notificações neste dispositivo" — opt-in explícito (nunca pede
 * permissão sozinho ao abrir o Fonti). Vive no rodapé do drawer do sino
 * (CentralNotificacoesConteudo, variante 'drawer'), único lugar onde este
 * componente é montado hoje.
 */
export function PushOptIn() {
  const [estado, setEstado] = useState<Estado>('verificando')
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    async function checar() {
      if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setEstado('sem_suporte')
        return
      }
      if (ehIOS() && !estaInstaladoComoPWA()) {
        setEstado('ios_nao_instalado')
        return
      }
      if (Notification.permission === 'denied') {
        setEstado('negado')
        return
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        setEstado(subscription ? 'ativo' : 'pode_ativar')
      } catch {
        setEstado('pode_ativar')
      }
    }
    checar()
  }, [])

  async function ativar() {
    setProcessando(true)
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY não configurada')
        setEstado('sem_suporte')
        return
      }

      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        setEstado(permissao === 'denied' ? 'negado' : 'pode_ativar')
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      const { data: { session } } = await supabase.auth.getSession()
      const json = subscription.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      })
      if (!res.ok) throw new Error('Falha ao registrar no servidor')

      setEstado('ativo')
    } catch (err) {
      console.error('[push] erro ao ativar notificações:', err)
    } finally {
      setProcessando(false)
    }
  }

  if (estado === 'verificando' || estado === 'sem_suporte') return null

  if (estado === 'ios_nao_instalado') {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
        <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Pra receber notificações no iPhone, adicione o Fonti à Tela de Início primeiro (Compartilhar → Adicionar à Tela de Início).</span>
      </div>
    )
  }

  if (estado === 'negado') {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
        <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Notificações bloqueadas nas configurações do navegador. Ative manualmente e recarregue a página.</span>
      </div>
    )
  }

  if (estado === 'ativo') {
    return (
      <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-gray-400">
        <BellRing className="h-3.5 w-3.5 shrink-0 text-fonti-primary" />
        Notificações ativas neste dispositivo
      </div>
    )
  }

  return (
    <div className="space-y-1.5 rounded-lg bg-fonti-accent-hover/30 px-3 py-2.5">
      <p className="text-[11px] text-gray-600">
        Receba avisos de novas mensagens, processos e tarefas mesmo quando o Fonti estiver fechado.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={processando}
        onClick={ativar}
        className="h-7 gap-1.5 text-xs"
      >
        {processando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
        Ativar notificações
      </Button>
    </div>
  )
}
