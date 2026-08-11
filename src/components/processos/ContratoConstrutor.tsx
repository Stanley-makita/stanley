'use client'

/**
 * Tela especializada de Negócios do tipo Contrato — substitui, só para esta
 * modalidade, a tela genérica herdada de Financiamento (ver processos/[id]/page.tsx).
 *
 * Fluxo de ação única do Construtor Inteligente de Contratos: Modelo + Valor
 * do Serviço → documentos (Comprador / Vendedor / Imóvel) → instruções livres
 * → um único clique em "Gerar contrato". A compreensão estruturada e o plano
 * de cláusulas continuam sendo gerados internamente (mesmos hooks de sempre),
 * mas só aparecem ao operador quando há pendência real (dado ausente,
 * divergência entre OCR e instruções, ou baixa confiança) — ver
 * `validarResumo`. Quando não há pendência, a minuta já sai pronta pra
 * revisão jurídica no editor completo (TipTap/PDF/ClickSign, reaproveitando
 * `AbaContrato` sem alterá-la).
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, Import,
  Upload, ChevronDown, ChevronUp, RotateCcw, Trash2, Eye, FileText, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { type Processo, type TipoContrato, TIPO_CONTRATO_LABELS } from '@/types/processos'
import { FINANCIAMENTO_MODALIDADES } from '@/lib/processos/fasesConfig'
import { AbaDocumentos } from '@/components/documentos/AbaDocumentos'
import { useCatalogoPastasProcesso } from '@/hooks/documentos/useCatalogoPastasProcesso'
import { useUploadDocumentoPasta } from '@/hooks/documentos/useUploadDocumentoPasta'
import {
  useEntenderNegociacao, useConfirmarEntendimento, useGerarPlanoContrato, useConfirmarPlano,
  useSalvarContrato, useRegistrarConfirmacaoGeracao, useProcessoContratos,
} from '@/hooks/processos/useProcessoContrato'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { type ResumoNegociacao } from '@/lib/contratos/entenderNegociacao'
import { type PlanoContrato } from '@/lib/contratos/planejarContrato'
import { validarResumo, type PendenciaResumo } from '@/lib/contratos/validarResumo'
import { selecionarTemplate } from '@/lib/contratos/selecionarTemplate'
import { substituirVariaveis } from '@/lib/contratos/substituirVariaveis'
import { construirDadosTemplate } from '@/lib/contratos/resumoParaTemplate'
import { AbaContrato } from '@/components/processos/abas/AbaContrato'

const PASTAS_FIXAS = [
  { codigo: 'comprador' as const, titulo: 'Documentos do Comprador', descricao: 'RG, CPF, CNH, certidão de casamento, comprovante de endereço.' },
  { codigo: 'vendedor' as const, titulo: 'Documentos do Vendedor', descricao: 'RG, CPF, CNH, certidão de casamento, comprovante de endereço.' },
  { codigo: 'imovel' as const, titulo: 'Documentos do Imóvel', descricao: 'Matrícula atualizada, IPTU ou documento complementar.' },
  { codigo: 'terceiros' as const, titulo: 'Documentos de Terceiros Interessados', descricao: 'Procurador, cônjuge não incluído como parte, herdeiro ou outro interessado.' },
  { codigo: 'certidoes' as const, titulo: 'Certidões Apresentadas', descricao: 'Certidões pessoais (comprador/vendedor) e do imóvel relacionadas nesta operação.' },
]

function useNegocioFinanciamentoVinculado(pessoaId: string | null | undefined, processoAtualId: string) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['negocio-financiamento-vinculado', pessoaId],
    enabled: !!usuario?.empresa_id && !!pessoaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processos')
        .select('id, numero_processo, modalidade')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('pessoa_id', pessoaId!)
        .is('deleted_at', null)
        .neq('id', processoAtualId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).find((p) => FINANCIAMENTO_MODALIDADES.has(p.modalidade)) ?? null
    },
  })
}

interface DocumentoDaPasta { id: string; nome: string; storagePath: string }

const BUCKET_DOCUMENTOS = 'documentos-clientes'

// Documentos já anexados em cada pasta fixa — alimenta tanto a contagem
// quanto a listagem com exclusão individual nas caixas de upload; a
// navegação/gestão completa (OCR, mover de pasta) continua morando em
// AbaDocumentos, aberta via "Ver todos os documentos". Filtra deleted_at
// pra contagem e lista baterem com o que foi excluído (individualmente ou
// via "Limpar").
function useDocumentosPorPasta(processoId: string) {
  const { usuario } = useAuth()
  const { data: catalogoPastas = [] } = useCatalogoPastasProcesso()
  return useQuery({
    queryKey: ['documentos-por-pasta', processoId],
    enabled: !!usuario?.empresa_id && catalogoPastas.length > 0,
    queryFn: async (): Promise<Record<string, DocumentoDaPasta[]>> => {
      const { data: vinculos } = await supabase
        .from('documento_vinculos')
        .select('documento_id, pasta_id')
        .eq('entidade_tipo', 'processo')
        .eq('entidade_id', processoId)
      const documentoIds = (vinculos ?? []).map((v) => v.documento_id)
      if (documentoIds.length === 0) return {}

      const { data: docs } = await supabase
        .from('documentos')
        .select('id, nome_original, storage_path')
        .in('id', documentoIds)
        .is('deleted_at', null)
      const docPorId = new Map((docs ?? []).map((d) => [d.id, d]))

      const porPastaId = new Map<string, DocumentoDaPasta[]>()
      for (const v of vinculos ?? []) {
        if (!v.pasta_id) continue
        const doc = docPorId.get(v.documento_id)
        if (!doc) continue // excluído ou não encontrado
        const lista = porPastaId.get(v.pasta_id) ?? []
        lista.push({ id: v.documento_id, nome: doc.nome_original, storagePath: doc.storage_path })
        porPastaId.set(v.pasta_id, lista)
      }
      const porCodigo: Record<string, DocumentoDaPasta[]> = {}
      for (const pasta of catalogoPastas) porCodigo[pasta.codigo] = porPastaId.get(pasta.id) ?? []
      return porCodigo
    },
  })
}

function invalidarDocumentos(qc: ReturnType<typeof useQueryClient>, processoId: string) {
  qc.invalidateQueries({ queryKey: ['documentos-unificado', 'processo', processoId] })
  qc.invalidateQueries({ queryKey: ['documentos-resumo-processo', processoId] })
  qc.invalidateQueries({ queryKey: ['documentos-por-pasta', processoId] })
}

function useExcluirDocumento(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documentoId: string) => {
      const { error } = await supabase
        .from('documentos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', documentoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => invalidarDocumentos(qc, processoId),
    onError: () => toast.error('Não foi possível excluir o documento.'),
  })
}

function useLimparDocumentosPasta(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documentoIds: string[]) => {
      if (documentoIds.length === 0) return
      const { error } = await supabase
        .from('documentos')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', documentoIds)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidarDocumentos(qc, processoId)
      toast.success('Documentos removidos.')
    },
    onError: () => toast.error('Não foi possível limpar os documentos.'),
  })
}

function useImportarDocumentosNegocio(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (negocioOrigemId: string) => {
      const { data: vinculosOrigem, error: erroOrigem } = await supabase
        .from('documento_vinculos')
        .select('documento_id')
        .eq('entidade_tipo', 'processo')
        .eq('entidade_id', negocioOrigemId)
      if (erroOrigem) throw erroOrigem

      const { data: vinculosAtuais } = await supabase
        .from('documento_vinculos')
        .select('documento_id')
        .eq('entidade_tipo', 'processo')
        .eq('entidade_id', processoId)
      const jaVinculados = new Set((vinculosAtuais ?? []).map((v) => v.documento_id))

      const novos = (vinculosOrigem ?? [])
        .map((v) => v.documento_id)
        .filter((id) => !jaVinculados.has(id))

      if (novos.length === 0) return 0

      const { error } = await supabase.from('documento_vinculos').insert(
        novos.map((documento_id) => ({
          empresa_id: usuario!.empresa_id,
          documento_id,
          entidade_tipo: 'processo',
          entidade_id: processoId,
          vinculado_por: usuario!.id,
        })),
      )
      if (error) throw error
      return novos.length
    },
    onSuccess: (quantidade) => {
      qc.invalidateQueries({ queryKey: ['documentos-unificado', 'processo', processoId] })
      qc.invalidateQueries({ queryKey: ['documentos-resumo-processo', processoId] })
      qc.invalidateQueries({ queryKey: ['documentos-por-pasta', processoId] })
      toast.success(quantidade > 0 ? `${quantidade} documento(s) importado(s).` : 'Nenhum documento novo para importar.')
    },
    onError: (error) => {
      console.error('[contratos] erro ao importar documentos do negócio vinculado:', error)
      toast.error('Erro ao importar documentos.')
    },
  })
}

function useAtualizarTipoValorContrato(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { tipo_contrato: TipoContrato | null; valor_contrato: number | null }) => {
      const { error } = await supabase
        .from('processos')
        .update(payload)
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processos', processoId] }),
  })
}

function CaixaUploadPasta({ processoId, pastaCodigo, titulo, descricao, arquivos }: {
  processoId: string
  pastaCodigo: 'comprador' | 'vendedor' | 'imovel' | 'terceiros' | 'certidoes'
  titulo: string
  descricao: string
  arquivos: DocumentoDaPasta[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadDocumentoPasta(processoId, pastaCodigo)
  const excluir = useExcluirDocumento(processoId)
  const limpar = useLimparDocumentosPasta(processoId)
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null)

  async function handleArquivos(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const arquivo of arquivos) {
      await upload.mutateAsync(arquivo).catch(() => {})
    }
  }

  function handleExcluir(id: string) {
    if (confirmandoExclusaoId === id) {
      excluir.mutate(id)
      setConfirmandoExclusaoId(null)
    } else {
      setConfirmandoExclusaoId(id)
    }
  }

  async function handleVisualizar(storagePath: string) {
    const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(storagePath, 3600)
    if (error || !data?.signedUrl) {
      toast.error('Não foi possível abrir o documento.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  function handleLimpar() {
    if (arquivos.length === 0) return
    const confirmado = window.confirm(
      `Remover ${arquivos.length} documento(s) desta pasta? Essa ação não pode ser desfeita.`,
    )
    if (!confirmado) return
    limpar.mutate(arquivos.map((a) => a.id))
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">{titulo}</p>
        {arquivos.length > 0 && (
          <button
            onClick={handleLimpar}
            disabled={limpar.isPending}
            className="shrink-0 text-[11px] text-red-500 hover:underline disabled:opacity-40"
          >
            Limpar
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 leading-snug">{descricao}</p>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleArquivos} />
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={upload.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {upload.isPending ? 'Enviando...' : 'Escolher arquivos'}
      </Button>

      {arquivos.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-gray-100 pt-1.5">
          {arquivos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-[11px] text-gray-600">
              <span className="truncate" title={a.nome}>{a.nome}</span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => handleVisualizar(a.storagePath)}
                  title="Ver documento"
                  className="rounded p-0.5 text-gray-400 transition-colors hover:text-fonti-primary"
                >
                  <Eye className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleExcluir(a.id)}
                  disabled={excluir.isPending}
                  title={confirmandoExclusaoId === a.id ? 'Clique novamente para confirmar' : 'Excluir'}
                  className={`rounded p-0.5 transition-colors ${
                    confirmandoExclusaoId === a.id ? 'text-red-600' : 'text-gray-400 hover:text-red-500'
                  }`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray-500">{arquivos.length} documento(s) anexado(s)</p>
    </div>
  )
}

function badgeVersao(status: string | null, pdfGeradoEm: string | null) {
  if (status === 'closed') return { texto: 'Assinado', className: 'text-green-700 bg-green-50 border-green-200' }
  if (status === 'running') return { texto: 'Enviado', className: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (pdfGeradoEm) return { texto: 'PDF gerado', className: 'text-blue-600 bg-blue-50 border-blue-200' }
  return { texto: 'Minuta', className: 'text-gray-500 bg-gray-100 border-gray-200' }
}

// Atalho pras minutas/contratos já salvos deste Negócio — sem isso, só dava
// pra vê-los gerando outro contrato (o que reabre o editor com a lista).
function CaixaMinutasSalvas({ processoId, onAbrir }: { processoId: string; onAbrir: () => void }) {
  const { data: contratos = [], isLoading } = useProcessoContratos(processoId)
  const recentes = [...contratos].reverse().slice(0, 4)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">Minutas e Contratos Salvos</p>
      </div>
      <p className="text-[11px] text-gray-400 leading-snug">Versões já geradas para este Negócio.</p>

      {isLoading ? (
        <p className="text-[11px] text-gray-400">Carregando...</p>
      ) : recentes.length === 0 ? (
        <p className="text-[11px] text-gray-400">Nenhuma minuta salva ainda — gere o contrato abaixo.</p>
      ) : (
        <ul className="flex flex-col gap-1 border-t border-gray-100 pt-1.5">
          {recentes.map((c) => {
            const badge = badgeVersao(c.clicksign_status, c.pdf_gerado_em)
            return (
              <li key={c.id}>
                <button
                  onClick={onAbrir}
                  className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-[11px] text-gray-600 hover:bg-gray-50"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileText className="h-3 w-3 shrink-0 text-fonti-primary" />
                    <span className="truncate" title={c.titulo}>{c.titulo}</span>
                    <span className="shrink-0 text-gray-400">
                      v{c.versao} · {format(new Date(c.created_at), 'dd/MM/yy', { locale: ptBR })}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${badge.className}`}>
                    {badge.texto}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {contratos.length > 0 && (
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onAbrir}>
          <Clock className="h-3.5 w-3.5" />
          Ver {contratos.length > 1 ? `todas as ${contratos.length} versões` : 'a minuta salva'}
        </Button>
      )}
    </div>
  )
}

type EstadoGeracao = 'idle' | 'processando' | 'revisao' | 'pronto'

export function ContratoConstrutor({ processo }: { processo: Processo }) {
  const router = useRouter()
  const compradorPrincipal = processo.compradores?.find((c) => c.principal) ?? processo.compradores?.[0]
  const pessoaId = compradorPrincipal?.pessoa_id ?? processo.pessoa_id

  const { data: negocioVinculado } = useNegocioFinanciamentoVinculado(pessoaId, processo.id)
  const { data: documentosPastas = {} } = useDocumentosPorPasta(processo.id)
  const { data: contratosExistentes, isLoading: carregandoContratos } = useProcessoContratos(processo.id)
  const importarDocumentos = useImportarDocumentosNegocio(processo.id)
  const atualizar = useAtualizarTipoValorContrato(processo.id)
  const entenderNegociacao = useEntenderNegociacao(processo.id)
  const confirmarEntendimento = useConfirmarEntendimento(processo.id)
  const gerarPlano = useGerarPlanoContrato(processo.id)
  const confirmarPlano = useConfirmarPlano(processo.id)
  const salvarContrato = useSalvarContrato(processo.id)
  const registrarConfirmacao = useRegistrarConfirmacaoGeracao(processo.id)

  const [tipoContrato, setTipoContrato] = useState<TipoContrato | ''>(processo.tipo_contrato ?? '')
  const [valorContrato, setValorContrato] = useState(processo.valor_contrato != null ? String(processo.valor_contrato) : '')
  const [instrucoes, setInstrucoes] = useState('')
  const [documentosExpandido, setDocumentosExpandido] = useState(false)

  const [estado, setEstado] = useState<EstadoGeracao>('idle')
  const [rascunhoId, setRascunhoId] = useState<string | null>(null)
  const [resumoAtual, setResumoAtual] = useState<ResumoNegociacao | null>(null)
  const [planoAtual, setPlanoAtual] = useState<PlanoContrato | null>(null)
  const [pendencias, setPendencias] = useState<PendenciaResumo[]>([])
  const [jaVerificouExistentes, setJaVerificouExistentes] = useState(false)

  // Ao abrir a tela, se este Negócio já tem minuta/contrato salvo, pula
  // direto pro editor (que já mostra a lista de versões) em vez de sempre
  // cair na tela de upload/geração — antes só dava pra ver o que já existia
  // gerando outro contrato.
  useEffect(() => {
    if (!jaVerificouExistentes && !carregandoContratos) {
      setJaVerificouExistentes(true)
      if ((contratosExistentes?.length ?? 0) > 0) setEstado('pronto')
    }
  }, [jaVerificouExistentes, carregandoContratos, contratosExistentes])

  function salvarTipoValor(patch: Partial<{ tipo: TipoContrato | ''; valor: string }>) {
    const tipo = patch.tipo !== undefined ? patch.tipo : tipoContrato
    const valor = patch.valor !== undefined ? patch.valor : valorContrato
    if (patch.tipo !== undefined) setTipoContrato(patch.tipo)
    if (patch.valor !== undefined) setValorContrato(patch.valor)
    atualizar.mutate({
      tipo_contrato: tipo || null,
      valor_contrato: valor ? Number(valor) : null,
    })
  }

  async function finalizarConstrucao(params: {
    contratoId: string
    resumo: ResumoNegociacao
    plano: PlanoContrato
    tipoConfirmacao: 'automatica' | 'manual'
  }) {
    setEstado('processando')
    try {
      await confirmarPlano.mutateAsync({ contratoId: params.contratoId, plano: params.plano })
      const template = selecionarTemplate(tipoContrato)
      const { processoAdaptado, compradoresAdaptados, vendedoresAdaptados, extras } =
        construirDadosTemplate(params.resumo, processo)
      const html = substituirVariaveis(template.conteudo, processoAdaptado, compradoresAdaptados, vendedoresAdaptados, undefined, extras)
      await salvarContrato.mutateAsync({ id: params.contratoId, tipo_modelo: tipoContrato, titulo: template.titulo, conteudo_html: html })
      registrarConfirmacao.mutate({ tipoConfirmacao: params.tipoConfirmacao, tituloContrato: template.titulo })
      setEstado('pronto')
    } catch (error) {
      console.error('[contratos] erro ao construir contrato:', error)
      setEstado('revisao')
    }
  }

  async function gerarContrato() {
    if (!tipoContrato) return
    setEstado('processando')
    try {
      const resumo = await entenderNegociacao.mutateAsync(instrucoes)
      const novoRascunhoId = await confirmarEntendimento.mutateAsync({ rascunhoId, tipoContrato, resumo })
      setRascunhoId(novoRascunhoId)
      const plano = await gerarPlano.mutateAsync(novoRascunhoId)
      setResumoAtual(resumo)
      setPlanoAtual(plano)

      const pendenciasEncontradas = validarResumo(resumo, tipoContrato)
      if (pendenciasEncontradas.length === 0) {
        await finalizarConstrucao({ contratoId: novoRascunhoId, resumo, plano, tipoConfirmacao: 'automatica' })
      } else {
        setPendencias(pendenciasEncontradas)
        setEstado('revisao')
      }
    } catch (error) {
      console.error('[contratos] erro ao gerar contrato:', error)
      setEstado('idle')
    }
  }

  function continuarComPendencias() {
    if (!rascunhoId || !resumoAtual || !planoAtual) return
    finalizarConstrucao({ contratoId: rascunhoId, resumo: resumoAtual, plano: planoAtual, tipoConfirmacao: 'manual' })
  }

  const processando = estado === 'processando'
  const negocioParaImportar = negocioVinculado
    ? { id: negocioVinculado.id, numero_processo: negocioVinculado.numero_processo }
    : null

  return (
    <div className="flex flex-col gap-4">
      {negocioVinculado && (
        <button
          onClick={() => router.push(`/processos/${negocioVinculado.id}`)}
          className="self-end text-xs text-blue-600 hover:underline shrink-0"
        >
          {negocioVinculado.numero_processo} vinculado — Ver Negócio →
        </button>
      )}

      <div className="flex flex-col gap-4">
        {/* ① Modelo + Valor */}
        <section className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Modelo de contrato</label>
            <Select value={tipoContrato} onValueChange={(v) => salvarTipoValor({ tipo: v as TipoContrato })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_CONTRATO_LABELS).map(([valor, label]) => (
                  <SelectItem key={valor} value={valor}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Valor do Serviço — cobrado pela Fontinhas, não o valor do imóvel/negociação</label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="R$ 0,00"
              value={valorContrato}
              onChange={(e) => setValorContrato(e.target.value)}
              onBlur={() => salvarTipoValor({})}
              className="h-9 text-sm"
            />
          </div>
        </section>

        {/* ② Documentos — comprador / vendedor / imóvel */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Anexe os documentos das partes interessadas</h2>
            {negocioParaImportar && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                disabled={importarDocumentos.isPending}
                onClick={() => importarDocumentos.mutate(negocioParaImportar.id)}
              >
                <Import className="h-3.5 w-3.5" />
                {importarDocumentos.isPending ? 'Importando...' : `Importar do Negócio ${negocioParaImportar.numero_processo}`}
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PASTAS_FIXAS.map((pasta) => (
              <CaixaUploadPasta
                key={pasta.codigo}
                processoId={processo.id}
                pastaCodigo={pasta.codigo}
                titulo={pasta.titulo}
                descricao={pasta.descricao}
                arquivos={documentosPastas[pasta.codigo] ?? []}
              />
            ))}
            <CaixaMinutasSalvas processoId={processo.id} onAbrir={() => setEstado('pronto')} />
          </div>
          <button
            onClick={() => setDocumentosExpandido((v) => !v)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            {documentosExpandido ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Ver todos os documentos
          </button>
          {documentosExpandido && (
            <div className="pt-2">
              <AbaDocumentos contexto="processo" processoId={processo.id} pessoaId={pessoaId ?? undefined} />
            </div>
          )}
        </section>

        {/* ③ Instruções livres + Gerar contrato */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Digite aqui as condições do contrato</h2>
          <Textarea
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            rows={6}
            placeholder="Ex: Contrato de compra e venda de imóvel residencial em Maringá. Valor R$450 mil, entrada R$180 mil, saldo financiado. Posse em 30 dias. Multa 10%."
            className="rounded-xl text-sm"
          />
          <div className="flex items-center justify-end">
            <Button
              disabled={!tipoContrato || processando}
              onClick={gerarContrato}
            >
              {processando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                : <><Sparkles className="h-4 w-4" /> Gerar contrato</>}
            </Button>
          </div>
        </section>

        {/* Cartão de revisão — só aparece quando há pendência real */}
        {estado === 'revisao' && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Revisar antes de continuar
            </h2>
            <div className="space-y-1.5">
              {pendencias.map((p, i) => (
                <div key={i} className="flex items-start gap-1.5 text-sm text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{p.texto}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-700">
              Complete os documentos/instruções acima e clique em "Tentar novamente", ou continue mesmo assim se as pendências não forem relevantes.
            </p>
            <div className="flex justify-between">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={gerarContrato} disabled={processando}>
                <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
              </Button>
              <Button size="sm" disabled={processando} onClick={continuarComPendencias}>
                {processando
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                  : <>✓ Continuar mesmo assim</>}
              </Button>
            </div>
          </section>
        )}

        {/* Minuta construída — abre no editor completo (TipTap, Salvar, PDF, ClickSign),
            já reaproveitado tal e qual da aba antiga de Contrato. */}
        {estado === 'pronto' && (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Minuta pronta para revisão
            </h2>
            <AbaContrato processoId={processo.id} processo={processo} />
          </section>
        )}
      </div>
    </div>
  )
}
