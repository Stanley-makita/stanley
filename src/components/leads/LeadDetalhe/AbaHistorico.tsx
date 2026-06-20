'use client'

import { useLeadHistorico } from '@/hooks/leads/useLeadHistorico'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRight, GitBranch, Plus, Edit, History, MessageSquare } from 'lucide-react'

const ICONES = {
  criacao:      Plus,
  fase_mudanca: GitBranch,
  edicao:       Edit,
  comentario:   MessageSquare,
}

const TIPOS_SISTEMA = ['criacao', 'fase_mudanca', 'edicao', 'comentario']

interface Props { leadId: string }

export function AbaHistorico({ leadId }: Props) {
  const { data: eventos = [], isLoading } = useLeadHistorico(leadId, TIPOS_SISTEMA)

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Registro automático de todas as alterações e movimentações deste lead.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-7 h-7 bg-gray-100 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : eventos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <History className="h-8 w-8 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Nenhum evento registrado ainda.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-100" />

          <div className="space-y-3">
            {eventos.map((item) => {
              const tipo = item.tipo as keyof typeof ICONES
              const Icone = ICONES[tipo] ?? Edit

              return (
                <div key={item.id} className="flex gap-3 relative">
                  <div className="w-7 h-7 rounded-full border-2 bg-white border-gray-200 flex items-center justify-center shrink-0 z-10">
                    <Icone className="h-3 w-3 text-fonti-primary" />
                  </div>

                  <div className="flex-1 pb-3">
                    {item.tipo === 'fase_mudanca' && item.fase_anterior && item.fase_nova ? (
                      <p className="text-sm text-gray-600">
                        Movido de{' '}
                        <span className="font-medium text-fonti-primary">{item.fase_anterior.nome}</span>
                        {' '}
                        <ArrowRight className="inline h-3 w-3 text-gray-400" />
                        {' '}
                        <span className="font-medium text-fonti-primary">{item.fase_nova.nome}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600">
                        {item.descricao ?? (item.tipo === 'criacao' ? 'Lead criado' : item.tipo)}
                      </p>
                    )}

                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.usuario?.nome} ·{' '}
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
