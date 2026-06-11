'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Upload, Download, Trash2, Loader2, FolderOpen, ExternalLink, Sparkles, AlertCircle, Share2 } from 'lucide-react'
import { formatarTamanho, iconeParaMime } from '@/lib/formatarTamanho'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { DocumentoOcrRevisaoModal } from '@/components/documentos/DocumentoOcrRevisaoModal'
import { DocumentoFgtsRevisaoModal } from '@/components/documentos/DocumentoFgtsRevisaoModal'
import { DocumentoCompartilharModal } from '@/components/documentos/DocumentoCompartilharModal'
import { ApuracaoRendaModal } from '@/components/documentos/ApuracaoRendaModal'
import { OcrEnriquecimentoCard } from '@/components/leads/OcrEnriquecimentoCard'
import { OcrEnriquecimentoModal } from '@/components/leads/OcrEnriquecimentoModal'
import { useOcrSugestoes } from '@/hooks/leads/useOcrSugestoes'
import { useApuracaoRenda } from '@/hooks/leads/useApuracaoRenda'

const BUCKET = 'documentos-clientes'
const LIMITE_ARQUIVOS_UPLOAD = 10

const TIPOS_DOCUMENTO = [
  { value: 'auto',                  label: 'Detectar automaticamente' },
  { value: 'extrato_fgts',          label: 'Extrato FGTS' },
  { value: 'extrato_bancario',      label: 'Extrato Bancário' },
  { value: 'rg',                    label: 'RG' },
  { value: 'cnh',                   label: 'CNH' },
  { value: 'cpf',                   label: 'CPF' },
  { value: 'comprovante_renda',     label: 'Comprovante de renda' },
  { value: 'comprovante_endereco',  label: 'Comprovante de endereço' },
  { value: 'certidao_casamento',    label: 'Certidão de Casamento' },
  { value: 'outro',                 label: 'Outro' },
] as const

type TipoDocumento = typeof TIPOS_DOCUMENTO[number]['value']

interface DocumentoCliente {
  id: string
  nome_original: string
  mime_type: string | null
  tamanho_bytes: number | null
  storage_path: string
  classificacao: string | null
  ocr_status: string | null
  ocr_dados: Record<string, unknown> | null
  created_at: string
}

interface Props {
  leadId: string
  pessoaId?: string | null
}

function chaveArquivo(f: File) { return `${f.name}-${f.size}` }

export function AbaDocumentos({ leadId, pessoaId }: Props) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [arquivosSelecionados, setArquivosSelecionados] = useState<File[]>([])
  const [tiposPorArquivo, setTiposPorArquivo] = useState<Record<string, string>>({})
  const [fazendoUpload, setFazendoUpload] = useState(false)
  const [progressoAtual, setProgressoAtual] = useState(0)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)
  const [docOcrRevisao, setDocOcrRevisao] = useState<DocumentoCliente | null>(null)
  const [docFgtsRevisao, setDocFgtsRevisao] = useState<DocumentoCliente | null>(null)
  const [docCompartilhando, setDocCompartilhando] = useState<DocumentoCliente | null>(null)
  const [ocrModalAberto, setOcrModalAberto] = useState(false)
  const [analiseAberta, setAnaliseAberta] = useState(false)

  const ocrSugestoes = useOcrSugestoes(leadId)
  const { ultima: ultimaApuracao } = useApuracaoRenda({ leadId })

  const queryKey = ['documentos-clientes', 'lead', leadId, pessoaId]

  const { data: documentos = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<DocumentoCliente[]> => {
      const filtro = pessoaId
        ? `lead_id.eq.${leadId},pessoa_id.eq.${pessoaId}`
        : `lead_id.eq.${leadId}`

      const { data, error } = await supabase
        .from('documentos_clientes')
        .select('id, nome_original, mime_type, tamanho_bytes, storage_path, classificacao, ocr_status, ocr_dados, created_at')
        .or(filtro)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario && !!leadId,
    refetchInterval: (query) => {
      const docs = (query.state.data as DocumentoCliente[] | undefined) ?? []
      return docs.some(d => ['pendente', 'processando'].includes(d.ocr_status ?? '')) ? 5000 : false
    },
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('documentos_clientes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setConfirmandoExclusao(null)
    },
    onError: () => toast.error('Não foi possível excluir o documento.'),
  })

  async function handleRetryOcr(docId: string) {
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    if (!token) return
    toast.info('Retentando OCR...')
    try {
      const res = await fetch(`/api/documentos/${docId}/ocr-iniciar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey })
      } else {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? 'Erro ao retentar OCR')
      }
    } catch {
      toast.error('Erro ao retentar OCR')
    }
  }

  function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    if (arquivos.length === 0) return
    if (arquivos.length > LIMITE_ARQUIVOS_UPLOAD) {
      toast.error(`Selecione no máximo ${LIMITE_ARQUIVOS_UPLOAD} arquivos por envio.`)
      e.target.value = ''
      return
    }
    const tipos: Record<string, string> = {}
    arquivos.forEach(f => { tipos[chaveArquivo(f)] = 'auto' })
    setArquivosSelecionados(arquivos)
    setTiposPorArquivo(tipos)
    setProgressoAtual(0)
    setModalAberto(true)
    e.target.value = ''
  }

  function fecharModal() {
    if (fazendoUpload) return
    setModalAberto(false)
    setArquivosSelecionados([])
    setTiposPorArquivo({})
    setProgressoAtual(0)
  }

  async function uploadArquivo(arquivo: File, tipoArquivo: string, token: string | undefined): Promise<void> {
    const ext = arquivo.name.split('.').pop() ?? 'bin'
    const storagePath = `${usuario!.empresa_id}/${leadId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, arquivo, { upsert: false })

    if (uploadError) throw new Error(uploadError.message)

    const { data: docInserido, error: dbError } = await supabase
      .from('documentos_clientes')
      .insert({
        empresa_id:     usuario!.empresa_id,
        lead_id:        leadId,
        pessoa_id:      pessoaId ?? null,
        processo_id:    null,
        nome_original:  arquivo.name,
        mime_type:      arquivo.type || null,
        tamanho_bytes:  arquivo.size,
        storage_bucket: BUCKET,
        storage_path:   storagePath,
        canal_origem:   'upload_manual',
        classificacao:  tipoArquivo,
        ocr_status:     'pendente',
      })
      .select('id')
      .single()

    if (dbError) {
      supabase.storage.from(BUCKET).remove([storagePath])
      throw new Error(dbError.message)
    }

    if (docInserido?.id && token) {
      fetch(`/api/documentos/${docInserido.id}/ocr-iniciar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(console.error)
    }
  }

  async function handleUpload() {
    if (arquivosSelecionados.length === 0 || !usuario) return
    setFazendoUpload(true)

    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token

    let enviados = 0
    let erros = 0
    const total = arquivosSelecionados.length

    for (let i = 0; i < total; i++) {
      const arquivo = arquivosSelecionados[i]
      const tipoArquivo = tiposPorArquivo[chaveArquivo(arquivo)] ?? 'auto'
      setProgressoAtual(i + 1)
      try {
        await uploadArquivo(arquivo, tipoArquivo, token)
        enviados++
      } catch (err) {
        console.error('[AbaDocumentos] erro no upload:', arquivo.name, err)
        erros++
      }
    }

    queryClient.invalidateQueries({ queryKey })
    setFazendoUpload(false)
    setModalAberto(false)
    setArquivosSelecionados([])
    setTiposPorArquivo({})
    setProgressoAtual(0)

    if (erros === 0) toast.success(`${enviados} documento(s) enviado(s).`)
    else toast.warning(`${enviados} enviado(s), ${erros} com erro.`)
  }

  async function gerarSignedUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  }

  async function handleVisualizar(doc: DocumentoCliente) {
    const url = await gerarSignedUrl(doc.storage_path)
    if (!url) { toast.error('Não foi possível abrir o documento.'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleDownload(doc: DocumentoCliente) {
    const url = await gerarSignedUrl(doc.storage_path)
    if (!url) { toast.error('Não foi possível baixar o documento.'); return }
    const link = document.createElement('a')
    link.href = url
    link.download = doc.nome_original
    link.click()
  }

  function handleExcluir(id: string) {
    if (confirmandoExclusao === id) {
      excluir.mutate(id)
    } else {
      setConfirmandoExclusao(id)
      setTimeout(() => setConfirmandoExclusao(null), 3000)
    }
  }

  function labelTipo(classificacao: string | null) {
    if (classificacao === 'auto') return 'Detectando...'
    return TIPOS_DOCUMENTO.find(t => t.value === classificacao)?.label ?? classificacao ?? '—'
  }

  function BadgeOcr({ doc }: { doc: DocumentoCliente }) {
    if (doc.ocr_status === 'aguardando_apuracao') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
          Aguardando análise
        </span>
      )
    }
    if (doc.ocr_status === 'erro') {
      return (
        <button
          onClick={() => handleRetryOcr(doc.id)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
          title="Clique para retentar o OCR"
        >
          <AlertCircle className="h-3 w-3" />
          Erro OCR — Retentar
        </button>
      )
    }
    if (doc.classificacao === 'auto' && (doc.ocr_status === 'pendente' || doc.ocr_status === 'processando')) {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
          <Loader2 className="h-3 w-3 animate-spin" />
          Classificando...
        </span>
      )
    }
    if (doc.classificacao !== 'auto' && doc.ocr_status === 'processando') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processando...
        </span>
      )
    }
    if (doc.ocr_status === 'concluido' && doc.classificacao === 'extrato_fgts') {
      return (
        <button
          onClick={() => setDocFgtsRevisao(doc)}
          title="Revisar dados FGTS extraídos"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
        >
          <Sparkles className="h-3 w-3" />
          FGTS
        </button>
      )
    }
    if (doc.ocr_status === 'concluido' && doc.classificacao !== 'extrato_fgts') {
      return (
        <button
          onClick={() => setDocOcrRevisao(doc)}
          title="Revisar dados extraídos do documento"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <Sparkles className="h-3 w-3" />
          Revisar
        </button>
      )
    }
    return null
  }

  const total = arquivosSelecionados.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-medium">
          {documentos.length} documento{documentos.length !== 1 ? 's' : ''}
        </p>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3 w-3" />
          Adicionar Documento
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          onChange={handleArquivoSelecionado}
        />
      </div>

      <OcrEnriquecimentoCard sugestoes={ocrSugestoes} onAbrir={() => setOcrModalAberto(true)} />

      {documentos.some(d => d.classificacao === 'extrato_bancario') && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-800">Análise de Extratos</span>
            {ultimaApuracao && (
              <span className="text-xs text-blue-500">
                · última em {new Date(ultimaApuracao.created_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-100 h-7 text-xs" onClick={() => setAnaliseAberta(true)}>
            {ultimaApuracao ? 'Ver Análise' : 'Analisar Extratos'}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse h-14 bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : documentos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <FolderOpen className="h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-400">Nenhum documento ainda</p>
          <p className="text-xs text-gray-300 mt-1">Adicione PDFs ou imagens vinculados a este lead →</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documentos.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl shrink-0">{iconeParaMime(doc.mime_type ?? '')}</span>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => handleVisualizar(doc)}
                  className="text-sm font-medium text-[#253B29] hover:underline truncate block text-left w-full"
                  title="Abrir no navegador"
                >
                  {doc.nome_original}
                </button>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">{labelTipo(doc.classificacao)}</span>
                  {doc.tamanho_bytes != null && (
                    <span className="text-xs text-gray-300">· {formatarTamanho(doc.tamanho_bytes)}</span>
                  )}
                  <span className="text-xs text-gray-300">
                    · {format(new Date(doc.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <BadgeOcr doc={doc} />
                <button
                  onClick={() => handleVisualizar(doc)}
                  title="Abrir no navegador"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-[#253B29] hover:bg-gray-100 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDownload(doc)}
                  title="Baixar arquivo"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-[#253B29] hover:bg-gray-100 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDocCompartilhando(doc)}
                  title="Compartilhar via WhatsApp"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleExcluir(doc.id)}
                  title={confirmandoExclusao === doc.id ? 'Clique novamente para confirmar' : 'Excluir'}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    confirmandoExclusao === doc.id
                      ? 'bg-red-500 text-white'
                      : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                  )}
                  disabled={excluir.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <OcrEnriquecimentoModal
        aberto={ocrModalAberto}
        leadId={leadId}
        sugestoes={ocrSugestoes}
        onFechar={() => setOcrModalAberto(false)}
      />

      <ApuracaoRendaModal
        open={analiseAberta}
        onClose={() => setAnaliseAberta(false)}
        leadId={leadId}
        processoId={null}
        documentos={documentos}
        ultimaApuracao={ultimaApuracao}
      />

      {docOcrRevisao && (
        <DocumentoOcrRevisaoModal
          documento={docOcrRevisao}
          onClose={() => setDocOcrRevisao(null)}
          onConfirmado={() => {
            setDocOcrRevisao(null)
            queryClient.invalidateQueries({ queryKey })
            if (pessoaId) queryClient.refetchQueries({ queryKey: ['pessoa-completa', pessoaId] })
          }}
        />
      )}

      {docFgtsRevisao && (
        <DocumentoFgtsRevisaoModal
          documento={docFgtsRevisao}
          onClose={() => setDocFgtsRevisao(null)}
          onConfirmado={() => { setDocFgtsRevisao(null); queryClient.invalidateQueries({ queryKey }) }}
        />
      )}

      {docCompartilhando && (
        <DocumentoCompartilharModal
          documento={docCompartilhando}
          leadId={leadId}
          onClose={() => setDocCompartilhando(null)}
          onEnviado={() => setDocCompartilhando(null)}
        />
      )}

      <Dialog open={modalAberto} onOpenChange={(v) => { if (!v) fecharModal() }}>
        <DialogContent className="max-w-lg p-0 flex flex-col overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
            <h2 className="text-base font-semibold text-[#253B29]">
              Classificar {total} documento{total !== 1 ? 's' : ''}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Ajuste o tipo de cada arquivo antes de enviar</p>
          </div>

          <div className="px-6 py-4 space-y-2 overflow-y-auto max-h-[55vh]">
            {arquivosSelecionados.map((arquivo) => {
              const chave = chaveArquivo(arquivo)
              return (
                <div key={chave} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-lg shrink-0">{iconeParaMime(arquivo.type)}</span>
                  <p className="flex-1 text-xs font-medium text-gray-700 truncate min-w-0" title={arquivo.name}>
                    {arquivo.name.length > 35 ? arquivo.name.slice(0, 32) + '...' : arquivo.name}
                  </p>
                  <Select
                    value={tiposPorArquivo[chave] ?? 'auto'}
                    onValueChange={(v) => setTiposPorArquivo(prev => ({ ...prev, [chave]: v }))}
                    disabled={fazendoUpload}
                  >
                    <SelectTrigger className="w-48 h-8 text-xs shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOCUMENTO.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end gap-3 px-6 pb-5 pt-3 border-t border-gray-100 shrink-0">
            <Button variant="outline" onClick={fecharModal} disabled={fazendoUpload}>
              Cancelar
            </Button>
            <Button
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[140px]"
              onClick={handleUpload}
              disabled={fazendoUpload}
            >
              {fazendoUpload
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Enviando {progressoAtual}/{total}...</>
                : `Enviar ${total} arquivo${total !== 1 ? 's' : ''}`
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
