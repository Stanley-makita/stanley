'use client'

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Button } from '@/components/ui/button'
import {
  Bold, Italic, UnderlineIcon, AlignLeft, AlignCenter, AlignRight,
  AlignJustify, Undo, Redo, FileText, Printer, Save, ChevronLeft,
} from 'lucide-react'
import { useProcessoContrato, useSalvarContrato } from '@/hooks/processos/useProcessoContrato'
import { useProcessoCompradores } from '@/hooks/processos/useProcessoCompradores'
import { useProcessoVendedores } from '@/hooks/processos/useProcessoVendedores'
import { substituirVariaveis } from '@/lib/contratos/substituirVariaveis'
import {
  TEMPLATE_COMPRA_VENDA,
  TEMPLATE_DISTRATO_LOCACAO,
  TEMPLATE_LOCACAO_IMOVEL,
  TEMPLATE_PRESTACAO_SERVICOS,
  TODOS_TEMPLATES,
} from '@/lib/contratos/templates'
import type { Processo } from '@/types/processos'

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

export function AbaContrato({ processoId, processo }: Props) {
  const { data: contrato, isLoading } = useProcessoContrato(processoId)
  const { data: compradores = [] } = useProcessoCompradores(processoId)
  const { data: vendedores = [] } = useProcessoVendedores(processoId)
  const salvar = useSalvarContrato(processoId)

  const [modeloAtivo, setModeloAtivo] = useState<string | null>(null)
  const [tituloAtivo, setTituloAtivo] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[600px] p-6 focus:outline-none font-serif text-sm leading-relaxed',
      },
    },
  })

  // Ao carregar, se já existe contrato salvo, abre direto no editor
  useEffect(() => {
    if (contrato && editor && !editor.isDestroyed) {
      editor.commands.setContent(contrato.conteudo_html)
      setModeloAtivo(contrato.tipo_modelo)
      setTituloAtivo(contrato.titulo)
    }
  }, [contrato, editor])

  function selecionarModelo(id: string) {
    const template = TEMPLATES_MAP[id as keyof typeof TEMPLATES_MAP]
    if (!template || !editor) return

    const htmlPreenchido = substituirVariaveis(template.conteudo, processo, compradores, vendedores)
    editor.commands.setContent(htmlPreenchido)
    setModeloAtivo(id)
    setTituloAtivo(template.titulo)
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
    const conteudo = editor.getHTML()
    const janela = window.open('', '_blank')
    if (!janela) return
    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${tituloAtivo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
      padding: 2.5cm 3cm;
    }
    h2 { font-size: 13pt; margin-bottom: 1em; }
    h3 { font-size: 12pt; margin-top: 1.5em; margin-bottom: 0.5em; }
    p { margin-bottom: 0.8em; text-align: justify; }
    ul { margin: 0.5em 0 0.8em 1.5em; }
    li { margin-bottom: 0.3em; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    @page { size: A4; margin: 0; }
    @media print { body { padding: 2.5cm 3cm; } }
  </style>
</head>
<body>${conteudo}</body>
</html>`)
    janela.document.close()
    janela.focus()
    setTimeout(() => janela.print(), 250)
  }

  function handleTrocarModelo() {
    const confirmado = window.confirm(
      'Ao trocar o modelo o rascunho atual não será salvo automaticamente. Deseja continuar?'
    )
    if (!confirmado) return
    setModeloAtivo(null)
    setTituloAtivo('')
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

  // Estado A — seleção de modelo
  if (!modeloAtivo) {
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

  // Estado B/C — editor ativo
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
