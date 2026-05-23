'use client'

import { useState } from 'react'
import { useProcessoComentarios, useAdicionarComentario } from '@/hooks/processos/useProcessoComentarios'
import { type ProcessoComentario } from '@/types/processos'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Bell, Send } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const TIPOS_COMENTARIO: Record<ProcessoComentario['tipo'], { label: string; className: string }> = {
  observacao:  { label: 'Observação',  className: 'bg-gray-100 text-gray-600' },
  alteracao:   { label: 'Alteração',   className: 'bg-amber-100 text-amber-700' },
  solicitacao: { label: 'Solicitação', className: 'bg-blue-100 text-blue-700' },
}

interface Props { processoId: string }

export function PainelComentarios({ processoId }: Props) {
  const { data: comentarios = [] } = useProcessoComentarios(processoId)
  const adicionarComentario = useAdicionarComentario(processoId)

  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<ProcessoComentario['tipo']>('observacao')
  const [notificar, setNotificar] = useState(false)

  async function enviar() {
    if (!texto.trim()) return
    await adicionarComentario.mutateAsync({ tipo, texto, notificar_cliente: notificar })
    setTexto('')
    setNotificar(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#253B29]">Comentários</h3>
        <span className="text-xs text-gray-400">{comentarios.length}</span>
      </div>

      {/* Formulário de comentário */}
      <div className="space-y-2 mb-4">
        <Textarea
          placeholder="Escreva um comentário..."
          rows={3}
          className="resize-none text-sm"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />

        <div className="flex items-center justify-between gap-2">
          <Select value={tipo} onValueChange={(v) => setTipo(v as ProcessoComentario['tipo'])}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="observacao">Observação</SelectItem>
              <SelectItem value="alteracao">Alteração</SelectItem>
              <SelectItem value="solicitacao">Solicitação</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNotificar(!notificar)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                notificar
                  ? 'bg-[#E7E0C4] border-[#C2AA6A] text-[#253B29]'
                  : 'border-gray-200 text-gray-400'
              }`}
            >
              <Bell className="h-3 w-3" />
              Notificar cliente
            </button>

            <Button
              size="sm"
              className="h-8 bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5"
              onClick={enviar}
              disabled={!texto.trim() || adicionarComentario.isPending}
            >
              <Send className="h-3 w-3" />
              Enviar
            </Button>
          </div>
        </div>
      </div>

      {/* Lista de comentários */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {comentarios.map((c) => {
          const config = TIPOS_COMENTARIO[c.tipo]
          return (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#253B29]">
                    {c.usuario?.nome ?? 'Sistema'}
                  </span>
                  <Badge className={`text-xs px-1.5 py-0 ${config.className}`}>
                    {config.label}
                  </Badge>
                  {c.notificar_cliente && (
                    <Bell className="h-3 w-3 text-[#C2AA6A]" />
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5">{c.texto}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}