import { CentralNotificacoesConteudo } from '@/components/notificacoes/CentralNotificacoesConteudo'

export default function NotificacoesPage() {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-fonti-primary">Notificações</h1>
        <p className="text-sm text-gray-500 mt-0.5">Alertas e atualizações do sistema</p>
      </div>
      <CentralNotificacoesConteudo variante="pagina" />
    </div>
  )
}
