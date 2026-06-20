'use client'

import { useSolicitacoesAbertasPorProcesso } from '@/hooks/solicitacoes/useSolicitacoesAbertasPorProcesso'
import { Clock } from 'lucide-react'

interface Props {
  processoId: string
  onIrParaSolicitacoes: () => void
}

export function PainelPendencias({ processoId, onIrParaSolicitacoes }: Props) {
  const { data: pendencias = [] } = useSolicitacoesAbertasPorProcesso(processoId)

  if (pendencias.length === 0) return null

  return (
    <div className="bg-white border border-amber-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-fonti-primary">Pendências</span>
        </div>
        <span className="text-xs font-bold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
          {pendencias.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {pendencias.map((p) => (
          <button
            key={p.id}
            onClick={onIrParaSolicitacoes}
            className="w-full text-left flex items-center gap-2 text-xs text-gray-600 hover:text-fonti-primary transition-colors group"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="truncate group-hover:underline">
              Aguardando {p.responsavel?.nome ?? 'responsável'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
