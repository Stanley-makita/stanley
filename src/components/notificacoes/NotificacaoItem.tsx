import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bell, CheckSquare, ArrowRight, UserPlus, FileCheck, CreditCard, MessageSquare } from 'lucide-react'
import { Notificacao, TipoNotificacao } from '@/types/notificacoes'
import { cn } from '@/lib/utils'

const ICONES: Record<TipoNotificacao, React.ReactNode> = {
  tarefa_vencida:          <CheckSquare className="w-4 h-4 text-red-500" />,
  tarefa_atribuida:        <CheckSquare className="w-4 h-4 text-blue-500" />,
  fase_avancada:           <ArrowRight className="w-4 h-4 text-[#C2AA6A]" />,
  lead_atribuido:          <UserPlus className="w-4 h-4 text-green-600" />,
  processo_emitido:        <FileCheck className="w-4 h-4 text-[#253B29]" />,
  cobranca_vencida:        <CreditCard className="w-4 h-4 text-red-500" />,
  comentario_mencionado:   <MessageSquare className="w-4 h-4 text-purple-500" />,
  solicitacao_atribuida:   <Bell className="w-4 h-4 text-blue-500" />,
  solicitacao_concluida:   <CheckSquare className="w-4 h-4 text-green-600" />,
  solicitacao_sla_vencido: <Bell className="w-4 h-4 text-red-500" />,
  solicitacao_respondida:  <MessageSquare className="w-4 h-4 text-[#C2AA6A]" />,
  solicitacao_retorno:     <MessageSquare className="w-4 h-4 text-blue-500" />,
}

interface NotificacaoItemProps {
  notificacao: Notificacao
  onClick?: () => void
}

export function NotificacaoItem({ notificacao, onClick }: NotificacaoItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b last:border-b-0',
        !notificacao.lida && 'bg-blue-50/40'
      )}
    >
      {/* Ícone */}
      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-white border flex items-center justify-center shadow-sm">
        {ICONES[notificacao.tipo] ?? <Bell className="w-4 h-4 text-gray-400" />}
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
  )
}