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
import { Upload, Download, Trash2, Loader2, FolderOpen, ExternalLink, Sparkles, AlertCircle, Share2, Pencil, Clock } from 'lucide-react'
import { formatarTamanho, iconeParaMime } from '@/lib/formatarTamanho'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { inferirValidade } from '@/lib/documentos'
import { DocumentoOcrRevisaoModal } from '@/components/documentos/DocumentoOcrRevisaoModal'
import { DocumentoFgtsRevisaoModal } from '@/components/documentos/DocumentoFgtsRevisaoModal'
import { DocumentoCompartilharModal } from '@/components/documentos/DocumentoCompartilharModal'
import { ApuracaoRendaModal } from '@/components/documentos/ApuracaoRendaModal'
import { ExtracaoDadosModal } from '@/components/documentos/ExtracaoDadosModal'
import { OcrEnriquecimentoCard } from '@/components/leads/OcrEnriquecimentoCard'
import { OcrEnriquecimentoModal } from '@/components/leads/OcrEnriquecimentoModal'
import { useOcrSugestoes } from '@/hooks/leads/useOcrSugestoes'
import { useApuracaoRenda } from '@/hooks/leads/useApuracaoRenda'

const BUCKET = 'documentos-clientes'
const LIMITE_ARQUIVOS_UPLOAD = 30

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
  { value: 'certidao_nascimento',   label: 'Certidão de Nascimento' },
  { value: 'outro',                 label: 'Outro' },
] as const

type TipoDocumento = typeof TIPOS_DOCUMENTO[number]['value']

interface DocumentoCliente {
  id: string
  nome_original: string
  nome_exibicao: string | null
  mime_type: string | null
  tamanho_bytes: number | null
  storage_path: string
  classificacao: string | null
  ocr_status: string | null
  ocr_dados: Record<string, unknown> | null
  created_at: string
}

const LABELS_CLASSIFICACAO: Record<string, string> = {
  rg:                   'RG / Doc. de Identidade',
  cnh:                  'CNH',
  cpf:                  'CPF',
  comprovante_endereco: 'Comprovante de Residência',
  comprovante_renda:    'Comprovante de Renda',
  extrato_fgts:         'Extrato FGTS',
  extrato_bancario:     'Extrato Bancário',
  certidao_casamento:   'Certidão de Casamento',
  certidao_nascimento:  'Certidão de Nascimento',
  matricula:            'Matrícula do Imóvel',
  contrato:             'Contrato',
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
  const [extracaoAberta, setExtracaoAberta] = useState(false)
  const [extrairAposUpload, setExtrairAposUpload] = useState(true)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')

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
        .select('id, nome_original, nome_exibicao, mime_type, tamanho_bytes, storage_path, classificacao, ocr_status, ocr_dados, created_at')
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
      return docs.some(d => d.ocr_status === 'processando') ? 3000 : false
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

  async function handleRenomear(docId: string) {
    const nome = novoNome.trim()
    const doc = documentos.find(d => d.id === docId)
    const nomeAtual = doc?.nome_exibicao ?? doc?.nome_original ?? ''
    setRenomeando(null)
    if (nome === nomeAtual) return
    const { error } = await supabase
      .from('documentos_clientes')
      .update({ nome_exibicao: nome || null })
      .eq('id', docId)
      .eq('empresa_id', usuario!.empresa_id)
    if (error) toast.error('Não foi possível renomear o arquivo.')
    else queryClient.invalidateQueries({ queryKey })
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

    const rawMime = arquivo.type || ''
    const fileExt = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
    const resolvedMime = rawMime === 'image/jpg'
      ? 'image/jpeg'
      : !rawMime && (fileExt === 'jpg' || fileExt === 'jpeg')
        ? 'image/jpeg'
        : rawMime || null

    const validade = tipoArquivo !== 'auto' ? inferirValidade(tipoArquivo) : { permanente: false, validade_dias: null }

    const { data: docInserido, error: dbError } = await supabase
      .from('documentos_clientes')
      .insert({
        empresa_id:     usuario!.empresa_id,
        lead_id:        leadId,
        pessoa_id:      pessoaId ?? null,
        processo_id:    null,
        nome_original:  arquivo.name,
        mime_type:      resolvedMime,
        tamanho_bytes:  arquivo.size,
        storage_bucket: BUCKET,
        storage_path:   storagePath,
        canal_origem:   'upload_manual',
        classificacao:  tipoArquivo,
        ocr_status:     'pendente',
        permanente:     validade.permanente,
        validade_dias:  validade.validade_dias,
      })
      .select('id')
      .single()

    if (dbError) {
      supabase.storage.from(BUCKET).remove([storagePath])
      throw new Error(dbError.message)
    }

    if (docInserido?.id && token && extrairAposUpload) {
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
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleDownload(doc: DocumentoCliente) {
    const { data } = await supabase.storage.from('documentos-clientes').createSignedUrl(doc.storage_path, 3600, { download: doc.nome_exibicao || doc.nome_original })
    if (!data?.signedUrl) { toast.error('Não foi possível baixar o documento.'); return }
    const link = document.createElement('a')
    link.href = data.signedUrl
    link.download = doc.nome_exibicao || doc.nome_original
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
    const ext = doc.nome_original.split('.').pop()?.toLowerCase() ?? ''
    const isImage = doc.mime_type?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)

    // Estados finais — mostrar ação apropriada
    if (doc.ocr_status === 'aguardando_apuracao') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
          Aguardando análise
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
    if (doc.ocr_status === 'concluido') {
      return (
        <button
          onClick={() => setDocOcrRevisao(doc)}
          title="Revisar dados extraídos do documento"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <Sparkles className="h-3 w-3" />
          Revisar dados extraídos
        </button>
      )
    }

    // Erro — sempre permite retry
    if (doc.ocr_status === 'erro') {
      return (
        <button
          onClick={() => handleRetryOcr(doc.id)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
          title="Clique para tentar novamente"
        >
          <AlertCircle className="h-3 w-3" />
          Erro na leitura — Tentar novamente
        </button>
      )
    }

    // Em processamento (com spinner)
    if (doc.ocr_status === 'processando') {
      return (
        <button
          onClick={() => handleRetryOcr(doc.id)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors cursor-pointer"
          title="Lendo documento. Clique para forçar nova tentativa se estiver preso"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Lendo documento...
        </button>
      )
    }

    // Para imagens: qualquer outro estado (pendente, ignorado, null) → oferecer extração
    if (isImage) {
      if (doc.ocr_status === 'pendente' || doc.ocr_status === 'ignorado' || !doc.ocr_status) {
        return (
          <button
            onClick={() => handleRetryOcr(doc.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-400 border border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors cursor-pointer"
            title="Clique para extrair dados deste documento"
          >
            <Sparkles className="h-3 w-3" />
            Extrair dados
          </button>
        )
      }
    }

    // PDF/outros em pendente → aguardando leitura (estático, sem spinner)
    if (doc.ocr_status === 'pendente') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-400 border border-gray-200">
          <Clock className="h-3 w-3" />
          Aguardando leitura
        </span>
      )
    }

    return null
  }

  const total = arquivosSelecionados.length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500 font-medium">
          {documentos.length} documento{documentos.length !== 1 ? 's' : ''}
        </p>
        <Button
          size="sm"
          className="h-8 w-full gap-1.5 bg-fonti-primary text-xs text-white hover:bg-fonti-primary-hover sm:w-auto"
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

      {(() => {
        const pendentes = documentos.filter(d => d.ocr_status === 'pendente' || d.ocr_status === 'ignorado')
        return pendentes.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-amber-800">
              {pendentes.length} documento{pendentes.length !== 1 ? 's' : ''} aguardando extração de dados
            </span>
            <Button size="sm" variant="outline" className="h-8 w-full shrink-0 border-amber-200 text-xs text-amber-700 hover:bg-amber-100 sm:h-7 sm:w-auto" onClick={() => setExtracaoAberta(true)}>
              <Sparkles className="h-3 w-3 mr-1" />
              Extrair dados
            </Button>
          </div>
        ) : null
      })()}

      {documentos.some(d => d.classificacao === 'extrato_bancario') && (
        <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-blue-800">Análise de Extratos</span>
            {ultimaApuracao && (
              <span className="text-xs text-blue-500">
                · última em {new Date(ultimaApuracao.created_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-8 w-full border-blue-200 text-xs text-blue-700 hover:bg-blue-100 sm:h-7 sm:w-auto" onClick={() => setAnaliseAberta(true)}>
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
              className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-3 py-3 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:px-4"
            >
              <div className="flex min-w-0 gap-3 sm:flex-1 sm:items-center">
              <span className="shrink-0 text-xl">{iconeParaMime(doc.mime_type ?? '')}</span>
              {(() => {
                const classificacaoLabel = LABELS_CLASSIFICACAO[doc.classificacao ?? ''] ?? null
                return (
                  <div className="flex-1 min-w-0">
                    {classificacaoLabel ? (
                      <>
                        <div className="flex items-center gap-1 min-w-0">
                          {renomeando === doc.id ? (
                            <input
                              autoFocus
                              value={novoNome}
                              onChange={e => setNovoNome(e.target.value)}
                              onBlur={() => handleRenomear(doc.id)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') setRenomeando(null)
                              }}
                              className="text-sm font-semibold text-fonti-primary w-full border-b border-fonti-primary outline-none bg-transparent"
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => handleVisualizar(doc)}
                                className="block text-left text-sm font-semibold text-fonti-primary hover:underline sm:truncate"
                                title="Abrir no navegador"
                              >
                                {doc.nome_exibicao ?? classificacaoLabel}
                              </button>
                              <button
                                onClick={() => { setRenomeando(doc.id); setNovoNome(doc.nome_exibicao ?? classificacaoLabel) }}
                                title="Renomear arquivo"
                                className="shrink-0 p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </button>
                            </>
                          )}
                        </div>
                        <span className="mt-0.5 block break-words text-xs text-gray-400 sm:truncate">{doc.nome_original}</span>
                      </>
                    ) : (
                      <div className="flex items-center gap-1 min-w-0">
                        {renomeando === doc.id ? (
                          <input
                            autoFocus
                            value={novoNome}
                            onChange={e => setNovoNome(e.target.value)}
                            onBlur={() => handleRenomear(doc.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                              if (e.key === 'Escape') setRenomeando(null)
                            }}
                            className="text-sm font-medium text-fonti-primary w-full border-b border-fonti-primary outline-none bg-transparent"
                          />
                        ) : (
                          <>
                            <button
                              onClick={() => handleVisualizar(doc)}
                              className="block text-left text-sm font-medium text-fonti-primary hover:underline sm:truncate"
                              title="Abrir no navegador"
                            >
                              {doc.nome_exibicao ?? doc.nome_original}
                            </button>
                            <button
                              onClick={() => { setRenomeando(doc.id); setNovoNome(doc.nome_exibicao ?? doc.nome_original) }}
                              title="Renomear arquivo"
                              className="shrink-0 p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {!classificacaoLabel && <span className="text-xs text-gray-400">{labelTipo(doc.classificacao)}</span>}
                      {doc.tamanho_bytes != null && (
                        <span className="text-xs text-gray-300">{classificacaoLabel ? '' : '· '}{formatarTamanho(doc.tamanho_bytes)}</span>
                      )}
                      <span className="text-xs text-gray-300">
                        · {format(new Date(doc.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                )
              })()}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
                <BadgeOcr doc={doc} />
                <button
                  onClick={() => handleVisualizar(doc)}
                  title="Abrir no navegador"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-fonti-primary hover:bg-gray-100 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDownload(doc)}
                  title="Baixar arquivo"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-fonti-primary hover:bg-gray-100 transition-colors"
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

      <ExtracaoDadosModal
        open={extracaoAberta}
        onClose={() => setExtracaoAberta(false)}
        documentos={documentos}
        onAtualizado={() => queryClient.invalidateQueries({ queryKey })}
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
        <DialogContent className="flex max-h-[92svh] w-[calc(100vw-1rem)] max-w-lg flex-col overflow-hidden p-0 sm:w-full">
          <div className="shrink-0 border-b border-gray-100 px-4 pb-4 pt-5 sm:px-6">
            <h2 className="text-base font-semibold text-fonti-primary">
              Classificar {total} documento{total !== 1 ? 's' : ''}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Ajuste o tipo de cada arquivo antes de enviar</p>
          </div>

          <div className="max-h-[55svh] space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
            {arquivosSelecionados.map((arquivo) => {
              const chave = chaveArquivo(arquivo)
              return (
                <div key={chave} className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center">
                  <span className="text-lg shrink-0">{iconeParaMime(arquivo.type)}</span>
                  <p className="flex-1 text-xs font-medium text-gray-700 truncate min-w-0" title={arquivo.name}>
                    {arquivo.name.length > 35 ? arquivo.name.slice(0, 32) + '...' : arquivo.name}
                  </p>
                  <Select
                    value={tiposPorArquivo[chave] ?? 'auto'}
                    onValueChange={(v) => setTiposPorArquivo(prev => ({ ...prev, [chave]: v }))}
                    disabled={fazendoUpload}
                  >
                    <SelectTrigger className="h-8 w-full shrink-0 text-xs sm:w-48">
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

          <div className="shrink-0 border-t border-gray-100 px-4 py-3 sm:px-6">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={extrairAposUpload}
                onChange={e => setExtrairAposUpload(e.target.checked)}
                disabled={fazendoUpload}
                className="rounded"
              />
              Tentar extrair dados automaticamente após o upload
            </label>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 px-4 pb-5 pt-3 sm:flex-row sm:justify-end sm:px-6">
            <Button variant="outline" className="w-full sm:w-auto" onClick={fecharModal} disabled={fazendoUpload}>
              Cancelar
            </Button>
            <Button
              className="min-w-[140px] w-full bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
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
