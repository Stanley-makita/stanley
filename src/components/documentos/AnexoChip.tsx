'use client'

import { useState, useEffect } from 'react'
import { FileText, X, Loader2, ExternalLink } from 'lucide-react'
import { abrirAnexo, type AnexoEntidade } from '@/lib/documentos/anexoEntidade'
import { toast } from 'sonner'

function ehImagem(mime: string | null | undefined) {
  return !!mime && mime.startsWith('image/')
}

/**
 * Anexo já enviado, exibido como numa conversa: imagem vira preview inline
 * (clica pra abrir em tamanho real), documento vira um cartão com nome e
 * ícone (clica pra abrir).
 */
export function AnexoChipEnviado({ anexo }: { anexo: AnexoEntidade }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const imagem = ehImagem(anexo.mime_type)

  useEffect(() => {
    if (!imagem) return
    let cancelado = false
    abrirAnexo(anexo).then((url) => { if (!cancelado) setPreviewUrl(url) })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anexo.id])

  async function abrir() {
    const url = imagem ? previewUrl : await abrirAnexo(anexo)
    if (!url) { toast.error('Não foi possível abrir o anexo.'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (imagem) {
    return (
      <button
        type="button"
        onClick={abrir}
        title={anexo.nome_original}
        className="block max-w-[220px] overflow-hidden rounded-lg border border-gray-200 hover:border-fonti-primary/40 transition-colors"
      >
        {previewUrl
          ? <img src={previewUrl} alt={anexo.nome_original} className="max-h-52 w-full object-cover" />
          : <div className="flex h-24 w-full items-center justify-center bg-gray-50"><Loader2 className="h-4 w-4 animate-spin text-gray-300" /></div>}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={abrir}
      title={anexo.nome_original}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-600 hover:border-fonti-primary/40 hover:text-fonti-primary transition-colors max-w-[220px]"
    >
      <FileText className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="truncate flex-1 text-left">{anexo.nome_original}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </button>
  )
}

/** Chip de um anexo ainda não enviado (pendente na composição). */
export function AnexoChipPendente({
  arquivo, previewUrl, onRemover, enviando,
}: {
  arquivo: File
  previewUrl: string | null
  onRemover: () => void
  enviando?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-fonti-accent bg-fonti-accent-hover/30 pl-1.5 pr-1 py-1 text-xs text-gray-700 max-w-full">
      {previewUrl
        ? <img src={previewUrl} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
        : <FileText className="h-3.5 w-3.5 shrink-0 text-gray-500" />}
      <span className="truncate max-w-[140px]">{arquivo.name}</span>
      {enviando
        ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-400" />
        : (
          <button
            type="button"
            onClick={onRemover}
            className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <X className="h-3 w-3" />
          </button>
        )}
    </div>
  )
}
