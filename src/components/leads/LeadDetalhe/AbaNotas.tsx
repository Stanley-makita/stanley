'use client'

import { useState } from 'react'
import { useLeadHistorico } from '@/hooks/leads/useLeadHistorico'
import { useRegistrarInteracao } from '@/hooks/leads/useRegistrarInteracao'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props { leadId: string }

export function AbaNotas({ leadId }: Props) {
  const { data: notas = [], isLoading } = useLeadHistorico(leadId, ['comentario'])
  const registrar = useRegistrarInteracao(leadId)
  const [texto, setTexto] = useState('')

  async function handleEnviar() {
    const nota = texto.trim()
    if (!nota) return
    await registrar.mutateAsync(nota)
    setTexto('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleEnviar()
    }
  }

  return (
    <div className="space-y-4">

      {/* Input */}
      <div className="bg-white rounded-xl border border-[#E7E0C4] p-3">
        <Textarea
          placeholder="Registre o que aconteceu: ligação, mensagem, reunião, follow-up..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          className="text-sm resize-none border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
        />
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">Ctrl + Enter para enviar</p>
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
            onClick={handleEnviar}
            disabled={!texto.trim() || registrar.isPending}
          >
            {registrar.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Send className="h-3 w-3" />
            }
            Registrar
          </Button>
        </div>
      </div>

      {/* Lista de notas */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-7 h-7 bg-gray-100 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-14 bg-gray-100 rounded-lg" />
                <div className="h-2.5 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : notas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <MessageSquare className="h-8 w-8 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400 font-medium">Nenhuma nota registrada ainda</p>
          <p className="text-xs text-gray-300 mt-1">Use o campo acima para registrar uma interação</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notas.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-[#253B29] flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquare className="h-3 w-3 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-white border border-[#E7E0C4] rounded-xl px-3.5 py-2.5 shadow-sm">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {item.descricao}
                  </p>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 ml-1">
                  <span className="font-medium text-gray-500">{item.usuario?.nome}</span>
                  {' · '}
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
