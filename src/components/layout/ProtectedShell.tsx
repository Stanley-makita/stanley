'use client'

import { useState, type ReactNode } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

export function ProtectedShell({ children }: { children: ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar className="hidden lg:flex" />

      <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
        <SheetContent side="left" className="w-72 max-w-[85vw] overflow-hidden border-0 bg-fonti-primary p-0 text-white">
          <SheetTitle className="sr-only">Menu principal</SheetTitle>
          <Sidebar className="min-h-full w-full" onNavigate={() => setMenuAberto(false)} />
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
