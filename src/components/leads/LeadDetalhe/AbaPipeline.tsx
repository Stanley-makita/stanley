'use client'

import { useLeadHistorico } from '@/hooks/leads/useLeadHistorico'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRight, GitBranch, Plus, History } from 'lucide-react'
import { cn } from '@/lib/utils'

const TIPOS_PIPELINE = ['criacao', 'fase_mudanca']

interface Props { leadId: string }

export function AbaPipeline({ leadId }: Props) {
  const { data: eventos = [], isLoading } = useLeadHistorico(leadId, TIPOS_PIPELINE)

  const eventosOrdenados = [...eventos].reverse()

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Jornada completa do lead pelo funil comercial.
      </p>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-gray-200" />
                <div className="w-px h-12 bg-gray-100 mt-1" />
              </div>
              <div className="flex-1 pb-4">
                <div className="h-16 bg-gray-100 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : eventosOrdenados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <History className="h-8 w-8 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Nenhum evento de pipeline ainda.</p>
        </div>
      ) : (
        <div className="relative">
          {eventosOrdenados.map((evento, idx) => {
            const isUltimo = idx === eventosOrdenados.length - 1
            const isCriacao = evento.tipo === 'criacao'
            const isFaseMudanca = evento.tipo === 'fase_mudanca'
            const dataFormatada = format(new Date(evento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

            return (
              <div key={evento.id} className="flex gap-4 relative">
                {/* Timeline indicator */}
                <div className="flex flex-col items-center shrink-0" style={{ width: 24 }}>
                  <div className={cn(
                    'w-3 h-3 rounded-full border-2 mt-3 z-10',
                    isUltimo
                      ? 'border-[#253B29] bg-[#253B29]'
                      : 'border-gray-300 bg-white'
                  )} />
                  {!isUltimo && <div className="w-px flex-1 bg-gray-200 my-1" />}
                </div>

                {/* Card */}
                <div className={cn(
                  'flex-1 border rounded-xl px-4 py-3 mb-3 transition-all',
                  isUltimo
                    ? 'border-[#E7E0C4] bg-[#F9F7F2]'
                    : 'border-gray-100 bg-white'
                )}>
                  {isCriacao ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#253B29] flex items-center justify-center shrink-0">
                        <Plus className="h-3 w-3 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#253B29]">Lead criado</p>
                        {evento.fase_nova && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Fase inicial:{' '}
                            <span className="font-medium text-gray-600">{evento.fase_nova.nome}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  ) : isFaseMudanca && evento.fase_anterior && evento.fase_nova ? (
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                        <GitBranch className="h-3 w-3 text-gray-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                            {evento.fase_anterior.nome}
                          </span>
                          <ArrowRight className="h-3 w-3 text-gray-400" />
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#253B29] text-white font-medium">
                            {evento.fase_nova.nome}
                          </span>
                        </div>
                        {isUltimo && (
                          <p className="text-xs text-[#C2AA6A] font-medium mt-1">← Fase atual</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">{evento.descricao ?? evento.tipo}</p>
                  )}

                  <p className="text-xs text-gray-400 mt-2">
                    {dataFormatada}
                    {evento.usuario?.nome && (
                      <> · <span className="text-gray-500">{evento.usuario.nome}</span></>
                    )}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
