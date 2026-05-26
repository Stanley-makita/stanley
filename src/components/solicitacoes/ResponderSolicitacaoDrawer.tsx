'use client'

import { useRef, useState, useEffect } from 'react'
import { useResponderSolicitacao } from '@/hooks/solicitacoes/useResponderSolicitacao'
import { useDocumentosConversa } from '@/hooks/solicitacoes/useDocumentosConversa'
import { useSolicitacaoMensagens } from '@/hooks/solicitacoes/useSolicitacaoMensagens'
import { useAuth } from '@/hooks/auth/useAuth'
import { MensagemBubble } from './MensagemBubble'
import { SolicitacaoPrioridadeBadge } from './SolicitacaoPrioridadeBadge'
import { SolicitacaoStatusBadge } from './SolicitacaoStatusBadge'
import { SlaCountdown } from './SlaCountdown'
import { TIPO_LABELS, type SolicitacaoOperacional, type StatusSolicitacao } from '@/types/solicitacoes-operacionais'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileText, Image as ImageIcon, Volume2, Paperclip, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface Props {
  solicitacao: SolicitacaoOperacional | null
  onFechar: () => void
}

const STATUS_OPCOES: { value: StatusSolicitacao; label: string }[] = [
  { value: 'em_andamento',         label: 'Em andamento' },
  { value: 'aguardando_resposta',  label: 'Aguardando resposta' },
  { value: 'aguardando_cliente',   label: 'Aguardando cliente' },
  { value: 'concluido',            label: 'Concluído' },
]

export function ResponderSolicitacaoDrawer({ solicitacao: s, onFechar }: Props) {
  const router = useRouter()
  const { usuario } = useAuth()
  const responder = useResponderSolicitacao()
  const { data: documentos = [], isLoading: docsLoading } = useDocumentosConversa(s?.conversa_id)
  const { data: mensagens = [] } = useSolicitacaoMensagens(
    s?.retorno_operacional ? s?.id : undefined
  )
  const mostrarReplicaLegada = !!s?.replica_comercial && mensagens.length === 0
  const [retorno, setRetorno] = useState('')
  const [status, setStatus] = useState<StatusSolicitacao | ''>('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sincroniza state quando a solicitação selecionada muda
  useEffect(() => {
    if (!s) return
    setRetorno(s.retorno_operacional ?? '')
    setStatus(STATUS_OPCOES.some((o) => o.value === s.status) ? s.status : '')
    setArquivo(null)
  }, [s?.id])

  if (!s) return null

  async function handleSalvar() {
    if (!s || !status) return
    setSalvando(true)
    try {
      let anexoPath: string | undefined
      if (arquivo) {
        const path = `${s.empresa_id}/solicitacoes/${s.id}/${Date.now()}_${arquivo.name}`
        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(path, arquivo, { upsert: false })
        if (uploadError) throw uploadError
        anexoPath = path
      }
      await responder.mutateAsync({
        id: s.id,
        retorno_operacional: retorno,
        status: status as StatusSolicitacao,
        ...(anexoPath !== undefined && { anexo_retorno_path: anexoPath }),
      })
      setArquivo(null)
      onFechar()
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err)
      console.error('[ResponderDrawer]', err)
      toast.error(`Erro: ${msg}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg w-full flex flex-col gap-0 p-0 max-h-[90vh]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">{TIPO_LABELS[s.tipo]}</span>
            <SolicitacaoPrioridadeBadge prioridade={s.prioridade} />
            <SolicitacaoStatusBadge status={s.status} />
            <SlaCountdown slaAt={s.sla_at} concluido={s.status === 'concluido'} />
          </div>
          <DialogTitle className="text-[#253B29] mt-1">{s.titulo}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Contexto */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
            {s.solicitante && (
              <div className="flex justify-between">
                <span className="text-gray-400">Solicitante</span>
                <span className="font-medium text-gray-700">{s.solicitante.nome}</span>
              </div>
            )}
            {s.lead && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Lead</span>
                <button
                  className="font-medium text-[#253B29] flex items-center gap-1 hover:underline"
                  onClick={() => router.push(`/leads/${s.lead_id}`)}
                >
                  {s.lead.nome}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            )}
            {s.processo && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Processo</span>
                <button
                  className="font-medium text-[#253B29] flex items-center gap-1 hover:underline"
                  onClick={() => router.push(`/processos/${s.processo_id}`)}
                >
                  {s.processo.nome_imovel}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            )}
            {s.pessoa && (
              <div className="flex justify-between">
                <span className="text-gray-400">Pessoa</span>
                <span className="font-medium text-gray-700">{s.pessoa.nome}</span>
              </div>
            )}
          </div>

          {/* Arquivos do atendimento (WhatsApp) */}
          {s.conversa_id && (docsLoading || documentos.length > 0) && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                <Label className="text-xs text-gray-400">Arquivos do atendimento</Label>
              </div>
              {docsLoading ? (
                <div className="space-y-1.5">
                  {[1, 2].map((i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {documentos.map((doc) => {
                    const isImage = doc.mime_type?.startsWith('image/')
                    const isAudio = doc.mime_type?.startsWith('audio/')
                    const Icon = isImage ? ImageIcon : isAudio ? Volume2 : FileText
                    return (
                      <a
                        key={doc.id}
                        href={doc.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:border-[#C2AA6A]/60 hover:bg-[#E7E0C4]/30 transition-colors"
                      >
                        <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-700 truncate flex-1">
                          {doc.nome_original || doc.storage_path.split('/').pop()}
                        </span>
                        <ExternalLink className="h-3 w-3 text-gray-400 shrink-0" />
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Descrição original */}
          {s.descricao && (
            <div>
              <Label className="text-xs text-gray-400">Descrição</Label>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{s.descricao}</p>
            </div>
          )}

          {/* Thread de conversa */}
          {(mensagens.length > 0 || mostrarReplicaLegada) && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-400">Conversa</Label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {mostrarReplicaLegada && (
                  <MensagemBubble
                    texto={s.replica_comercial!}
                    autorNome={s.solicitante?.nome ?? 'Comercial'}
                    isPropio={s.solicitante?.id === usuario?.id}
                    isResponsavel={false}
                    createdAt={s.replica_em ?? undefined}
                  />
                )}
                {mensagens.map((m) => {
                  const nome = m.autor_id === s.responsavel?.id
                    ? s.responsavel.nome
                    : (s.solicitante?.nome ?? 'Comercial')
                  return (
                    <MensagemBubble
                      key={m.id}
                      texto={m.texto}
                      autorNome={m.autor_id === usuario?.id ? `${nome} (você)` : nome}
                      isPropio={m.autor_id === usuario?.id}
                      isResponsavel={m.autor_id === s.responsavel?.id}
                      createdAt={m.created_at}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Resposta */}
          <div className="space-y-1.5">
            <Label>Retorno operacional</Label>
            <Textarea
              value={retorno}
              onChange={(e) => setRetorno(e.target.value)}
              placeholder="Resultado da simulação, análise, pendência resolvida..."
              rows={5}
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Novo status <span className="text-red-500">*</span></Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusSolicitacao)}>
              <SelectTrigger className={!status ? 'border-gray-300 text-gray-400' : ''}>
                <SelectValue placeholder="Selecione o status..." />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPCOES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Anexo */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Anexar arquivo (opcional)</Label>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
            {arquivo ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <Paperclip className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-700 truncate flex-1">{arquivo.name}</span>
                <button
                  type="button"
                  onClick={() => { setArquivo(null); if (inputRef.current) inputRef.current.value = '' }}
                  className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-[#253B29]/40 hover:text-[#253B29] transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Selecionar PDF ou imagem
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
            onClick={handleSalvar}
            disabled={salvando || !status}
          >
            {salvando ? 'Salvando...' : 'Salvar Retorno'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
