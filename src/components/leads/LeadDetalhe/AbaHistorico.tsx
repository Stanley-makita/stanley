'use client'

import { useLeadHistorico } from '@/hooks/leads/useLeadHistorico'
import { History } from 'lucide-react'
import { ConteudoEventoLead, iconeEventoLead } from './EventoLead'

interface Props { leadId: string }

export function AbaHistorico({ leadId }: Props) {
  const { data: eventos = [], isLoading } = useLeadHistorico(leadId)

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Linha do tempo consolidada com alterações, simulações, documentos e solicitações deste lead.
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
              const Icone = iconeEventoLead(item)
              return (
                <div key={`${item.kind}-${item.id}`} className="flex gap-3 relative">
                  <div className="w-7 h-7 rounded-full border-2 bg-white border-gray-200 flex items-center justify-center shrink-0 z-10">
                    <Icone className="h-3 w-3 text-fonti-primary" />
                  </div>
                  <div className="flex-1 pb-3">
                    <ConteudoEventoLead item={item} />
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
