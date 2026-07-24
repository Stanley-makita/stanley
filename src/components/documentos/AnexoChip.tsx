'use client'

import { FileText, X, Loader2, Paperclip } from 'lucide-react'
import { abrirAnexo, type AnexoEntidade } from '@/lib/documentos/anexoEntidade'
import { toast } from 'sonner'

function ehImagem(mime: string | null | undefined) {
  return !!mime && mime.startsWith('image/')
}

/** Chip de um anexo já enviado — clica pra abrir (URL assinada, gerada na hora). */
export function AnexoChipEnviado({ anexo }: { anexo: AnexoEntidade }) {
  async function abrir() {
    const url = await abrirAnexo(anexo)
    if (!url) { toast.error('Não foi possível abrir o anexo.'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={abrir}
      className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 hover:border-fonti-primary/40 hover:text-fonti-primary transition-colors max-w-full"
      title={anexo.nome_original}
    >
      {ehImagem(anexo.mime_type)
        ? <Paperclip className="h-3 w-3 shrink-0" />
        : <FileText className="h-3 w-3 shrink-0" />}
      <span className="truncate">{anexo.nome_original}</span>
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
