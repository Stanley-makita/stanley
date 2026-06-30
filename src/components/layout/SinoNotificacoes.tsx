'use client'

import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotificacoes } from '@/hooks/useNotificacoes'
import { useMarcarTodasLidas, useMarcarNotificacoesLidas } from '@/hooks/useMarcarNotificacoesLidas'
import { NotificacaoItem } from '@/components/notificacoes/NotificacaoItem'
import { resolverRotaNotificacao } from '@/lib/notificacoes/navegarNotificacao'

export function SinoNotificacoes() {
  const router = useRouter()
  const { data: notificacoes = [] } = useNotificacoes(15)
  const { mutate: marcarTodas } = useMarcarTodasLidas()
  const { mutate: marcarLidas } = useMarcarNotificacoesLidas()

  const naoLidas = notificacoes.filter((n) => !n.lida)

  function handleClick(notificacaoId: string, entidade: string | null, entidadeId: string | null) {
    marcarLidas([notificacaoId])
    const rota = resolverRotaNotificacao(entidade, entidadeId)
    if (rota) {
      router.push(rota)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-gray-600" />
          {naoLidas.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {naoLidas.length > 99 ? '99+' : naoLidas.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[360px] p-0 shadow-lg" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-fonti-primary text-white rounded-t-md">
          <span className="font-semibold text-sm">Notificações</span>
          {naoLidas.length > 0 && (
            <button
              onClick={() => marcarTodas()}
              className="text-xs text-fonti-accent hover:text-fonti-accent-hover transition-colors"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        {/* Lista */}
        <div className="max-h-[420px] overflow-y-auto">
          {notificacoes.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              Nenhuma notificação ainda
            </div>
          ) : (
            notificacoes.map((n) => (
              <NotificacaoItem
                key={n.id}
                notificacao={n}
                onClick={() => handleClick(n.id, n.entidade, n.entidade_id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-gray-50 rounded-b-md">
          <button
            onClick={() => router.push('/notificacoes')}
            className="w-full text-center text-xs text-fonti-primary hover:text-fonti-accent font-medium transition-colors"
          >
            Ver todas as notificações →
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}