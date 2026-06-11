'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface DocumentoCliente {
  id: string
  nome_original: string
  mime_type: string | null
  ocr_status: string | null
  classificacao: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  documentos: DocumentoCliente[]
  onAtualizado: () => void
}

type Estado = 'selecionando' | 'processando' | 'concluido'

interface ResultadoItem {
  id: string
  nome: string
  status: string
  classificacao: string | null
}

function badgeStatusDoc(doc: DocumentoCliente) {
  if (doc.ocr_status === 'concluido') {
    return <span className="text-xs text-green-600 font-medium">Lido</span>
  }
  if (doc.ocr_status === 'aguardando_apuracao') {
    return <span className="text-xs text-blue-600 font-medium">Aguardando análise</span>
  }
  if (doc.ocr_status === 'erro') {
    return <span className="text-xs text-red-500 font-medium">Erro</span>
  }
  if (doc.ocr_status === 'processando') {
    return <span className="text-xs text-gray-500 font-medium">Lendo...</span>
  }
  if (doc.ocr_status === 'ignorado') {
    return <span className="text-xs text-gray-400 font-medium">Ignorado</span>
  }
  return <span className="text-xs text-amber-600 font-medium">Aguardando leitura</span>
}

export function ExtracaoDadosModal({ open, onClose, documentos, onAtualizado }: Props) {
  const [estado, setEstado] = useState<Estado>('selecionando')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 })
  const [resultados, setResultados] = useState<ResultadoItem[]>([])

  useEffect(() => {
    if (!open) return
    setEstado('selecionando')
    setResultados([])
    setProgresso({ atual: 0, total: 0 })
    setSelecionados(new Set())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDoc(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function iniciarExtracao() {
    const ids = Array.from(selecionados)
    if (ids.length === 0) return

    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    if (!token) return

    setEstado('processando')
    setProgresso({ atual: 0, total: ids.length })
    const items: ResultadoItem[] = []

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const doc = documentos.find(d => d.id === id)
      setProgresso({ atual: i + 1, total: ids.length })

      try {
        const res = await fetch(`/api/documentos/${id}/ocr-iniciar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json().catch(() => ({}))

        let status: string
        let classificacao: string | null = null

        if (!res.ok && json.error === 'OCR já processado') {
          status = doc?.ocr_status ?? 'concluido'
          classificacao = doc?.classificacao ?? null
        } else if (json.skipped && json.motivo) {
          status = json.motivo
          classificacao = null
        } else {
          status = json.ocr_status ?? (res.ok ? 'concluido' : 'erro')
          classificacao = json.classificacao ?? null
        }

        items.push({ id, nome: doc?.nome_original ?? id, status, classificacao })
      } catch {
        items.push({ id, nome: doc?.nome_original ?? id, status: 'erro', classificacao: null })
      }

      onAtualizado()
    }

    setResultados(items)
    setEstado('concluido')
  }

  const qtdSelecionados = selecionados.size

  const lidos = resultados.filter(r => r.status === 'concluido')
  const comErro = resultados.filter(r => r.status === 'erro')
  const aguardandoAnalise = resultados.filter(r => r.status === 'aguardando_apuracao')

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && estado !== 'processando') onClose() }}>
      <DialogContent className="max-w-lg p-0 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-[#253B29]">Extrair dados dos documentos</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {estado === 'selecionando' && 'Selecione os documentos que deseja que o sistema leia.'}
            {estado === 'processando' && `Lendo documento ${progresso.atual} de ${progresso.total}…`}
            {estado === 'concluido' && 'Extração concluída.'}
          </p>
        </div>

        {/* Selecionando */}
        {estado === 'selecionando' && (
          <>
            <div className="px-6 py-4 space-y-2 overflow-y-auto flex-1">
              {documentos.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum documento disponível.</p>
              ) : (
                documentos.map(doc => (
                  <label
                    key={doc.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-amber-50 hover:border-amber-100 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selecionados.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                      className="rounded shrink-0"
                    />
                    <span className="flex-1 text-xs font-medium text-gray-700 truncate min-w-0" title={doc.nome_original}>
                      {doc.nome_original.length > 40 ? doc.nome_original.slice(0, 37) + '...' : doc.nome_original}
                    </span>
                    <span className="shrink-0">{badgeStatusDoc(doc)}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 pb-5 pt-3 border-t border-gray-100 shrink-0">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                className="bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[180px]"
                onClick={iniciarExtracao}
                disabled={qtdSelecionados === 0}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Extrair dados ({qtdSelecionados} selecionado{qtdSelecionados !== 1 ? 's' : ''})
              </Button>
            </div>
          </>
        )}

        {/* Processando */}
        {estado === 'processando' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <Loader2 className="h-10 w-10 animate-spin text-[#253B29]" />
            <p className="text-sm text-gray-600 font-medium text-center">
              Lendo documento {progresso.atual} de {progresso.total}…
            </p>
            <p className="text-xs text-gray-400 text-center">Aguarde, isso pode levar alguns segundos por documento.</p>
          </div>
        )}

        {/* Concluído */}
        {estado === 'concluido' && (
          <>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {lidos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Lidos com sucesso ({lidos.length})
                  </p>
                  <div className="space-y-1.5">
                    {lidos.map(r => (
                      <div key={r.id} className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-100">
                        <span className="flex-1 text-xs text-gray-700 truncate">{r.nome}</span>
                        <span className="text-xs text-green-600 font-medium shrink-0">Revisar dados extraídos</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aguardandoAnalise.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Aguardando análise de extrato ({aguardandoAnalise.length})
                  </p>
                  <div className="space-y-1.5">
                    {aguardandoAnalise.map(r => (
                      <div key={r.id} className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                        <span className="flex-1 text-xs text-gray-700 truncate">{r.nome}</span>
                        <span className="text-xs text-blue-600 font-medium shrink-0">Use "Analisar Extratos"</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {comErro.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Com erro ({comErro.length})
                  </p>
                  <div className="space-y-1.5">
                    {comErro.map(r => (
                      <div key={r.id} className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-100">
                        <span className="flex-1 text-xs text-gray-700 truncate">{r.nome}</span>
                        <span className="text-xs text-red-500 font-medium shrink-0">Erro na leitura</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end px-6 pb-5 pt-3 border-t border-gray-100 shrink-0">
              <Button className="bg-[#253B29] hover:bg-[#1a2b1e] text-white" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
