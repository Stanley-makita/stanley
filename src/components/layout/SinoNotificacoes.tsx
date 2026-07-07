'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useNotificacoesNaoLidas } from '@/hooks/useNotificacoes'
import { CentralNotificacoesConteudo } from '@/components/notificacoes/CentralNotificacoesConteudo'

export function SinoNotificacoes() {
  const [aberto, setAberto] = useState(false)
  const naoLidas = useNotificacoesNaoLidas()

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-gray-600" />
          {naoLidas.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {naoLidas.length > 99 ? '99+' : naoLidas.length}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full max-w-sm flex-col p-0 sm:max-w-md">
        <SheetTitle className="sr-only">Central de Notificações</SheetTitle>
        <CentralNotificacoesConteudo variante="drawer" onFechar={() => setAberto(false)} />
      </SheetContent>
    </Sheet>
  )
}
