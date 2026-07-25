'use client'

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Button } from '@/components/ui/button'
import {
  Bold, Italic, UnderlineIcon, AlignLeft, AlignCenter, AlignRight,
  AlignJustify, Undo, Redo, FileText, Save, ChevronLeft,
  Send, CheckCircle, Clock, Download, Loader2, RefreshCw, Plus,
  Eye, FileOutput, Copy, Lock,
} from 'lucide-react'
import {
  useProcessoContratos, useSalvarContrato, useGerarPdfContrato, useCriarNovaVersaoContrato,
  abrirPdfStorage, baixarPdfContrato,
} from '@/hooks/processos/useProcessoContrato'
import type { ProcessoContrato } from '@/hooks/processos/useProcessoContrato'
import { blobParaBase64 } from '@/lib/contratos/gerarPdfContrato'
import { useProcessoCompradores } from '@/hooks/processos/useProcessoCompradores'
import { useProcessoVendedores } from '@/hooks/processos/useProcessoVendedores'
import { substituirVariaveis } from '@/lib/contratos/substituirVariaveis'
import type { ContratoAssessoriaOpcoes } from '@/lib/contratos/substituirVariaveis'
import {
  TEMPLATE_COMPRA_VENDA,
  TEMPLATE_DISTRATO_LOCACAO,
  TEMPLATE_LOCACAO_IMOVEL,
  TEMPLATE_PRESTACAO_SERVICOS,
  TODOS_TEMPLATES,
} from '@/lib/contratos/templates'
import type { Processo } from '@/types/processos'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useContratoClicksign } from '@/hooks/processos/useContratoClicksign'

const TEMPLATES_MAP = {
  compra_venda: TEMPLATE_COMPRA_VENDA,
  distrato_locacao: TEMPLATE_DISTRATO_LOCACAO,
  locacao_imovel: TEMPLATE_LOCACAO_IMOVEL,
  prestacao_servicos: TEMPLATE_PRESTACAO_SERVICOS,
} as const

interface Props {
  processoId: string
  processo: Processo
}

type Tela = 'lista' | 'selecao' | 'configurando_assessoria' | 'editor'

function badgeStatus(status: string | null) {
  if (status === 'closed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        <CheckCircle className="h-3 w-3" />
        Assinado
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
        <Clock className="h-3 w-3" />
        Enviado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
      Rascunho
    </span>
  )
}

export function AbaContrato({ processoId, processo }: Props) {
  const { data: contratos = [], isLoading } = useProcessoContratos(processoId)
  const { data: compradores = [] } = useProcessoCompradores(processoId)
  const { data: vendedores = [] } = useProcessoVendedores(processoId)
  const salvar = useSalvarContrato(processoId)
  const gerarPdf = useGerarPdfContrato(processoId)
  const criarNovaVersao = useCriarNovaVersaoContrato(processoId)

  const [tela, setTela] = useState<Tela>('selecao')
  const [initialized, setInitialized] = useState(false)
  const [contratoAtivoId, setContratoAtivoId] = useState<string | null>(null)
  const [modeloAtivo, setModeloAtivo] = useState<string | null>(null)
  const [tituloAtivo, setTituloAtivo] = useState('')

  // Estado do painel de configuração de assessoria
  const [numeroPrevia, setNumeroPrevia] = useState('')
  const [dataContrato, setDataContrato] = useState(
    format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  )
  const [checkFinanciamento, setCheckFinanciamento] = useState(false)
  const [checkItbi, setCheckItbi] = useState(false)
  const [checkRegistro, setCheckRegistro] = useState(false)
  const [checkJuridico, setCheckJuridico] = useState(false)
  const [valorServicos, setValorServicos] = useState('')
  const [gerando, setGerando] = useState(false)
  const [enviandoClicksign, setEnviandoClicksign] = useState(false)
  const [verificandoClicksign, setVerificandoClicksign] = useState(false)

  const { data: csStatus, invalidar: invalidarClicksign } = useContratoClicksign(contratoAtivoId)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[600px] p-6 focus:outline-none text-sm leading-relaxed [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_th]:bg-gray-100 [&_th]:text-left',
        style: 'font-family: Arial, Helvetica, sans-serif;',
      },
    },
  })

  const contratoAtivo = contratos.find((c) => c.id === contratoAtivoId) ?? null
  // Uma versão que já foi enviada ao Clicksign (qualquer status não-nulo:
  // running/closed/etc.) fica congelada — edição só via "Criar nova versão".
  const versaoCongelada = !!csStatus?.clicksign_status

  useEffect(() => {
    editor?.setEditable(!versaoCongelada)
  }, [editor, versaoCongelada])

  // Ao carregar, decide a tela inicial baseada nos contratos existentes
  useEffect(() => {
    if (!isLoading && !initialized) {
      setInitialized(true)
      if (contratos.length > 0) {
        setTela('lista')
      }
    }
  }, [contratos, isLoading, initialized])

  function abrirContratoNoEditor(contrato: ProcessoContrato) {
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(contrato.conteudo_html)
    }
    setContratoAtivoId(contrato.id)
    setModeloAtivo(contrato.tipo_modelo)
    setTituloAtivo(contrato.titulo)
    setTela('editor')
  }

  async function abrirConfiguracaoAssessoria() {
    setCheckFinanciamento(processo.tem_assessoria ?? false)
    setCheckItbi(processo.tem_assessoria ?? false)
    setCheckRegistro(processo.tem_assessoria ?? false)
    setCheckJuridico(false)

    const va = (processo as any).valor_assessoria
    setValorServicos(va ? String(va) : '')

    try {
      const res = await fetch('/api/contratos/proximo-numero')
      const json = await res.json()
      setNumeroPrevia(json.numero ?? '')
    } catch {
      setNumeroPrevia('')
    }

    setTela('configurando_assessoria')
  }

  async function handleGerarAssessoria() {
    if (!editor) return
    setGerando(true)
    try {
      const res = await fetch('/api/contratos/proximo-numero', { method: 'POST' })
      const json = await res.json()
      const numeroDefinitivo: string = json.numero ?? numeroPrevia

      const valorNum = valorServicos ? parseFloat(valorServicos.replace(',', '.')) : null

      const opcoes: ContratoAssessoriaOpcoes = {
        numero_contrato_assessoria: numeroDefinitivo,
        check_financiamento: checkFinanciamento,
        check_itbi: checkItbi,
        check_registro: checkRegistro,
        check_juridico: checkJuridico,
        valor_servicos: valorNum,
      }

      const htmlPreenchido = substituirVariaveis(
        TEMPLATE_PRESTACAO_SERVICOS.conteudo,
        processo,
        compradores,
        vendedores,
        opcoes,
      )

      editor.commands.setContent(htmlPreenchido)
      setContratoAtivoId(null)
      setModeloAtivo('prestacao_servicos')
      setTituloAtivo(TEMPLATE_PRESTACAO_SERVICOS.titulo)
      setTela('editor')
    } catch (err) {
      console.error('[AbaContrato] erro ao gerar contrato de assessoria:', err)
    } finally {
      setGerando(false)
    }
  }

  async function handleEnviarClicksign() {
    if (!editor || !contratoAtivoId) return

    const comprador = compradores[0]
    if (!comprador?.email) {
      alert('O comprador não tem e-mail cadastrado. Cadastre o e-mail antes de enviar para assinatura.')
      return
    }

    setEnviandoClicksign(true)
    try {
      // Reaproveita o PDF já gerado da versão atual; se ainda não existir,
      // gera agora (mesma ação de "Gerar/atualizar PDF") — nunca duplica a
      // lógica de renderização, só decide se precisa rodar antes de enviar.
      let storagePath = contratoAtivo?.pdf_storage_path ?? null
      if (!storagePath) {
        storagePath = await gerarPdf.mutateAsync({
          contratoId: contratoAtivoId,
          titulo: tituloAtivo,
          conteudoHtml: editor.getHTML(),
        })
      }

      const pdfBlob = await baixarPdfContrato(storagePath)
      const pdfBase64 = await blobParaBase64(pdfBlob)
      const filename = `${tituloAtivo || 'contrato'}.pdf`

      const res = await fetch('/api/clicksign/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processo_contrato_id: contratoAtivoId,
          pdf_base64: pdfBase64,
          filename,
          signatario_nome: comprador.nome,
          signatario_email: comprador.email,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Erro ao enviar para Clicksign')
      }

      invalidarClicksign()
    } catch (err: any) {
      console.error('[Clicksign]', err)
      alert(`Erro ao enviar para Clicksign: ${err.message}`)
    } finally {
      setEnviandoClicksign(false)
    }
  }

  function handleGerarPdf() {
    if (!editor || !contratoAtivoId) return
    gerarPdf.mutate({ contratoId: contratoAtivoId, titulo: tituloAtivo, conteudoHtml: editor.getHTML() })
  }

  async function handleVisualizarPdf() {
    if (!contratoAtivo?.pdf_storage_path) return
    const url = await abrirPdfStorage(contratoAtivo.pdf_storage_path)
    if (url) window.open(url, '_blank')
  }

  async function handleBaixarPdf() {
    if (!contratoAtivo?.pdf_storage_path) return
    const url = await abrirPdfStorage(contratoAtivo.pdf_storage_path, `${tituloAtivo || 'contrato'}.pdf`)
    if (url) window.location.href = url
  }

  async function handleCriarNovaVersao() {
    if (!contratoAtivo || !editor) return
    const novoId = await criarNovaVersao.mutateAsync(contratoAtivo)
    editor.commands.setContent(contratoAtivo.conteudo_html)
    setContratoAtivoId(novoId)
    setModeloAtivo(contratoAtivo.tipo_modelo)
    setTituloAtivo(contratoAtivo.titulo)
  }

  async function handleVerificarClicksign() {
    if (!contratoAtivoId) return
    setVerificandoClicksign(true)
    try {
      const res = await fetch('/api/clicksign/atualizar-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_contrato_id: contratoAtivoId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Erro ao verificar status')
      }
      invalidarClicksign()
    } catch (err: any) {
      console.error('[Clicksign verificar]', err)
      alert(`Erro ao verificar: ${err.message}`)
    } finally {
      setVerificandoClicksign(false)
    }
  }

  function selecionarModelo(id: string) {
    if (id === 'prestacao_servicos') {
      abrirConfiguracaoAssessoria()
      return
    }
    const template = TEMPLATES_MAP[id as keyof typeof TEMPLATES_MAP]
    if (!template || !editor) return
    const htmlPreenchido = substituirVariaveis(template.conteudo, processo, compradores, vendedores)
    editor.commands.setContent(htmlPreenchido)
    setContratoAtivoId(null)
    setModeloAtivo(id)
    setTituloAtivo(template.titulo)
    setTela('editor')
  }

  async function handleSalvar() {
    if (!editor || !modeloAtivo) return
    const novoId = await salvar.mutateAsync({
      id: contratoAtivoId ?? undefined,
      tipo_modelo: modeloAtivo,
      titulo: tituloAtivo,
      conteudo_html: editor.getHTML(),
    })
    if (!contratoAtivoId && novoId) {
      setContratoAtivoId(novoId)
    }
  }

  function voltarDaEdicao() {
    if (contratos.length > 0) {
      setTela('lista')
    } else {
      setTela('selecao')
    }
    setContratoAtivoId(null)
    setModeloAtivo(null)
    setTituloAtivo('')
    editor?.commands.clearContent()
  }

  function handleTrocarModelo() {
    const confirmado = window.confirm(
      'Ao trocar o modelo o rascunho atual não será salvo automaticamente. Deseja continuar?'
    )
    if (!confirmado) return
    voltarDaEdicao()
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-8 bg-gray-100 rounded-lg w-1/3" />
        <div className="h-64 bg-gray-100 rounded-lg" />
      </div>
    )
  }

  // Tela A — lista de contratos
  if (tela === 'lista') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-fonti-primary">Contratos</h3>
            <p className="text-xs text-gray-400 mt-0.5">{contratos.length} contrato{contratos.length !== 1 ? 's' : ''} neste processo</p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            onClick={() => {
              setContratoAtivoId(null)
              setModeloAtivo(null)
              setTituloAtivo('')
              editor?.commands.clearContent()
              setTela('selecao')
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo contrato
          </Button>
        </div>

        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
          {contratos.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 p-4 bg-white hover:bg-gray-50 transition-colors"
            >
              <button
                className="flex items-start gap-3 text-left flex-1 min-w-0"
                onClick={() => abrirContratoNoEditor(c)}
              >
                <div className="w-8 h-8 shrink-0 bg-fonti-accent-hover rounded-lg flex items-center justify-center mt-0.5">
                  <FileText className="h-3.5 w-3.5 text-fonti-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fonti-primary truncate">{c.titulo}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    v{c.versao} · {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                {badgeStatus(c.clicksign_status)}
                {c.clicksign_signed_url && (
                  <a
                    href={c.clicksign_signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-fonti-primary border border-fonti-accent/60 rounded-lg px-2.5 py-1 hover:bg-fonti-accent-hover transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="h-3 w-3" />
                    Assinado
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Tela B — seleção de modelo
  if (tela === 'selecao') {
    return (
      <div className="space-y-5">
        {contratos.length > 0 && (
          <button
            onClick={() => setTela('lista')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-fonti-primary transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar para contratos
          </button>
        )}

        <div>
          <h3 className="text-sm font-semibold text-fonti-primary">Selecione um modelo de contrato</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            O sistema preenche automaticamente os dados já cadastrados no processo.
            Os campos em falta ficam marcados como <span className="font-mono">[A PREENCHER]</span> para edição manual.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TODOS_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => selecionarModelo(t.id)}
              className="flex gap-3 items-start text-left border border-gray-200 rounded-xl p-4 hover:border-fonti-accent hover:bg-fonti-accent-hover/20 transition-colors group"
            >
              <div className="w-9 h-9 shrink-0 bg-fonti-accent-hover rounded-lg flex items-center justify-center group-hover:bg-fonti-accent/30 transition-colors">
                <FileText className="h-4 w-4 text-fonti-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-fonti-primary">{t.titulo}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t.descricao}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Tela C — painel de configuração de assessoria
  if (tela === 'configurando_assessoria') {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTela('selecao')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-fonti-primary transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
          <span className="text-gray-300">|</span>
          <p className="text-sm font-semibold text-fonti-primary">Configurar Contrato de Assessoria</p>
        </div>

        <div className="border border-gray-200 rounded-xl p-5 space-y-5 bg-white">
          {/* Número e data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nº do contrato</label>
              <input
                type="text"
                value={numeroPrevia}
                onChange={(e) => setNumeroPrevia(e.target.value)}
                placeholder="78/2026"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fonti-accent"
              />
              <p className="text-xs text-gray-400 mt-1">Número gerado automaticamente ao confirmar</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data</label>
              <input
                type="text"
                value={dataContrato}
                onChange={(e) => setDataContrato(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fonti-accent"
              />
            </div>
          </div>

          {/* Serviços */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Serviços contratados</label>
            <div className="space-y-2">
              {[
                { label: 'Formalização do Financiamento Imobiliário', value: checkFinanciamento, set: setCheckFinanciamento },
                { label: 'Assessoria de ITBI', value: checkItbi, set: setCheckItbi },
                { label: 'Assessoria Registro', value: checkRegistro, set: setCheckRegistro },
                { label: 'Contrato / Jurídico', value: checkJuridico, set: setCheckJuridico },
              ].map(({ label, value, set }) => (
                <label key={label} className="flex items-center gap-2.5 cursor-pointer group">
                  <div
                    onClick={() => set(!value)}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      value
                        ? 'bg-fonti-primary border-fonti-primary'
                        : 'border-gray-300 group-hover:border-fonti-primary'
                    }`}
                  >
                    {value && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor total dos serviços (R$)</label>
            <input
              type="text"
              value={valorServicos}
              onChange={(e) => setValorServicos(e.target.value)}
              placeholder="3500.00"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fonti-accent"
            />
            <p className="text-xs text-gray-400 mt-1">
              {(processo as any).valor_assessoria
                ? `Valor do processo: R$ ${Number((processo as any).valor_assessoria).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : 'Nenhum valor de assessoria cadastrado no processo'}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTela('selecao')}
            className="text-xs border-gray-200 text-gray-600"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleGerarAssessoria}
            disabled={gerando}
            className="gap-1.5 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white"
          >
            {gerando ? 'Gerando...' : 'Gerar Contrato'}
          </Button>
        </div>
      </div>
    )
  }

  // Tela D — editor ativo
  return (
    <div className="space-y-3">
      {/* Cabeçalho do editor */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={handleTrocarModelo}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-fonti-primary transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {contratos.length > 0 ? 'Contratos' : 'Trocar modelo'}
          </button>
          <span className="text-gray-300">|</span>
          <p className="text-sm font-semibold text-fonti-primary">{tituloAtivo}</p>
          {contratoAtivo && <span className="text-xs text-gray-400">v{contratoAtivo.versao}</span>}
          {versaoCongelada && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
              <Lock className="h-3 w-3" /> Somente leitura — versão já enviada
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {versaoCongelada ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={handleCriarNovaVersao}
              disabled={criarNovaVersao.isPending}
            >
              <Copy className="h-3.5 w-3.5" />
              {criarNovaVersao.isPending ? 'Criando...' : 'Criar nova versão'}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-fonti-accent/60 text-fonti-primary hover:bg-fonti-accent-hover"
                onClick={handleGerarPdf}
                disabled={gerarPdf.isPending || !contratoAtivoId}
                title={!contratoAtivoId ? 'Salve a minuta antes de gerar o PDF' : undefined}
              >
                {gerarPdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileOutput className="h-3.5 w-3.5" />}
                {gerarPdf.isPending ? 'Gerando PDF...' : contratoAtivo?.pdf_storage_path ? 'Atualizar PDF' : 'Gerar PDF'}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                onClick={handleSalvar}
                disabled={salvar.isPending}
              >
                <Save className="h-3.5 w-3.5" />
                {salvar.isPending ? 'Salvando...' : 'Salvar minuta'}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-gray-200 text-gray-600 disabled:opacity-40"
            onClick={handleVisualizarPdf}
            disabled={!contratoAtivo?.pdf_storage_path}
          >
            <Eye className="h-3.5 w-3.5" />
            Visualizar PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-gray-200 text-gray-600 disabled:opacity-40"
            onClick={handleBaixarPdf}
            disabled={!contratoAtivo?.pdf_storage_path}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar PDF
          </Button>
        </div>
      </div>

      {/* Barra de ferramentas — some quando a versão está congelada (só leitura) */}
      {!versaoCongelada && (
      <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg bg-gray-50 p-1 flex-wrap">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold') ?? false}
          title="Negrito"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic') ?? false}
          title="Itálico"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive('underline') ?? false}
          title="Sublinhado"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('left').run()}
          active={editor?.isActive({ textAlign: 'left' }) ?? false}
          title="Alinhar à esquerda"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('center').run()}
          active={editor?.isActive({ textAlign: 'center' }) ?? false}
          title="Centralizar"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('right').run()}
          active={editor?.isActive({ textAlign: 'right' }) ?? false}
          title="Alinhar à direita"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
          active={editor?.isActive({ textAlign: 'justify' }) ?? false}
          title="Justificar"
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().undo().run()}
          active={false}
          title="Desfazer"
          disabled={!editor?.can().undo()}
        >
          <Undo className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().redo().run()}
          active={false}
          title="Refazer"
          disabled={!editor?.can().redo()}
        >
          <Redo className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      )}

      {/* Área do editor */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <EditorContent editor={editor} />
      </div>

      <p className="text-xs text-gray-400">
        Campos marcados como <span className="font-mono text-amber-600">[A PREENCHER]</span> precisam ser preenchidos manualmente antes de exportar.
      </p>

      {/* Painel de Assinatura Eletrônica */}
      {contratoAtivoId && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <p className="text-xs font-semibold text-fonti-primary uppercase tracking-wide">Assinatura Eletrônica</p>

          {csStatus?.clicksign_status === 'closed' ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>
                  Assinado em{' '}
                  {csStatus.clicksign_assinado_em
                    ? format(new Date(csStatus.clicksign_assinado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {csStatus.clicksign_signed_url ? (
                  <a
                    href={csStatus.clicksign_signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-fonti-primary border border-fonti-accent/60 rounded-lg px-3 py-1.5 hover:bg-fonti-accent-hover transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Ver contrato assinado
                  </a>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5 text-xs border-gray-200 text-gray-600 hover:bg-gray-100"
                    onClick={handleVerificarClicksign}
                    disabled={verificandoClicksign}
                  >
                    {verificandoClicksign
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando PDF...</>
                      : <><Download className="h-3.5 w-3.5" />Buscar PDF assinado</>
                    }
                  </Button>
                )}
              </div>
            </div>
          ) : csStatus?.clicksign_status === 'running' ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Aguardando assinatura — enviado em{' '}
                  {csStatus.clicksign_enviado_em
                    ? format(new Date(csStatus.clicksign_enviado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : '—'}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 text-xs border-gray-200 text-gray-600 hover:bg-gray-100"
                onClick={handleVerificarClicksign}
                disabled={verificandoClicksign}
              >
                {verificandoClicksign
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Verificando...</>
                  : <><RefreshCw className="h-3.5 w-3.5" />Verificar assinaturas</>
                }
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                Salve o contrato e clique em "Enviar para Clicksign" para solicitar assinatura eletrônica.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 text-xs border-fonti-accent/60 text-fonti-primary hover:bg-fonti-accent-hover"
                onClick={handleEnviarClicksign}
                disabled={enviandoClicksign}
              >
                {enviandoClicksign
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Enviando...</>
                  : <><Send className="h-3.5 w-3.5" />Enviar para Clicksign</>
                }
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  children,
  onClick,
  active,
  title,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  title: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? 'bg-fonti-primary text-white'
          : 'text-gray-600 hover:bg-gray-200 hover:text-fonti-primary'
      }`}
    >
      {children}
    </button>
  )
}
