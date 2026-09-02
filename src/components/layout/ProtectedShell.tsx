'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { RouteGuard } from '@/components/layout/RouteGuard'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ChamadasFlutuantes } from '@/components/notificacoes/ChamadasFlutuantes'
import { SolicitacoesFlutuantes } from '@/components/notificacoes/SolicitacoesFlutuantes'
import { useNotificacoesRealtimeSync } from '@/hooks/useNotificacoes'

export function ProtectedShell({ children, initialLogoUrl }: { children: ReactNode; initialLogoUrl?: string | null }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Assina o canal realtime de notificações uma única vez por sessão (ver
  // useNotificacoesRealtimeSync) — não fazer isso aqui e deixar cada consumidor
  // (Sino, ChamadasFlutuantes, central) assinar por conta própria foi o que causava
  // eventos em tempo real pararem de chegar depois do primeiro.
  useNotificacoesRealtimeSync()

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', String(!v))
      return !v
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F5F0]">
      <Sidebar
        className="hidden lg:flex"
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        initialLogoUrl={initialLogoUrl}
      />

      <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
        <SheetContent side="left" className="w-72 max-w-[85vw] overflow-hidden border-0 bg-fonti-primary p-0 text-white">
          <SheetTitle className="sr-only">Menu principal</SheetTitle>
          <Sidebar className="h-full w-full" onNavigate={() => setMenuAberto(false)} initialLogoUrl={initialLogoUrl} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMenuAberto(true)} />
        <main className="flex-1 overflow-y-auto">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>

      {/* Container único das notificações flutuantes (chamada + solicitação) — cada
          componente só renderiza seus próprios cards, o empilhamento/posição fica
          aqui pra eles nunca se sobreporem quando os dois aparecem ao mesmo tempo. */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]">
        <ChamadasFlutuantes />
        <SolicitacoesFlutuantes />
      </div>
    </div>
  )
}
