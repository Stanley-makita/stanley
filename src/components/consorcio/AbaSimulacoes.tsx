'use client'

import { useState, useRef } from 'react'
import { useSimulacoes, useAdicionarSimulacao, useRemoverSimulacao } from '@/hooks/consorcio/useConsorcioSimulacoes'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus, Download, Trash2, FileText, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  processoId: string
}

export function AbaSimulacoes({ processoId }: Props) {
  const { data: simulacoes = [], isLoading } = useSimulacoes(processoId)
  const adicionar = useAdicionarSimulacao(processoId)
  const remover   = useRemoverSimulacao(processoId)

  const [aberto, setAberto]     = useState(false)
  const [descricao, setDescricao] = useState('')
  const [arquivo, setArquivo]   = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAdicionar() {
    if (!descricao.trim()) return
    await adicionar.mutateAsync({ descricao: descricao.trim(), arquivo: arquivo ?? undefined })
    setDescricao('')
    setArquivo(null)
    if (fileRef.current) fileRef.current.value = ''
    setAberto(false)
  }

  function handleBaixar(path: string, nome: string) {
    const { data } = supabase.storage.from('documentos').getPublicUrl(path)
    const a = document.createElement('a')
    a.href = data.publicUrl
    a.download = nome
    a.target = '_blank'
    a.click()
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Simulações ({simulacoes.length})
        </p>
        <Button
          size="sm"
          className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5"
          onClick={() => setAberto((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar Simulação
        </Button>
      </div>

      {/* Formulário */}
      {aberto && (
        <div className="border border-fonti-accent/40 bg-fonti-accent-hover/20 rounded-xl p-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Descrição <span className="text-red-500">*</span></Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Proposta Caixa — R$ 220k, prazo 180 meses..."
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Arquivo (PDF, Excel) — opcional</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.xlsx,.xls"
              className="text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-fonti-primary file:text-white hover:file:bg-fonti-primary-hover cursor-pointer"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              disabled={!descricao.trim() || adicionar.isPending}
              onClick={handleAdicionar}
            >
              {adicionar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setAberto(false); setDescricao(''); setArquivo(null) }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : simulacoes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhuma simulação cadastrada ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {simulacoes.map((s) => (
            <div
              key={s.id}
              className="flex items-start gap-3 border border-gray-100 rounded-xl p-3 bg-white"
            >
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="h-4 w-4 text-gray-400" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-fonti-primary font-medium leading-snug">{s.descricao}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {s.usuario?.nome ?? 'Sistema'} ·{' '}
                  {formatDistanceToNow(new Date(s.criado_em), { addSuffix: true, locale: ptBR })}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {s.arquivo_path && s.arquivo_nome && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-400 hover:text-fonti-primary"
                    title="Baixar arquivo"
                    onClick={() => handleBaixar(s.arquivo_path!, s.arquivo_nome!)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-gray-400 hover:text-red-500"
                  title="Remover simulação"
                  disabled={remover.isPending}
                  onClick={() => remover.mutate({ id: s.id, arquivo_path: s.arquivo_path })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
