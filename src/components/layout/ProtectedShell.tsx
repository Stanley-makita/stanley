'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

export function ProtectedShell({ children, initialLogoUrl }: { children: ReactNode; initialLogoUrl?: string | null }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

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
          {children}
        </main>
      </div>
    </div>
  )
}
