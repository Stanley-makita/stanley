'use client'

import { PhoneCall, X, Phone } from 'lucide-react'
import { useNotificacoesNaoLidas } from '@/hooks/useNotificacoes'
import { useMarcarNotificacoesLidas } from '@/hooks/useMarcarNotificacoesLidas'
import { ligarViaSip } from '@/lib/telefonia/ligarViaSip'

// Chamada recebida (WhatsApp ou MicroSIP) não tem áudio disponível dentro do
// Fonti (WhatsApp via Uazapi só sinaliza, não estabelece voz — ver PR #131),
// então em vez de um toast que some sozinho e pode passar despercebido (ex.:
// atendente longe da tela no momento em que chega), mantém um card fixo até
// o atendente fechar ou retornar a ligação — sobrevive a navegação/F5 porque
// lê direto da lista de notificações não lidas, não só do evento em tempo real.
const JANELA_VALIDADE_MS = 30 * 60 * 1000

export function ChamadasFlutuantes() {
  const naoLidas = useNotificacoesNaoLidas()
  const { mutate: marcarLidas } = useMarcarNotificacoesLidas()

  const chamadas = naoLidas
    .filter((n) => n.tipo === 'chamada_recebida')
    .filter((n) => Date.now() - new Date(n.criado_em).getTime() < JANELA_VALIDADE_MS)

  if (chamadas.length === 0) return null

  // Sem wrapper `fixed` próprio — empilhado junto com SolicitacoesFlutuantes num
  // único container posicionado em ProtectedShell (ver FlutuantesContainer).
  return (
    <>
      {chamadas.map((chamada) => (
        <div
          key={chamada.id}
          className="relative overflow-hidden rounded-lg border border-green-200 bg-white shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300"
        >
          <div className="flex items-start gap-3 p-3 pr-8">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
              <Phone className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{chamada.titulo}</p>
              {chamada.mensagem && (
                <p className="mt-0.5 text-xs text-gray-500">{chamada.mensagem}</p>
              )}
              <button
                onClick={() => {
                  ligarViaSip(chamada.mensagem!)
                  // Adia a marcação como lida (que remove o card da tela) — o repasse do
                  // tel: pro MicroSIP é assíncrono no nível do SO/navegador; desmontar o
                  // elemento que disparou o clique enquanto isso ainda está em andamento
                  // interrompe a entrega do número (MicroSIP abre, mas o campo fica vazio).
                  setTimeout(() => marcarLidas([chamada.id]), 500)
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                Retornar ligação
              </button>
            </div>
          </div>

          <button
            onClick={() => marcarLidas([chamada.id])}
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
