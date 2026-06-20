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
  mobile?: boolean
}

export function DocumentoItem({ documento, onExcluir, podeExcluir, mobile = false }: DocumentoItemProps) {
  const supabase = createClient()
  const [baixando, setBaixando] = useState(false)

  async function handleDownload() {
    setBaixando(true)
    try {
      const { data, error } = await supabase.storage
        .from('documentos')
        .createSignedUrl(documento.storage_path, 3600, { download: documento.nome })
      if (error) throw error
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = documento.nome
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } finally {
      setBaixando(false)
    }
  }

  if (mobile) {
    return (
      <div className="space-y-3 border-b bg-white p-4 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="text-lg leading-none">{iconeParaMime(documento.mime_type ?? '')}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">{documento.nome}</p>
              <p className="mt-1 text-xs text-gray-500">
                {formatarTamanho(documento.tamanho ?? 0)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleDownload}
              disabled={baixando}
              title="Baixar"
            >
              {baixando
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />
              }
            </Button>
            {podeExcluir && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                onClick={onExcluir}
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-1 text-xs text-gray-400">
          <span>Enviado por {documento.enviado_por_usuario?.nome ?? '-'}</span>
          <span>{format(new Date(documento.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
        </div>
      </div>
    )
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
