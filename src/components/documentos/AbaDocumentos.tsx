'use client'

import { useMemo, useRef, useState } from 'react'
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
import { Upload, Download, Trash2, Loader2, FolderOpen, Folder, ExternalLink, Sparkles, AlertCircle, Share2, Pencil, Clock, Link2, ChevronLeft, FileSpreadsheet, Calculator } from 'lucide-react'
import { formatarTamanho, iconeParaMime } from '@/lib/formatarTamanho'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { inferirValidade, calcularStatusValidade, LABELS_VALIDADE, ICONES_VALIDADE, CORES_VALIDADE, inferirPastaSugerida } from '@/lib/documentos'
import { useCatalogoPastasProcesso } from '@/hooks/documentos/useCatalogoPastasProcesso'
import { useMoverDocumentoParaPasta } from '@/hooks/documentos/useMoverDocumentoParaPasta'
import { DocumentoOcrRevisaoModal } from '@/components/documentos/DocumentoOcrRevisaoModal'
import { DocumentoFgtsRevisaoModal } from '@/components/documentos/DocumentoFgtsRevisaoModal'
import { DocumentoCompartilharModal } from '@/components/documentos/DocumentoCompartilharModal'
import { ApuracaoRendaModal } from '@/components/documentos/ApuracaoRendaModal'
import { ExtracaoDadosModal } from '@/components/documentos/ExtracaoDadosModal'
import { OcrEnriquecimentoCard } from '@/components/leads/OcrEnriquecimentoCard'
import { OcrEnriquecimentoModal } from '@/components/leads/OcrEnriquecimentoModal'
import { useOcrSugestoes } from '@/hooks/leads/useOcrSugestoes'
import { useApuracaoRenda } from '@/hooks/leads/useApuracaoRenda'
import { useCatalogoTiposDocumento } from '@/hooks/documentos/useCatalogoTiposDocumento'

const BUCKET = 'documentos-clientes'
const LIMITE_ARQUIVOS_UPLOAD = 30

// Tipos do Acervo Documental (Lead/Pessoa) — não inclui matrícula/contrato,
// que são exclusivos de Processo (dominio processo_trabalho).
const TIPOS_DOCUMENTO_ACERVO = [
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

const TIPOS_DOCUMENTO_PROCESSO = [
  ...TIPOS_DOCUMENTO_ACERVO.slice(0, -1),
  { value: 'matricula', label: 'Matrícula do Imóvel' },
  { value: 'contrato',  label: 'Contrato' },
  { value: 'outro',     label: 'Outro' },
] as const

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
  permanente?: boolean | null
  validade_data?: string | null
  validade_dias?: number | null
  vinculado?: boolean
  dominio?: 'acervo_documental' | 'processo_trabalho'
  pessoa_id?: string | null
  pasta_id?: string | null
}

/** "04 Formulários" e "13 Simulações" continuam abas próprias — entram no grid
 * de navegação só como atalho (sem contador, sem drill-down). */
const PASTAS_ATALHO = [
  { codigo: 'formularios', nome: '04 Formulários', aba: 'formularios' as const },
  { codigo: 'simulacoes',  nome: '13 Simulações',  aba: 'simulador' as const },
]

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

type Contexto = 'lead' | 'processo' | 'pessoa'

interface Props {
  contexto: Contexto
  leadId?: string
  processoId?: string
  /**
   * Lead: pessoa vinculada ao lead (estática, vem de fora).
   * Processo: não usada diretamente — resolvida por resolverPessoaIdUpload().
   * Pessoa: id da própria entidade.
   */
  pessoaId?: string | null
  /** Só usado quando contexto === 'processo' — atalho 04/13 do grid de pastas
   * navega pra aba já existente do Processo em vez de abrir conteúdo aqui. */
  onNavegarParaAba?: (aba: 'formularios' | 'simulador') => void
}

function chaveArquivo(f: File) { return `${f.name}-${f.size}` }

export function AbaDocumentos({ contexto, leadId, processoId, pessoaId, onNavegarParaAba }: Props) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const entidadeId = contexto === 'lead' ? leadId : contexto === 'processo' ? processoId : pessoaId ?? undefined

  const [modalAberto, setModalAberto] = useState(false)
  const [arquivosSelecionados, setArquivosSelecionados] = useState<File[]>([])
  const [tiposPorArquivo, setTiposPorArquivo] = useState<Record<string, string>>({})
  const [pastasPorArquivo, setPastasPorArquivo] = useState<Record<string, string>>({})
  const [fazendoUpload, setFazendoUpload] = useState(false)
  const [progressoAtual, setProgressoAtual] = useState(0)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)
  const [pastaAtiva, setPastaAtiva] = useState<string | null>(null) // codigo da pasta ou null (grid) — 'todos' = flat list
  const [docOcrRevisao, setDocOcrRevisao] = useState<DocumentoCliente | null>(null)
  const [docFgtsRevisao, setDocFgtsRevisao] = useState<DocumentoCliente | null>(null)
  const [docCompartilhando, setDocCompartilhando] = useState<DocumentoCliente | null>(null)
  const [ocrModalAberto, setOcrModalAberto] = useState(false)
  const [analiseAberta, setAnaliseAberta] = useState(false)
  const [extracaoAberta, setExtracaoAberta] = useState(false)
  const [extrairAposUpload, setExtrairAposUpload] = useState(true)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')

  // OcrEnriquecimentoCard/Modal só existe para Lead — é sobre enriquecer o cadastro
  // do Lead, não se aplica a Processo/Pessoa. Hook sempre chamado (regra dos hooks),
  // mas com id vazio quando não é Lead — fica desabilitado internamente.
  const ocrSugestoes = useOcrSugestoes(contexto === 'lead' ? (leadId ?? '') : '')
  // Apuração de Renda: existe para Lead/Processo (cada operação tem sua própria renda
  // apurada); não existe rota nem sentido conceitual para Pessoa (renda é por operação).
  const { ultima: ultimaApuracao } = useApuracaoRenda(
    contexto === 'lead' ? { leadId } : contexto === 'processo' ? { processoId } : {},
  )

  // Fase A (catálogo): Lead/Pessoa só usam tipos do Acervo Documental (matrícula/contrato
  // são processo_trabalho). Processo usa todos os domínios.
  const { data: catalogoTipos } = useCatalogoTiposDocumento(contexto === 'processo' ? undefined : 'acervo_documental')
  const tiposDocumentoFallback = contexto === 'processo' ? TIPOS_DOCUMENTO_PROCESSO : TIPOS_DOCUMENTO_ACERVO
  const tiposDocumento = useMemo(() => {
    const base = catalogoTipos && catalogoTipos.length > 0
      ? catalogoTipos.map(t => ({ value: t.codigo, label: t.nome }))
      : tiposDocumentoFallback.filter(t => t.value !== 'auto')
    return [{ value: 'auto', label: 'Detectar automaticamente' }, ...base]
  }, [catalogoTipos, tiposDocumentoFallback])

  // Pasta é conceito de Processo — catálogo e papéis (comprador/vendedor) só fazem
  // sentido, e só são buscados, quando contexto === 'processo'.
  const { data: catalogoPastas = [] } = useCatalogoPastasProcesso()
  const moverParaPasta = useMoverDocumentoParaPasta()

  const { data: papeisProcesso } = useQuery({
    queryKey: ['processo-papeis-pessoas', processoId],
    enabled: contexto === 'processo' && !!processoId && !!usuario,
    queryFn: async () => {
      const [{ data: compradores }, { data: vendedores }] = await Promise.all([
        supabase.from('processo_compradores').select('pessoa_id').eq('processo_id', processoId!).eq('empresa_id', usuario!.empresa_id),
        supabase.from('processo_vendedores').select('pessoa_id').eq('processo_id', processoId!).eq('empresa_id', usuario!.empresa_id),
      ])
      return {
        compradoras: (compradores ?? []).map(c => c.pessoa_id).filter((id): id is string => !!id),
        vendedoras:  (vendedores ?? []).map(v => v.pessoa_id).filter((id): id is string => !!id),
      }
    },
  })

  const queryKey = ['documentos-unificado', contexto, entidadeId, pessoaId]

  // Modelo definitivo: lê exclusivamente de `documentos`/`extracoes_ocr`/`documento_vinculos`.
  const { data: documentos = [], isLoading } = useQuery({
    queryKey,
    enabled: !!usuario && !!entidadeId,
    queryFn: async (): Promise<DocumentoCliente[]> => {
      let todosIds: string[] = []
      const idsVinculados = new Set<string>() // docs com vínculo a MAIS de uma entidade → "reaproveitado"
      // pasta_id do vínculo com ESTE processo (só relevante quando contexto === 'processo';
      // documento_vinculos.pasta_id é por vínculo, não fixo no documento — ver useMoverDocumentoParaPasta).
      const pastaPorVinculo = new Map<string, string | null>()

      if (contexto === 'pessoa') {
        const { data: docsPessoa } = await supabase
          .from('documentos')
          .select('id')
          .eq('dominio', 'acervo_documental')
          .eq('pessoa_id', entidadeId!)
          .eq('empresa_id', usuario!.empresa_id)
          .is('deleted_at', null)
        todosIds = (docsPessoa ?? []).map(d => d.id)
      } else {
        const entidadeTipo = contexto // 'lead' | 'processo'
        const { data: vinculosDiretos } = await supabase
          .from('documento_vinculos')
          .select('documento_id, pasta_id')
          .eq('entidade_tipo', entidadeTipo)
          .eq('entidade_id', entidadeId!)
          .eq('empresa_id', usuario!.empresa_id)
        const idsDireto = new Set((vinculosDiretos ?? []).map(v => v.documento_id))
        for (const v of vinculosDiretos ?? []) pastaPorVinculo.set(v.documento_id, v.pasta_id)

        let idsSemVinculo: string[] = []
        if (contexto === 'lead' && pessoaId) {
          const { data: docsPessoa } = await supabase
            .from('documentos')
            .select('id')
            .eq('dominio', 'acervo_documental')
            .eq('pessoa_id', pessoaId)
            .eq('empresa_id', usuario!.empresa_id)
            .is('deleted_at', null)
          const idsPessoa = (docsPessoa ?? []).map(d => d.id)
          let idsComLead = new Set<string>()
          if (idsPessoa.length > 0) {
            const { data: vinculosExistentes } = await supabase
              .from('documento_vinculos')
              .select('documento_id')
              .eq('entidade_tipo', 'lead')
              .in('documento_id', idsPessoa)
            idsComLead = new Set((vinculosExistentes ?? []).map(v => v.documento_id))
          }
          idsSemVinculo = idsPessoa.filter(id => !idsComLead.has(id))
        }

        todosIds = Array.from(new Set([...Array.from(idsDireto), ...idsSemVinculo]))

        // "Reaproveitado" = tem vínculo com alguma OUTRA entidade além desta.
        if (todosIds.length > 0) {
          const { data: todosVinculos } = await supabase
            .from('documento_vinculos')
            .select('documento_id, entidade_tipo, entidade_id')
            .in('documento_id', todosIds)
          for (const v of todosVinculos ?? []) {
            if (v.entidade_tipo !== entidadeTipo || v.entidade_id !== entidadeId) {
              idsVinculados.add(v.documento_id)
            }
          }
        }
      }

      if (todosIds.length === 0) return []

      const [{ data: docs, error }, { data: extracoes }] = await Promise.all([
        supabase
          .from('documentos')
          .select('id, nome_original, nome_exibicao, mime_type, tamanho_bytes, storage_path, classificacao:classificacao_legado, ocr_status:status_ocr, created_at:recebido_em, permanente, validade_data, validade_dias, dominio, pessoa_id, pasta_id')
          .in('id', todosIds)
          .is('deleted_at', null),
        supabase
          .from('extracoes_ocr')
          .select('documento_id, dados, dados_validados')
          .in('documento_id', todosIds)
          .eq('vigente', true),
      ])

      if (error) throw error

      const ocrPorDocumento = new Map((extracoes ?? []).map(e => [e.documento_id, e.dados_validados ?? e.dados ?? null]))
      return ((docs ?? []) as unknown as DocumentoCliente[])
        .map(d => ({
          ...d,
          ocr_dados: ocrPorDocumento.get(d.id) ?? null,
          vinculado: idsVinculados.has(d.id),
          // pasta é conceito de Processo: acervo_documental mora no vínculo com
          // ESTE processo; processo_trabalho mora direto no documento.
          pasta_id: contexto === 'processo'
            ? (d.dominio === 'processo_trabalho' ? d.pasta_id : (pastaPorVinculo.get(d.id) ?? null))
            : null,
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    },
    refetchInterval: (query) => {
      const docs = (query.state.data as DocumentoCliente[] | undefined) ?? []
      return docs.some(d => d.ocr_status === 'processando') ? 3000 : false
    },
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('documentos')
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

  // Sugestão de pasta pra um arquivo no momento do upload — só prioridade 2 (tipo
  // documental) é possível aqui, já que ainda não sabemos qual Pessoa é dona do
  // arquivo (resolverPessoaIdUpload roda só no envio); sempre sobrescrevível.
  function pastaSugeridaPorTipo(tipoCodigo: string): string | null {
    if (contexto !== 'processo') return null
    const codigoDoTipo = catalogoTipos?.find(t => t.codigo === tipoCodigo)?.pasta_sugerida_codigo ?? null
    return inferirPastaSugerida({
      documentoPessoaId: null,
      pastaSugeridaCodigoDoTipo: codigoDoTipo,
      pessoasCompradorasIds: [],
      pessoasVendedorasIds: [],
    })
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
    const pastas: Record<string, string> = {}
    arquivos.forEach(f => {
      tipos[chaveArquivo(f)] = 'auto'
      pastas[chaveArquivo(f)] = pastaSugeridaPorTipo('auto') ?? ''
    })
    setArquivosSelecionados(arquivos)
    setTiposPorArquivo(tipos)
    setPastasPorArquivo(pastas)
    setProgressoAtual(0)
    setModalAberto(true)
    e.target.value = ''
  }

  function fecharModal() {
    if (fazendoUpload) return
    setModalAberto(false)
    setArquivosSelecionados([])
    setTiposPorArquivo({})
    setPastasPorArquivo({})
    setProgressoAtual(0)
  }

  // Resolve a Pessoa dona do documento no momento do upload.
  // Lead: prop estática. Pessoa: é a própria entidade. Processo: resolve pelo
  // comprador principal (pessoa_id direto → CPF → nome), igual ao resto do sistema.
  async function resolverPessoaIdUpload(): Promise<string | null> {
    if (contexto === 'pessoa') return entidadeId ?? null
    if (contexto === 'lead') return pessoaId ?? null
    if (!processoId || !usuario) return null
    const { data: comprador } = await supabase
      .from('processo_compradores')
      .select('pessoa_id, cpf, nome')
      .eq('processo_id', processoId)
      .eq('empresa_id', usuario.empresa_id)
      .eq('principal', true)
      .maybeSingle()

    if (comprador?.pessoa_id) return comprador.pessoa_id
    if (comprador?.cpf) {
      const { data: p } = await supabase
        .from('pessoas').select('id').eq('empresa_id', usuario.empresa_id).eq('cpf', comprador.cpf).maybeSingle()
      if (p?.id) return p.id
    }
    if (comprador?.nome) {
      const { data: p } = await supabase
        .from('pessoas').select('id').eq('empresa_id', usuario.empresa_id).ilike('nome', comprador.nome).maybeSingle()
      if (p?.id) return p.id
    }
    return null
  }

  async function uploadArquivo(arquivo: File, tipoArquivo: string, pastaCodigoArquivo: string, pessoaIdUpload: string, token: string | undefined): Promise<void> {
    const ext = arquivo.name.split('.').pop() ?? 'bin'
    const storagePath = `${usuario!.empresa_id}/${entidadeId}/${crypto.randomUUID()}.${ext}`

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
      .from('documentos')
      .insert({
        empresa_id:     usuario!.empresa_id,
        dominio:        'acervo_documental',
        pessoa_id:      pessoaIdUpload,
        nome_original:  arquivo.name,
        mime_type:      resolvedMime,
        tamanho_bytes:  arquivo.size,
        storage_bucket: BUCKET,
        storage_path:   storagePath,
        origem:         'upload_manual',
        classificacao_legado: tipoArquivo,
        status_ocr:     'pendente',
        permanente:     validade.permanente,
        validade_dias:  validade.validade_dias,
      })
      .select('id')
      .single()

    if (dbError) {
      supabase.storage.from(BUCKET).remove([storagePath])
      throw new Error(dbError.message)
    }

    if (contexto !== 'pessoa' && docInserido?.id) {
      const pastaId = contexto === 'processo' && pastaCodigoArquivo
        ? catalogoPastas.find(p => p.codigo === pastaCodigoArquivo)?.id ?? null
        : null
      await supabase.from('documento_vinculos').insert({
        empresa_id: usuario!.empresa_id,
        documento_id: docInserido.id,
        entidade_tipo: contexto,
        entidade_id: entidadeId!,
        pasta_id: pastaId,
      })
    }

    if (docInserido?.id && token && extrairAposUpload) {
      fetch(`/api/documentos/${docInserido.id}/ocr-iniciar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(console.error)
    }
  }

  async function handleUpload() {
    if (arquivosSelecionados.length === 0 || !usuario || !entidadeId) return
    setFazendoUpload(true)

    const [{ data: session }, pessoaIdUpload] = await Promise.all([
      supabase.auth.getSession(),
      resolverPessoaIdUpload(),
    ])
    const token = session.session?.access_token

    if (!pessoaIdUpload) {
      setFazendoUpload(false)
      toast.error('Não foi possível identificar a Pessoa dona destes documentos. Complete o cadastro do comprador/cliente antes de enviar.')
      return
    }

    let enviados = 0
    let erros = 0
    const total = arquivosSelecionados.length

    for (let i = 0; i < total; i++) {
      const arquivo = arquivosSelecionados[i]
      const chave = chaveArquivo(arquivo)
      const tipoArquivo = tiposPorArquivo[chave] ?? 'auto'
      const pastaCodigoArquivo = pastasPorArquivo[chave] ?? ''
      setProgressoAtual(i + 1)
      try {
        await uploadArquivo(arquivo, tipoArquivo, pastaCodigoArquivo, pessoaIdUpload, token)
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
    setPastasPorArquivo({})
    setProgressoAtual(0)

    if (erros === 0) toast.success(`${enviados} documento(s) enviado(s).`)
    else toast.warning(`${enviados} enviado(s), ${erros} com erro.`)
  }

  async function gerarSignedUrl(storagePath: string): Promise<string | null> {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600)
    return data?.signedUrl ?? null
  }

  async function handleVisualizar(doc: DocumentoCliente) {
    // Abre janela antes do await — evita bloqueio de popup do browser
    const win = window.open('', '_blank', 'noopener,noreferrer')
    const url = await gerarSignedUrl(doc.storage_path)
    if (!url) { toast.error('Não foi possível abrir o documento.'); win?.close(); return }
    if (win) win.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleRenomear(docId: string) {
    const nome = novoNome.trim()
    const doc = documentos.find(d => d.id === docId)
    const nomeAtual = doc?.nome_exibicao ?? doc?.nome_original ?? ''
    setRenomeando(null)
    if (nome === nomeAtual) return
    const { error } = await supabase
      .from('documentos')
      .update({ nome_exibicao: nome || null })
      .eq('id', docId)
      .eq('empresa_id', usuario!.empresa_id)
    if (error) toast.error('Não foi possível renomear o arquivo.')
    else queryClient.invalidateQueries({ queryKey })
  }

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

  async function handleDownload(doc: DocumentoCliente) {
    // { download } força Content-Disposition: attachment no Supabase — evita abrir no viewer do browser
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 3600, { download: doc.nome_exibicao || doc.nome_original })
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
    return tiposDocumento.find(t => t.value === classificacao)?.label ?? classificacao ?? '—'
  }

  function BadgeOcr({ doc }: { doc: DocumentoCliente }) {
    const ext = doc.nome_original.split('.').pop()?.toLowerCase() ?? ''
    const isImage = doc.mime_type?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)

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
    if (isImage && (doc.ocr_status === 'pendente' || doc.ocr_status === 'ignorado' || !doc.ocr_status)) {
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

  function BadgeValidade({ doc }: { doc: DocumentoCliente }) {
    const status = calcularStatusValidade(doc)
    if (!status) return null
    return (
      <span className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border', CORES_VALIDADE[status])}>
        {ICONES_VALIDADE[status]} {LABELS_VALIDADE[status]}
      </span>
    )
  }

  // Grid de navegação estilo Explorer — 13 posições sempre visíveis (mesma numeração
  // usada há anos na rede), mesmo que 04/13 só sejam atalhos pra outras abas do sistema.
  const pastasGrid = useMemo(() => {
    if (contexto !== 'processo') return []
    const atalhos = [
      { codigo: 'formularios', nome: '04 Formulários', ordem_exibicao: 40, aba: 'formularios' as const },
      { codigo: 'simulacoes',  nome: '13 Simulações',  ordem_exibicao: 130, aba: 'simulador' as const },
    ]
    return [
      ...catalogoPastas.map(p => ({ codigo: p.codigo, nome: p.nome, ordem_exibicao: p.ordem_exibicao, aba: undefined })),
      ...atalhos,
    ].sort((a, b) => a.ordem_exibicao - b.ordem_exibicao)
  }, [contexto, catalogoPastas])

  const pastaAtivaInfo = pastaAtiva && pastaAtiva !== 'todos' ? catalogoPastas.find(p => p.codigo === pastaAtiva) ?? null : null

  const documentosExibidos = useMemo(() => {
    if (contexto !== 'processo' || !pastaAtiva) return documentos
    if (pastaAtiva === 'todos') return documentos
    return documentos.filter(d => d.pasta_id === (pastaAtivaInfo?.id ?? '__nunca__'))
  }, [contexto, pastaAtiva, pastaAtivaInfo, documentos])

  function contarDocsNaPasta(codigo: string): number {
    const pastaId = catalogoPastas.find(p => p.codigo === codigo)?.id
    if (!pastaId) return 0
    return documentos.filter(d => d.pasta_id === pastaId).length
  }

  // Sugestão de pasta pra um documento JÁ enviado (prioridade completa de 3 níveis —
  // aqui já sabemos a Pessoa dona do documento e o papel dela neste Processo).
  function sugestaoPastaDoc(doc: DocumentoCliente): { codigo: string; nome: string } | null {
    if (contexto !== 'processo') return null
    const codigoDoTipo = catalogoTipos?.find(t => t.codigo === doc.classificacao)?.pasta_sugerida_codigo ?? null
    const codigo = inferirPastaSugerida({
      documentoPessoaId: doc.pessoa_id ?? null,
      pastaSugeridaCodigoDoTipo: codigoDoTipo,
      pessoasCompradorasIds: papeisProcesso?.compradoras ?? [],
      pessoasVendedorasIds: papeisProcesso?.vendedoras ?? [],
    })
    if (!codigo) return null
    const pasta = catalogoPastas.find(p => p.codigo === codigo)
    return pasta ? { codigo: pasta.codigo, nome: pasta.nome } : null
  }

  const total = arquivosSelecionados.length
  const labelVazio = contexto === 'processo'
    ? { titulo: 'Nenhum documento neste processo', subtitulo: 'Adicione PDFs ou imagens relacionados a este processo.' }
    : contexto === 'pessoa'
      ? { titulo: 'Nenhum documento no acervo desta pessoa', subtitulo: 'Adicione PDFs ou imagens ao acervo desta pessoa.' }
      : { titulo: 'Nenhum documento ainda', subtitulo: 'Adicione PDFs ou imagens vinculados a este lead →' }

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

      {contexto === 'processo' && !pastaAtiva && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          <button
            onClick={() => setPastaAtiva('todos')}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-3 py-3 text-center transition-colors hover:bg-gray-50"
          >
            <FolderOpen className="h-6 w-6 text-gray-400" />
            <span className="text-xs font-medium text-gray-700">Todos</span>
            <span className="text-[10px] text-gray-400">{documentos.length} arquivo{documentos.length !== 1 ? 's' : ''}</span>
          </button>
          {pastasGrid.map(p => (
            <button
              key={p.codigo}
              onClick={() => p.aba ? onNavegarParaAba?.(p.aba) : setPastaAtiva(p.codigo)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-3 py-3 text-center transition-colors hover:bg-gray-50"
            >
              {p.aba === 'formularios'
                ? <FileSpreadsheet className="h-6 w-6 text-fonti-primary/60" />
                : p.aba === 'simulador'
                  ? <Calculator className="h-6 w-6 text-fonti-primary/60" />
                  : <Folder className="h-6 w-6 text-gray-400" />}
              <span className="text-xs font-medium text-gray-700">{p.nome}</span>
              {!p.aba && (
                <span className="text-[10px] text-gray-400">
                  {contarDocsNaPasta(p.codigo)} arquivo{contarDocsNaPasta(p.codigo) !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {contexto === 'processo' && pastaAtiva && (
        <button
          onClick={() => setPastaAtiva(null)}
          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-fonti-primary transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Documentos / {pastaAtiva === 'todos' ? 'Todos' : pastaAtivaInfo?.nome ?? pastaAtiva}
        </button>
      )}

      {contexto === 'lead' && <OcrEnriquecimentoCard sugestoes={ocrSugestoes} onAbrir={() => setOcrModalAberto(true)} />}

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

      {contexto !== 'pessoa' && documentos.some(d => d.classificacao === 'extrato_bancario') && (
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

      {(contexto !== 'processo' || !!pastaAtiva) && (isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse h-14 bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : documentosExibidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <FolderOpen className="h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-400">{labelVazio.titulo}</p>
          <p className="text-xs text-gray-300 mt-1">{labelVazio.subtitulo}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documentosExibidos.map((doc) => (
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
                        <button
                          onClick={() => handleVisualizar(doc)}
                          className="block w-full text-left text-sm font-semibold text-fonti-primary hover:underline sm:truncate"
                          title="Abrir no navegador"
                        >
                          {classificacaoLabel}
                        </button>
                        <div className="flex items-center gap-1 min-w-0 mt-0.5">
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
                              className="text-xs text-gray-400 w-full border-b border-gray-300 outline-none bg-transparent"
                            />
                          ) : (
                            <>
                              <span className="break-words text-xs text-gray-400 sm:truncate">{doc.nome_exibicao ?? doc.nome_original}</span>
                              <button
                                onClick={() => { setRenomeando(doc.id); setNovoNome(doc.nome_exibicao ?? doc.nome_original) }}
                                title="Renomear arquivo"
                                className="shrink-0 p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </button>
                            </>
                          )}
                        </div>
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
                {doc.vinculado && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                    <Link2 className="h-3 w-3" />
                    Compartilhado
                  </span>
                )}
                {contexto === 'processo' && pastaAtiva === 'todos' && !doc.pasta_id && (() => {
                  const sugestao = sugestaoPastaDoc(doc)
                  return sugestao ? (
                    <button
                      onClick={() => moverParaPasta.mutate({
                        documentoId: doc.id,
                        dominio: doc.dominio ?? 'acervo_documental',
                        processoId: processoId,
                        novaPastaId: catalogoPastas.find(p => p.codigo === sugestao.codigo)?.id ?? null,
                      })}
                      title="Mover para a pasta sugerida"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-400 border border-gray-200 hover:bg-fonti-primary/5 hover:text-fonti-primary hover:border-fonti-primary/30 transition-colors"
                    >
                      Sem pasta · sugestão: {sugestao.nome}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-400 border border-gray-200">
                      Sem pasta
                    </span>
                  )
                })()}
                <BadgeValidade doc={doc} />
                <BadgeOcr doc={doc} />
                {contexto === 'processo' && (
                  <Select
                    value={doc.pasta_id ? (catalogoPastas.find(p => p.id === doc.pasta_id)?.codigo ?? '__nenhuma__') : '__nenhuma__'}
                    onValueChange={(v) => moverParaPasta.mutate({
                      documentoId: doc.id,
                      dominio: doc.dominio ?? 'acervo_documental',
                      processoId: processoId,
                      novaPastaId: v === '__nenhuma__' ? null : (catalogoPastas.find(p => p.codigo === v)?.id ?? null),
                    })}
                  >
                    <SelectTrigger className="h-7 w-32 shrink-0 text-xs" title="Mover para pasta">
                      <SelectValue placeholder="Pasta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhuma__" className="text-xs">Sem pasta</SelectItem>
                      {catalogoPastas.map(p => (
                        <SelectItem key={p.codigo} value={p.codigo} className="text-xs">
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
      ))}

      {contexto === 'lead' && (
        <OcrEnriquecimentoModal
          aberto={ocrModalAberto}
          leadId={leadId!}
          sugestoes={ocrSugestoes}
          onFechar={() => setOcrModalAberto(false)}
        />
      )}

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
          leadId={contexto === 'lead' ? leadId : undefined}
          processoId={contexto === 'processo' ? processoId : undefined}
          onClose={() => setDocCompartilhando(null)}
          onEnviado={() => setDocCompartilhando(null)}
        />
      )}

      <ExtracaoDadosModal
        open={extracaoAberta}
        onClose={() => setExtracaoAberta(false)}
        documentos={documentos}
        onAtualizado={() => queryClient.invalidateQueries({ queryKey })}
      />

      {contexto !== 'pessoa' && (
        <ApuracaoRendaModal
          open={analiseAberta}
          onClose={() => setAnaliseAberta(false)}
          leadId={contexto === 'lead' ? (leadId ?? null) : null}
          processoId={contexto === 'processo' ? (processoId ?? null) : null}
          documentos={documentos}
          ultimaApuracao={ultimaApuracao}
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
                    onValueChange={(v) => {
                      setTiposPorArquivo(prev => ({ ...prev, [chave]: v }))
                      setPastasPorArquivo(prev => ({ ...prev, [chave]: pastaSugeridaPorTipo(v) ?? '' }))
                    }}
                    disabled={fazendoUpload}
                  >
                    <SelectTrigger className="h-8 w-full shrink-0 text-xs sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposDocumento.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {contexto === 'processo' && (
                    <Select
                      value={pastasPorArquivo[chave] || '__nenhuma__'}
                      onValueChange={(v) => setPastasPorArquivo(prev => ({ ...prev, [chave]: v === '__nenhuma__' ? '' : v }))}
                      disabled={fazendoUpload}
                    >
                      <SelectTrigger className="h-8 w-full shrink-0 text-xs sm:w-48">
                        <SelectValue placeholder="Pasta (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__nenhuma__" className="text-xs">Sem pasta</SelectItem>
                        {catalogoPastas.map(p => (
                          <SelectItem key={p.codigo} value={p.codigo} className="text-xs">
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
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
