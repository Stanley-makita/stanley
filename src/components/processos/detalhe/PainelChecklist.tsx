'use client'

import { useEffect } from 'react'
import { ClipboardCheck, User } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  useChecklistTemplate,
  useChecklistExecucoes,
  useMarcarChecklistItem,
} from '@/hooks/processos/useChecklist'

interface Props {
  processoId: string
  faseId: string | null | undefined
  onPendenciasChange: (hasPendencias: boolean) => void
}

export function PainelChecklist({ processoId, faseId, onPendenciasChange }: Props) {
  const { data: tmpl, isLoading: tmplLoading } = useChecklistTemplate(faseId)
  const { data: execucoes = [], isLoading: execLoading } = useChecklistExecucoes(processoId)
  const marcar = useMarcarChecklistItem(processoId)

  const itens = tmpl?.itens ?? []
  const marcadosSet = new Set(execucoes.filter(e => e.marcado).map(e => e.item_id))

  const obrigatoriosPendentes = itens.filter(i => i.obrigatorio && !marcadosSet.has(i.id)).length
  const totalObrigatorios     = itens.filter(i => i.obrigatorio).length

  // Notificar o pai sempre que mudar
  useEffect(() => {
    onPendenciasChange(obrigatoriosPendentes > 0)
  }, [obrigatoriosPendentes, onPendenciasChange])

  const isLoading = tmplLoading || execLoading

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-[#253B29]" />
          <span className="text-sm font-semibold text-[#253B29]">Checklist da fase</span>
        </div>
        {!isLoading && itens.length > 0 && (
          obrigatoriosPendentes > 0 ? (
            <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded-full">
              {obrigatoriosPendentes}/{totalObrigatorios} pendente{obrigatoriosPendentes > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-xs bg-green-100 text-green-600 font-medium px-1.5 py-0.5 rounded-full">
              ✓ Completo
            </span>
          )
        )}
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : !faseId || itens.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">
          {!faseId
            ? 'Processo sem fase definida.'
            : 'Nenhum item configurado para esta fase.'}
        </p>
      ) : (
        <div className="space-y-2">
          {itens.map((item) => {
            const checked = marcadosSet.has(item.id)
            const execucao = execucoes.find(e => e.item_id === item.id && e.marcado)

            return (
              <div key={item.id} className="group">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => marcar.mutate({ itemId: item.id, marcado: !checked })}
                    disabled={marcar.isPending}
                    className="mt-0.5 h-3.5 w-3.5 rounded accent-[#253B29] shrink-0 cursor-pointer"
                  />
                  <span className={`text-xs leading-relaxed flex-1 ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {item.descricao}
                    {item.obrigatorio && (
                      <span className="ml-1 text-red-500 font-bold" title="Obrigatório">*</span>
                    )}
                  </span>
                </label>
                {/* Quem marcou e quando */}
                {execucao?.usuario && execucao.marcado_em && (
                  <p className="text-[10px] text-gray-400 ml-6 mt-0.5 flex items-center gap-1">
                    <User className="h-2.5 w-2.5 shrink-0" />
                    {(execucao.usuario as any).nome} ·{' '}
                    {format(new Date(execucao.marcado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
            )
          })}
          <p className="text-[10px] text-gray-400 pt-1">
            <span className="text-red-500">*</span> Obrigatórios para avançar de fase
          </p>
        </div>
      )}
    </div>
  )
}
