'use client'

import { useRouter } from 'next/navigation'
import { ClipboardList, X } from 'lucide-react'
import { useNotificacoesNaoLidas } from '@/hooks/useNotificacoes'
import { useMarcarNotificacoesLidas } from '@/hooks/useMarcarNotificacoesLidas'

// Mesmo padrão de ChamadasFlutuantes.tsx: solicitação atribuída/devolvida pro
// operacional é fácil de passar batido num toast que some sozinho — o
// destinatário pode estar em outra tela quando ela chega. Fica fixo até o
// usuário abrir a fila ou fechar manualmente, e sobrevive a navegação/F5
// porque lê da lista de notificações não lidas, não só do evento em tempo real.
const JANELA_VALIDADE_MS = 60 * 60 * 1000

export function SolicitacoesFlutuantes() {
  const router = useRouter()
  const naoLidas = useNotificacoesNaoLidas()
  const { mutate: marcarLidas } = useMarcarNotificacoesLidas()

  const solicitacoes = naoLidas
    .filter((n) => n.tipo === 'solicitacao_atribuida' || n.tipo === 'solicitacao_retorno')
    .filter((n) => Date.now() - new Date(n.criado_em).getTime() < JANELA_VALIDADE_MS)

  if (solicitacoes.length === 0) return null

  // Sem wrapper `fixed` próprio — empilhado junto com ChamadasFlutuantes num único
  // container posicionado em ProtectedShell (ver FlutuantesContainer).
  return (
    <>
      {solicitacoes.map((solicitacao) => (
        <div
          key={solicitacao.id}
          className="relative overflow-hidden rounded-lg border border-blue-200 bg-white shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300"
        >
          <div className="flex items-start gap-3 p-3 pr-8">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{solicitacao.titulo}</p>
              {solicitacao.mensagem && (
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{solicitacao.mensagem}</p>
              )}
              <button
                onClick={() => {
                  marcarLidas([solicitacao.id])
                  router.push('/operacional')
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Ver solicitação
              </button>
            </div>
          </div>

          <button
            onClick={() => marcarLidas([solicitacao.id])}
            className="absolute right-2 top-2 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </>
  )
}
