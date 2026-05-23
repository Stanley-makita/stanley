import { ListaNotificacoes } from '@/components/notificacoes/ListaNotificacoes'

export default function NotificacoesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#253B29]">Notificações</h1>
        <p className="text-sm text-gray-500 mt-0.5">Alertas e atualizações do sistema</p>
      </div>
      <ListaNotificacoes />
    </div>
  )
}