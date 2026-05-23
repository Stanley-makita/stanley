'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, Trash2, Loader2 } from 'lucide-react'
import { ProcessoDocumento } from '@/types/documentos'
import { formatarTamanho, iconeParaMime } from '@/lib/formatarTamanho'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface DocumentoItemProps {
  documento: ProcessoDocumento
  onExcluir: () => void
  podeExcluir: boolean
}

export function DocumentoItem({ documento, onExcluir, podeExcluir }: DocumentoItemProps) {
  const supabase = createClient()
  const [baixando, setBaixando] = useState(false)

  async function handleDownload() {
    setBaixando(true)
    try {
      const { data, error } = await supabase.storage
        .from('documentos')
        .createSignedUrl(documento.storage_path, 3600)
      if (error) throw error
      // Abre em nova aba — o browser dispara o download se for PDF inline ou força para outros tipos
      window.open(data.signedUrl, '_blank')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <tr className="border-t hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{iconeParaMime(documento.mime_type ?? '')}</span>
          <span className="text-sm font-medium text-gray-800 truncate max-w-[260px]">
            {documento.nome}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
        {formatarTamanho(documento.tamanho ?? 0)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
        {documento.enviado_por_usuario?.nome ?? '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
        {format(new Date(documento.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={handleDownload}
            disabled={baixando}
            title="Baixar"
          >
            {baixando
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />
            }
          </Button>
          {podeExcluir && (
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={onExcluir}
              title="Excluir"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}