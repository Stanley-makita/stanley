'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { FileText, Download, FolderOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  processoId?: string
}

type Documento = {
  id: string
  nome_original: string
  mime_type: string | null
  tamanho_bytes: number | null
  storage_path: string
  canal_origem: string
  created_at: string
}

function fmtTamanho(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function AbaDocumentos({ processoId }: Props) {
  const { usuario } = useAuth()

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documentos-processo', processoId],
    enabled: !!usuario && !!processoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentos_clientes')
        .select('id, nome_original, mime_type, tamanho_bytes, storage_path, canal_origem, created_at')
        .eq('processo_id', processoId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Documento[]
    },
  })

  async function baixar(doc: Documento) {
    const { data } = await supabase.storage
      .from('documentos-clientes')
      .createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = doc.nome_original
      a.target = '_blank'
      a.click()
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Carregando documentos...</span>
      </div>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
          <FolderOpen className="h-7 w-7 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-500">Nenhum documento</p>
        <p className="text-xs text-gray-400">
          Clique em <strong>Formulários</strong> para gerar os PDFs do banco automaticamente.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-gray-400 mb-3">{docs.length} documento(s)</p>
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all"
        >
          <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 truncate">{doc.nome_original}</p>
            <p className="text-xs text-gray-400">
              {fmtTamanho(doc.tamanho_bytes)} · {fmtData(doc.created_at)}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-gray-400 hover:text-[#253B29]"
            onClick={() => baixar(doc)}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
