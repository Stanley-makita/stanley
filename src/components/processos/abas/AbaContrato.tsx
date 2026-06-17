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
  AlignJustify, Undo, Redo, FileText, Printer, Save, ChevronLeft,
  Send, CheckCircle, Clock, Download, Loader2, RefreshCw,
} from 'lucide-react'
import { useProcessoContrato, useSalvarContrato } from '@/hooks/processos/useProcessoContrato'
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

type Tela = 'selecao' | 'configurando_assessoria' | 'editor'

export function AbaContrato({ processoId, processo }: Props) {
  const { data: contrato, isLoading } = useProcessoContrato(processoId)
  const { data: compradores = [] } = useProcessoCompradores(processoId)
  const { data: vendedores = [] } = useProcessoVendedores(processoId)
  const salvar = useSalvarContrato(processoId)

  const [tela, setTela] = useState<Tela>('selecao')
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

  const { data: csStatus, invalidar: invalidarClicksign } = useContratoClicksign(contrato?.id ?? null)

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

  // Ao carregar, se já existe contrato salvo, abre direto no editor
  useEffect(() => {
    if (contrato && editor && !editor.isDestroyed) {
      editor.commands.setContent(contrato.conteudo_html)
      setModeloAtivo(contrato.tipo_modelo)
      setTituloAtivo(contrato.titulo)
      setTela('editor')
    }
  }, [contrato, editor])

  async function abrirConfiguracaoAssessoria() {
    // Pré-preencher com dados do processo
    setCheckFinanciamento(processo.tem_assessoria ?? false)
    setCheckItbi(processo.tem_assessoria ?? false)
    setCheckRegistro(processo.tem_assessoria ?? false)
    setCheckJuridico(false)

    const va = (processo as any).valor_assessoria
    setValorServicos(va ? String(va) : '')

    // Buscar prévia do número (sem consumir)
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
      // Reservar o número definitivo
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
      setModeloAtivo('prestacao_servicos')
      setTituloAtivo(TEMPLATE_PRESTACAO_SERVICOS.titulo)
      setTela('editor')
    } catch (err) {
      console.error('[AbaContrato] erro ao gerar contrato de assessoria:', err)
    } finally {
      setGerando(false)
    }
  }

  function gerarHtmlImpressao(conteudo: string, titulo: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.6; color: #000; padding: 2.5cm 3cm; }
    h2 { font-size: 12pt; margin-bottom: 1em; }
    h3 { font-size: 11pt; margin-top: 1.5em; margin-bottom: 0.5em; }
    p { margin-bottom: 0.8em; text-align: justify; }
    ul { margin: 0.5em 0 0.8em 1.5em; }
    li { margin-bottom: 0.3em; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
    th, td { border: 1px solid #aaa; padding: 7px 12px; vertical-align: top; }
    th { background: #eeeeee; font-weight: bold; text-align: left; }
    hr { border: none; border-top: 1px solid #555; margin: 1.2em 0; }
    .sig-table td { border: 1px solid #aaa; padding: 14px 16px; vertical-align: top; width: 50%; }
    @page { size: A4; margin: 0; }
    @media print { body { padding: 2.5cm 3cm; } }
  </style>
</head>
<body>${conteudo}</body>
</html>`
  }

  async function handleEnviarClicksign() {
    if (!editor || !contrato?.id) return

    const comprador = compradores[0]
    if (!comprador?.email) {
      alert('O comprador não tem e-mail cadastrado. Cadastre o e-mail antes de enviar para assinatura.')
      return
    }

    setEnviandoClicksign(true)
    let iframe: HTMLIFrameElement | null = null

    try {
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas')).default

      const htmlCompleto = gerarHtmlImpressao(editor.getHTML(), tituloAtivo)

      // Iframe oculto garante contexto de renderização isolado, CSS no <head> e fontes carregadas
      iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:794px;height:1123px;opacity:0;pointer-events:none;z-index:-1;'
      document.body.appendChild(iframe)

      // Aguardar carregamento completo do iframe
      await new Promise<void>((resolve) => {
        iframe!.onload = () => resolve()
        iframe!.srcdoc = htmlCompleto
      })

      // Aguardar fontes carregarem quando disponível
      if (iframe.contentDocument?.fonts?.ready) {
        await iframe.contentDocument.fonts.ready
      }

      // Garantir que o browser terminou a pintura antes de capturar
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const A4_WIDTH_MM = 210
      const A4_HEIGHT_MM = 297

      const canvas = await html2canvas(iframe.contentDocument!.body, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fff',
        windowWidth: 794,
      })

      const imgWidth = A4_WIDTH_MM
      const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width
      const imgData = canvas.toDataURL('image/jpeg', 0.92)

      let yPos = 0
      let pageNum = 0
      while (yPos < imgHeight) {
        if (pageNum > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, -yPos, imgWidth, imgHeight)
        yPos += A4_HEIGHT_MM
        pageNum++
      }

      const pdfBase64 = pdf.output('datauristring').split(',')[1]
      const filename = `${tituloAtivo || 'contrato'}.pdf`

      const res = await fetch('/api/clicksign/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processo_contrato_id: contrato.id,
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
      if (iframe && document.body.contains(iframe)) {
        document.body.removeChild(iframe)
      }
      setEnviandoClicksign(false)
    }
  }

  async function handleVerificarClicksign() {
    if (!contrato?.id) return
    setVerificandoClicksign(true)
    try {
      const res = await fetch('/api/clicksign/atualizar-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_contrato_id: contrato.id }),
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
    setModeloAtivo(id)
    setTituloAtivo(template.titulo)
    setTela('editor')
  }

  function handleSalvar() {
    if (!editor || !modeloAtivo) return
    salvar.mutate({
      tipo_modelo: modeloAtivo,
      titulo: tituloAtivo,
      conteudo_html: editor.getHTML(),
    })
  }

  function handleExportarPdf() {
    if (!editor) return
    const janela = window.open('', '_blank')
    if (!janela) return
    const blob = new Blob([gerarHtmlImpressao(editor.getHTML(), tituloAtivo)], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    janela.location.href = url
    janela.onload = () => {
      URL.revokeObjectURL(url)
      janela.focus()
      janela.print()
    }
  }

  function handleTrocarModelo() {
    const confirmado = window.confirm(
      'Ao trocar o modelo o rascunho atual não será salvo automaticamente. Deseja continuar?'
    )
    if (!confirmado) return
    setModeloAtivo(null)
    setTituloAtivo('')
    setTela('selecao')
    editor?.commands.clearContent()
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-8 bg-gray-100 rounded-lg w-1/3" />
        <div className="h-64 bg-gray-100 rounded-lg" />
      </div>
    )
  }

  // Tela A — seleção de modelo
  if (tela === 'selecao') {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-[#253B29]">Selecione um modelo de contrato</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            O sistema preenche automaticamente os dados já cadastrados no processo.
            Os campos em falta ficam marcados como <span className="font-mono">[A PREENCHER]</span> para edição manual.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {TODOS_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => selecionarModelo(t.id)}
              className="flex gap-3 items-start text-left border border-gray-200 rounded-xl p-4 hover:border-[#C2AA6A] hover:bg-[#E7E0C4]/20 transition-colors group"
            >
              <div className="w-9 h-9 shrink-0 bg-[#E7E0C4] rounded-lg flex items-center justify-center group-hover:bg-[#C2AA6A]/30 transition-colors">
                <FileText className="h-4 w-4 text-[#253B29]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#253B29]">{t.titulo}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t.descricao}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Tela B — painel de configuração de assessoria
  if (tela === 'configurando_assessoria') {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTela('selecao')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#253B29] transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
          <span className="text-gray-300">|</span>
          <p className="text-sm font-semibold text-[#253B29]">Configurar Contrato de Assessoria</p>
        </div>

        <div className="border border-gray-200 rounded-xl p-5 space-y-5 bg-white">
          {/* Número e data */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nº do contrato</label>
              <input
                type="text"
                value={numeroPrevia}
                onChange={(e) => setNumeroPrevia(e.target.value)}
                placeholder="78/2026"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C2AA6A]"
              />
              <p className="text-xs text-gray-400 mt-1">Número gerado automaticamente ao confirmar</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data</label>
              <input
                type="text"
                value={dataContrato}
                onChange={(e) => setDataContrato(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C2AA6A]"
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
                        ? 'bg-[#253B29] border-[#253B29]'
                        : 'border-gray-300 group-hover:border-[#253B29]'
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C2AA6A]"
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
            className="gap-1.5 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white"
          >
            {gerando ? 'Gerando...' : 'Gerar Contrato'}
          </Button>
        </div>
      </div>
    )
  }

  // Tela C — editor ativo
  return (
    <div className="space-y-3">
      {/* Cabeçalho do editor */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={handleTrocarModelo}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#253B29] transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Trocar modelo
          </button>
          <span className="text-gray-300">|</span>
          <p className="text-sm font-semibold text-[#253B29]">{tituloAtivo}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-[#C2AA6A]/60 text-[#253B29] hover:bg-[#E7E0C4]"
            onClick={handleExportarPdf}
          >
            <Printer className="h-3.5 w-3.5" />
            Exportar PDF
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white"
            onClick={handleSalvar}
            disabled={salvar.isPending}
          >
            <Save className="h-3.5 w-3.5" />
            {salvar.isPending ? 'Salvando...' : 'Salvar rascunho'}
          </Button>
        </div>
      </div>

      {/* Barra de ferramentas */}
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

      {/* Área do editor */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <EditorContent editor={editor} />
      </div>

      <p className="text-xs text-gray-400">
        Campos marcados como <span className="font-mono text-amber-600">[A PREENCHER]</span> precisam ser preenchidos manualmente antes de exportar.
      </p>

      {/* Painel de Assinatura Eletrônica */}
      {contrato?.id && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <p className="text-xs font-semibold text-[#253B29] uppercase tracking-wide">Assinatura Eletrônica</p>

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
              {csStatus.clicksign_signed_url && (
                <a
                  href={csStatus.clicksign_signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#253B29] border border-[#C2AA6A]/60 rounded-lg px-3 py-1.5 hover:bg-[#E7E0C4] transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar PDF assinado
                </a>
              )}
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
                className="shrink-0 gap-1.5 text-xs border-[#C2AA6A]/60 text-[#253B29] hover:bg-[#E7E0C4]"
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
          ? 'bg-[#253B29] text-white'
          : 'text-gray-600 hover:bg-gray-200 hover:text-[#253B29]'
      }`}
    >
      {children}
    </button>
  )
}
