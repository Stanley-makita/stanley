'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Upload, Download, Trash2, Loader2, FolderOpen, ExternalLink, Sparkles } from 'lucide-react'
import { formatarTamanho, iconeParaMime } from '@/lib/formatarTamanho'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { DocumentoOcrRevisaoModal } from '@/components/documentos/DocumentoOcrRevisaoModal'
import { DocumentoFgtsRevisaoModal } from '@/components/documentos/DocumentoFgtsRevisaoModal'

const BUCKET = 'documentos-clientes'

const TIPOS_DOCUMENTO = [
  { value: 'rg',                   label: 'RG' },
  { value: 'cnh',                  label: 'CNH' },
  { value: 'comprovante_renda',    label: 'Comp. de Renda' },
  { value: 'comprovante_endereco', label: 'Comp. de Endereço' },
  { value: 'extrato_fgts',         label: 'Extrato FGTS' },
  { value: 'matricula',            label: 'Matrícula do Imóvel' },
  { value: 'contrato',             label: 'Contrato' },
  { value: 'outro',                label: 'Outro' },
] as const

type TipoDocumento = typeof TIPOS_DOCUMENTO[number]['value']

interface DocumentoCliente {
  id: string
  nome_original: string
  mime_type: string | null
  tamanho_bytes: number | null
  storage_path: string
  classificacao: string | null
  ocr_status: string | null
  ocr_dados: Record<string, unknown> | null
  created_at: string
}

interface Props {
  processoId?: string
}

export function AbaDocumentos({ processoId }: Props) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)
  const [tipo, setTipo] = useState<TipoDocumento>('outro')
  const [fazendoUpload, setFazendoUpload] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)
  const [docOcrRevisao, setDocOcrRevisao] = useState<DocumentoCliente | null>(null)
  const [docFgtsRevisao, setDocFgtsRevisao] = useState<DocumentoCliente | null>(null)

  const queryKey = ['documentos-processo', processoId]

  const { data: documentos = [], isLoading } = useQuery({
    queryKey,
    enabled: !!usuario && !!processoId,
    queryFn: async (): Promise<DocumentoCliente[]> => {
      const { data, error } = await supabase
        .from('documentos_clientes')
        .select('id, nome_original, mime_type, tamanho_bytes, storage_path, classificacao, ocr_status, ocr_dados, created_at')
        .eq('processo_id', processoId!)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as DocumentoCliente[]
    },
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('documentos_clientes')
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

  function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setArquivoSelecionado(arquivo)
    setTipo('outro')
    setModalAberto(true)
    e.target.value = ''
  }

  async function handleUpload() {
    if (!arquivoSelecionado || !usuario || !processoId) return

    setFazendoUpload(true)
    let storagePath: string | null = null
    try {
      // Busca pessoa_id do comprador principal — com fallback por CPF e nome
      const { data: comprador } = await supabase
        .from('processo_compradores')
        .select('pessoa_id, cpf, nome')
        .eq('processo_id', processoId)
        .eq('empresa_id', usuario.empresa_id)
        .eq('principal', true)
        .maybeSingle()

      let pessoaIdUpload: string | null = comprador?.pessoa_id ?? null
      if (!pessoaIdUpload && comprador?.cpf) {
        const { data: p } = await supabase
          .from('pessoas').select('id').eq('empresa_id', usuario.empresa_id).eq('cpf', comprador.cpf).maybeSingle()
        pessoaIdUpload = p?.id ?? null
      }
      if (!pessoaIdUpload && comprador?.nome) {
        const { data: p } = await supabase
          .from('pessoas').select('id').eq('empresa_id', usuario.empresa_id).ilike('nome', comprador.nome).maybeSingle()
        pessoaIdUpload = p?.id ?? null
      }

      const ext = arquivoSelecionado.name.split('.').pop() ?? 'bin'
      storagePath = `${usuario.empresa_id}/${processoId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, arquivoSelecionado, { upsert: false })

      if (uploadError) {
        toast.error(`Erro no storage: ${uploadError.message}`)
        storagePath = null
        return
      }

      const { data: docInserido, error: dbError } = await supabase
        .from('documentos_clientes')
        .insert({
          empresa_id:    usuario.empresa_id,
          processo_id:   processoId,
          pessoa_id:     pessoaIdUpload,
          nome_original: arquivoSelecionado.name,
          mime_type:     arquivoSelecionado.type || null,
          tamanho_bytes: arquivoSelecionado.size,
          storage_bucket: BUCKET,
          storage_path:  storagePath,
          canal_origem:  'upload_manual',
          classificacao: tipo,
          ocr_status:    'pendente',
        })
        .select('id')
        .single()

      if (dbError) {
        supabase.storage.from(BUCKET).remove([storagePath])
        storagePath = null
        toast.error(`Erro ao salvar: ${dbError.message}`)
        return
      }

      queryClient.invalidateQueries({ queryKey })
      toast.success('Documento enviado com sucesso.')
      setModalAberto(false)
      setArquivoSelecionado(null)

      // OCR automático para extrato FGTS
      if (tipo === 'extrato_fgts' && docInserido?.id) {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        if (token) {
          fetch(`/api/documentos/${docInserido.id}/ocr-iniciar`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(() => setTimeout(() => queryClient.invalidateQueries({ queryKey }), 3000))
            .catch(console.error)
        }
      }
    } catch (err) {
      if (storagePath) supabase.storage.from(BUCKET).remove([storagePath])
      toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setFazendoUpload(false)
    }
  }

  async function gerarSignedUrl(storagePath: string): Promise<string | null> {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600)
    return data?.signedUrl ?? null
  }

  async function handleVisualizar(doc: DocumentoCliente) {
    const url = await gerarSignedUrl(doc.storage_path)
    if (!url) { toast.error('Não foi possível abrir o documento.'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleDownload(doc: DocumentoCliente) {
    const url = await gerarSignedUrl(doc.storage_path)
    if (!url) { toast.error('Não foi possível baixar o documento.'); return }
    const link = document.createElement('a')
    link.href = url
    link.download = doc.nome_original
    link.click()
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
    return TIPOS_DOCUMENTO.find(t => t.value === classificacao)?.label ?? classificacao ?? '—'
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-medium">
          {documentos.length} documento{documentos.length !== 1 ? 's' : ''}
        </p>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3 w-3" />
          Adicionar Documento
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={handleArquivoSelecionado}
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse h-14 bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : documentos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <FolderOpen className="h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-400">Nenhum documento neste processo</p>
          <p className="text-xs text-gray-300 mt-1">
            Adicione PDFs ou imagens relacionados a este processo.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {documentos.map((doc) => {
            const icone = iconeParaMime(doc.mime_type ?? '')
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
              >
                <span className="text-xl shrink-0">{icone}</span>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => handleVisualizar(doc)}
                    className="text-sm font-medium text-[#253B29] hover:underline truncate block text-left w-full"
                    title="Abrir no navegador"
                  >
                    {doc.nome_original}
                  </button>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-400">{labelTipo(doc.classificacao)}</span>
                    {doc.tamanho_bytes != null && (
                      <span className="text-xs text-gray-300">· {formatarTamanho(doc.tamanho_bytes)}</span>
                    )}
                    <span className="text-xs text-gray-300">
                      · {format(new Date(doc.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Badge FGTS — OCR concluído para extrato */}
                  {doc.ocr_status === 'concluido' && doc.classificacao === 'extrato_fgts' && (
                    <button
                      onClick={() => setDocFgtsRevisao(doc)}
                      title="Revisar dados FGTS extraídos"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                    >
                      <Sparkles className="h-3 w-3" />
                      FGTS
                    </button>
                  )}
                  {/* Badge Revisar — OCR concluído para outros tipos */}
                  {doc.ocr_status === 'concluido' && doc.classificacao !== 'extrato_fgts' && (
                    <button
                      onClick={() => setDocOcrRevisao(doc)}
                      title="Revisar dados extraídos do documento"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      <Sparkles className="h-3 w-3" />
                      Revisar
                    </button>
                  )}
                  {/* Badge OCR em andamento */}
                  {doc.ocr_status === 'processando' && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Processando...
                    </span>
                  )}
                  <button
                    onClick={() => handleVisualizar(doc)}
                    title="Abrir no navegador"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#253B29] hover:bg-gray-100 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    title="Baixar arquivo"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#253B29] hover:bg-gray-100 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
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
            )
          })}
        </div>
      )}

      {/* Modal OCR — RG, CNH, comprovantes */}
      {docOcrRevisao && (
        <DocumentoOcrRevisaoModal
          documento={docOcrRevisao}
          onClose={() => setDocOcrRevisao(null)}
          onConfirmado={() => {
            setDocOcrRevisao(null)
            queryClient.invalidateQueries({ queryKey })
          }}
        />
      )}

      {/* Modal OCR — FGTS */}
      {docFgtsRevisao && (
        <DocumentoFgtsRevisaoModal
          documento={docFgtsRevisao}
          onClose={() => setDocFgtsRevisao(null)}
          onConfirmado={() => {
            setDocFgtsRevisao(null)
            queryClient.invalidateQueries({ queryKey })
          }}
        />
      )}

      {/* Modal de classificação */}
      <Dialog
        open={modalAberto}
        onOpenChange={(v) => { if (!v && !fazendoUpload) { setModalAberto(false); setArquivoSelecionado(null) } }}
      >
        <DialogContent className="max-w-sm p-0 flex flex-col overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
            <h2 className="text-base font-semibold text-[#253B29]">Classificar Documento</h2>
            <p className="text-xs text-gray-400 mt-0.5">Selecione o tipo antes de enviar</p>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-hidden">
            {arquivoSelecionado && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-lg shrink-0">{iconeParaMime(arquivoSelecionado.type)}</span>
                <div className="overflow-hidden">
                  <p className="text-xs font-medium text-gray-800 truncate max-w-[260px]">{arquivoSelecionado.name}</p>
                  <p className="text-xs text-gray-400">{formatarTamanho(arquivoSelecionado.size)}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Tipo de Documento</p>
              <div className="flex flex-col gap-1.5">
                {TIPOS_DOCUMENTO.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipo(t.value)}
                    className={cn(
                      'text-xs px-3 py-2 rounded-lg border text-left transition-all',
                      tipo === t.value
                        ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 pb-5 pt-2 border-t border-gray-100 shrink-0">
            <Button
              variant="outline"
              onClick={() => { setModalAberto(false); setArquivoSelecionado(null) }}
              disabled={fazendoUpload}
            >
              Cancelar
            </Button>
            <Button
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[100px]"
              onClick={handleUpload}
              disabled={fazendoUpload}
            >
              {fazendoUpload ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
