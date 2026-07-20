'use client'

import { History } from 'lucide-react'
import { useImovelAvaliacoes } from '@/hooks/imoveis/useImovelAvaliacoes'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function formatarMoeda(v: number | null | undefined) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

interface Props {
  imovelId: string | null | undefined
}

export function AvaliacoesEngenhariaImovel({ imovelId }: Props) {
  const { data: avaliacoes = [] } = useImovelAvaliacoes(imovelId)

  if (!imovelId) return null

  return (
    <div className="border-t border-gray-200 pt-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <History className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-500">Avaliações de Engenharia</span>
      </div>
      {avaliacoes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Nenhuma avaliação registrada</p>
      ) : (
        <div className="space-y-1.5">
          {avaliacoes.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <span>
                {format(new Date(a.criado_em), "dd/MM/yyyy", { locale: ptBR })}
                {a.processo?.numero_processo && (
                  <span className="text-gray-400 ml-1">· {a.processo.numero_processo}</span>
                )}
              </span>
              <span className="font-semibold text-fonti-primary">{formatarMoeda(a.valor_avaliado)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
