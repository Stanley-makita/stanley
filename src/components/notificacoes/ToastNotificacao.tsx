'use client'

import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { NOTIFICACAO_META, type Notificacao, type Severidade } from '@/types/notificacoes'
import { resolverRotaNotificacao } from '@/lib/notificacoes/navegarNotificacao'

const SEVERIDADE_BARRA: Record<Severidade, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
  critical: 'bg-danger',
}

const SEVERIDADE_ICONE_FUNDO: Record<Severidade, string> = {
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-danger/10 text-danger',
  critical: 'bg-danger/10 text-danger ring-2 ring-danger/40',
}

interface ToastNotificacaoProps {
  toastId: string | number
  notificacao: Notificacao
  duracaoMs: number
}

/**
 * Card de toast usado via `toast.custom()` do sonner — canto superior
 * direito, ícone+cor por severidade, corpo inteiro clicável (navega para a
 * entidade e fecha o toast), barra de progresso (ausente quando a duração é
 * Infinity, caso de severidade `critical`, que não fecha sozinho).
 */
export function ToastNotificacao({ toastId, notificacao, duracaoMs }: ToastNotificacaoProps) {
  const router = useRouter()
  const meta = NOTIFICACAO_META[notificacao.tipo]
  const Icon = meta.icon
  const rota = resolverRotaNotificacao(notificacao.entidade, notificacao.entidade_id)

  function abrir() {
    if (rota) router.push(rota)
    toast.dismiss(toastId)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') abrir() }}
      className="relative w-[360px] max-w-[calc(100vw-2rem)] cursor-pointer overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg animate-in slide-in-from-right-8 fade-in duration-300"
    >
      <div className="flex items-start gap-3 p-4 pr-8">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', SEVERIDADE_ICONE_FUNDO[notificacao.severidade])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{notificacao.titulo}</p>
          {notificacao.mensagem && (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{notificacao.mensagem}</p>
          )}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); toast.dismiss(toastId) }}
        className="absolute right-2 top-2 text-gray-400 transition-colors hover:text-gray-600"
        aria-label="Fechar"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {Number.isFinite(duracaoMs) && (
        <div className="h-1 w-full bg-gray-100">
          <div
            className={cn('h-full', SEVERIDADE_BARRA[notificacao.severidade])}
            style={{ animation: `fonti-toast-progress ${duracaoMs}ms linear forwards` }}
          />
        </div>
      )}
    </div>
  )
}
