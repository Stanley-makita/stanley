import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bell, Trash2 } from 'lucide-react'
import { Notificacao, NOTIFICACAO_META } from '@/types/notificacoes'
import { cn } from '@/lib/utils'
import { useExcluirNotificacao } from '@/hooks/useExcluirNotificacao'

interface NotificacaoItemProps {
  notificacao: Notificacao
  onClick?: () => void
}

export function NotificacaoItem({ notificacao, onClick }: NotificacaoItemProps) {
  const { mutate: excluir, isPending: excluindo } = useExcluirNotificacao()
  const meta = NOTIFICACAO_META[notificacao.tipo]
  const Icon = meta?.icon ?? Bell

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50',
        !notificacao.lida && 'bg-blue-50/40'
      )}
    >
      <button onClick={onClick} className="flex flex-1 items-start gap-3 text-left min-w-0">
        {/* Ícone */}
        <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-white border flex items-center justify-center shadow-sm">
          <Icon className={cn('w-4 h-4', meta?.cor ?? 'text-gray-400')} />
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm leading-snug', !notificacao.lida && 'font-semibold text-gray-900', notificacao.lida && 'text-gray-700')}>
            {notificacao.titulo}
          </p>
          {notificacao.mensagem && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{notificacao.mensagem}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {formatDistanceToNow(new Date(notificacao.criado_em), { addSuffix: true, locale: ptBR })}
          </p>
        </div>

        {/* Bolinha de não lida */}
        {!notificacao.lida && (
          <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-blue-500" />
        )}
      </button>

      {/* Excluir — aparece no hover, não dispara a navegação do item */}
      <button
        onClick={(e) => { e.stopPropagation(); excluir(notificacao.id) }}
        disabled={excluindo}
        aria-label="Excluir notificação"
        className="mt-0.5 shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
