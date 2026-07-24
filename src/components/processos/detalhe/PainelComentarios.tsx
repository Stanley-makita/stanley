'use client'

import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProcessoComentarios, useAdicionarComentario } from '@/hooks/processos/useProcessoComentarios'
import { type ProcessoComentario } from '@/types/processos'
import { useAuth } from '@/hooks/auth/useAuth'
import { useAnexosPendentes } from '@/hooks/documentos/useAnexosPendentes'
import { anexarDocumentoEntidade } from '@/lib/documentos/anexoEntidade'
import { AnexoChipEnviado, AnexoChipPendente } from '@/components/documentos/AnexoChip'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Bell, Send, MessageSquare, Paperclip } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { parseCabecalhoComunicacao, LABEL_TIPO_INTERESSADO_TIMELINE } from '@/lib/comunicacao/parseCabecalhoComunicacao'
import { toast } from 'sonner'

const TIPOS_COMENTARIO: Record<ProcessoComentario['tipo'], { label: string; className: string }> = {
  observacao:          { label: 'Observação',        className: 'bg-gray-100 text-gray-600' },
  alteracao:           { label: 'Alteração',         className: 'bg-amber-100 text-amber-700' },
  solicitacao:         { label: 'Solicitação',        className: 'bg-blue-100 text-blue-700' },
  comunicacao_cliente: { label: 'Mensagem ao cliente', className: 'bg-green-100 text-green-700' },
}

interface Props { processoId: string }

function ListaComentarios({ comentarios }: { comentarios: ProcessoComentario[] }) {
  return (
    <div className="space-y-3">
      {comentarios.map((c) => {
        const config = TIPOS_COMENTARIO[c.tipo]
        const comunicacaoParsed = c.tipo === 'comunicacao_cliente' ? parseCabecalhoComunicacao(c.texto) : null
        const label = comunicacaoParsed
          ? `Mensagem ao ${LABEL_TIPO_INTERESSADO_TIMELINE[comunicacaoParsed.tipo]}`
          : config.label
        return (
          <div key={c.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fonti-primary">
                  {c.usuario?.nome ?? 'Sistema'}
                </span>
                <Badge className={`text-xs px-1.5 py-0 ${config.className}`}>
                  {label}
                </Badge>
                {c.notificar_cliente && (
                  <Bell className="h-3 w-3 text-fonti-accent" />
                )}
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
              </span>
            </div>
            {/* Comentário criado só pra carregar anexo (sem texto real) — não
                repete um "Anexo" redundante ao lado do próprio anexo. */}
            {!(c.texto === 'Anexo' && c.anexos && c.anexos.length > 0) && (
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5">
                {comunicacaoParsed ? comunicacaoParsed.mensagem : c.texto}
              </p>
            )}
            {c.anexos && c.anexos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {c.anexos.map((anexo) => (
                  <AnexoChipEnviado key={anexo.id} anexo={anexo} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FormComentario({
  processoId,
  onSent,
}: {
  processoId: string
  onSent?: () => void
}) {
  const adicionarComentario = useAdicionarComentario(processoId)
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<ProcessoComentario['tipo']>('observacao')
  const [notificar, setNotificar] = useState(false)
  const [enviandoAnexos, setEnviandoAnexos] = useState(false)
  const anexos = useAnexosPendentes()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function enviar() {
    if (!texto.trim() && anexos.pendentes.length === 0) return

    const comentarioId = await adicionarComentario.mutateAsync({
      tipo, texto: texto || 'Anexo', notificar_cliente: notificar,
    })
    setTexto('')
    setNotificar(false)
    onSent?.()

    if (anexos.pendentes.length > 0 && usuario) {
      setEnviandoAnexos(true)
      try {
        for (const { arquivo } of anexos.pendentes) {
          await anexarDocumentoEntidade(arquivo, {
            empresaId: usuario.empresa_id,
            usuarioId: usuario.id,
            entidadeTipo: 'processo_comentario',
            entidadeId: comentarioId,
            processoId,
          })
        }
        anexos.limpar()
        qc.invalidateQueries({ queryKey: ['processos', processoId, 'comentarios'] })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao anexar arquivo.')
      } finally {
        setEnviandoAnexos(false)
      }
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Escreva um comentário... (cole um print ou anexe um arquivo)"
        rows={3}
        className="resize-none text-sm"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onPaste={anexos.onPaste}
      />
      {anexos.pendentes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {anexos.pendentes.map((p, i) => (
            <AnexoChipPendente
              key={i}
              arquivo={p.arquivo}
              previewUrl={p.previewUrl}
              onRemover={() => anexos.remover(i)}
              enviando={enviandoAnexos}
            />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select value={tipo} onValueChange={(v) => setTipo(v as ProcessoComentario['tipo'])}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="observacao">Observação</SelectItem>
              <SelectItem value="alteracao">Alteração</SelectItem>
              <SelectItem value="solicitacao">Solicitação</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            title="Anexar arquivo"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 text-gray-400 hover:text-fonti-primary"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              Array.from(e.target.files ?? []).forEach(anexos.adicionar)
              e.target.value = ''
            }}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setNotificar(!notificar)}
            className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
              notificar
                ? 'bg-fonti-accent-hover border-fonti-accent text-fonti-primary'
                : 'border-gray-200 text-gray-400'
            }`}
          >
            <Bell className="h-3 w-3" />
            Notificar cliente
          </button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-fonti-primary text-white hover:bg-fonti-primary-hover"
            onClick={enviar}
            disabled={(!texto.trim() && anexos.pendentes.length === 0) || adicionarComentario.isPending || enviandoAnexos}
          >
            <Send className="h-3 w-3" />
            Enviar
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PainelComentarios({ processoId }: Props) {
  const { data: comentarios = [] } = useProcessoComentarios(processoId)
  const [dialogAberto, setDialogAberto] = useState(false)

  return (
    <div className="p-5 space-y-4 flex flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
        <MessageSquare className="h-4 w-4 text-fonti-primary" />
        <span className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Comentários</span>
        {comentarios.length > 0 && (
          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">{comentarios.length}</span>
        )}
      </div>

      {/* Formulário de comentário */}
      <FormComentario processoId={processoId} />

      {/* Lista com altura limitada */}
      <div className="max-h-[260px] overflow-y-auto">
        <ListaComentarios comentarios={comentarios} />
      </div>

      {/* Botão ver todos — aparece a partir de 1 comentário, não só quando a lista já não cabe */}
      {comentarios.length > 0 && (
        <button
          type="button"
          onClick={() => setDialogAberto(true)}
          className="mt-3 flex items-center gap-1.5 text-xs text-fonti-primary hover:underline self-start"
        >
          <MessageSquare className="h-3 w-3" />
          Ver {comentarios.length === 1 ? 'o comentário' : `todos os ${comentarios.length} comentários`}
        </button>
      )}

      {/* Dialog com histórico completo */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-fonti-primary">
              Todos os comentários ({comentarios.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormComentario processoId={processoId} />
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <ListaComentarios comentarios={comentarios} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
