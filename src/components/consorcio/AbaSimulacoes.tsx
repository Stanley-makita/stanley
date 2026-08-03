'use client'

import { useState, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSimulacoes, useAdicionarSimulacao, useRemoverSimulacao } from '@/hooks/consorcio/useConsorcioSimulacoes'
import { useSimulacoesCentralPorProcesso, type SimulacaoCentral } from '@/hooks/simulacoes/useSimulacoesCentral'
import { useSalvarConsorcioCentral } from '@/hooks/simulacoes/useSalvarConsorcioCentral'
import { SimuladorConsorcio } from '@/components/simuladorConsorcio/SimuladorConsorcio'
import type { ResultadoConsorcio } from '@/lib/simuladorConsorcio/tipos'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Plus, Download, Trash2, FileText, Loader2, Landmark, Save, Printer } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

interface Props {
  processoId: string
  clienteNome?: string
  clienteCpf?: string
}

function fmtMoedaResumo(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export function AbaSimulacoes({ processoId, clienteNome, clienteCpf }: Props) {
  const { data: simulacoes = [], isLoading } = useSimulacoes(processoId)
  const adicionar = useAdicionarSimulacao(processoId)
  const remover   = useRemoverSimulacao(processoId)

  const { data: simulacoesItau = [], isLoading: carregandoItau } = useSimulacoesCentralPorProcesso(processoId, 'consorcio')
  const salvarConsorcio = useSalvarConsorcioCentral()
  const queryClient = useQueryClient()
  const [modalItauAberto, setModalItauAberto] = useState(false)
  const [resultadoItau, setResultadoItau] = useState<ResultadoConsorcio | null>(null)
  const [excluindoItauId, setExcluindoItauId] = useState<string | null>(null)
  const [baixandoItauId, setBaixandoItauId] = useState<string | null>(null)

  const [aberto, setAberto]     = useState(false)
  const [descricao, setDescricao] = useState('')
  const [arquivo, setArquivo]   = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSalvarItau() {
    if (!resultadoItau) return
    try {
      await salvarConsorcio.mutateAsync({ resultado: resultadoItau, processoId })
      toast.success('Simulação Itaú salva.')
      setModalItauAberto(false)
      setResultadoItau(null)
    } catch {
      toast.error('Erro ao salvar simulação.')
    }
  }

  async function handleExcluirItau(id: string) {
    setExcluindoItauId(id)
    try {
      const { error } = await supabase.from('simulacoes_central').delete().eq('id', id)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['simulacoes-central-processo', processoId] })
      toast.success('Simulação removida.')
    } catch {
      toast.error('Erro ao remover simulação.')
    } finally {
      setExcluindoItauId(null)
    }
  }

  async function handleBaixarItau(sim: SimulacaoCentral) {
    setBaixandoItauId(sim.id)
    try {
      const { gerarPDFConsorcio } = await import('@/lib/simuladorConsorcio/gerarPDF')
      await gerarPDFConsorcio(sim.resultado_json as unknown as ResultadoConsorcio, { clienteNome: sim.nome_cliente ?? undefined })
    } finally {
      setBaixandoItauId(null)
    }
  }

  // Lista combinada: uploads manuais (Caixa/Araucária/etc.) + simulações Itaú
  // calculadas pelo motor — ordenadas juntas por data mais recente primeiro.
  const itensCombinados = useMemo(() => {
    const manuais = simulacoes.map((s) => ({ tipo: 'manual' as const, data: s.criado_em, item: s }))
    const itau    = simulacoesItau.map((s) => ({ tipo: 'itau' as const, data: s.created_at, item: s }))
    return [...manuais, ...itau].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  }, [simulacoes, simulacoesItau])

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
          Simulações ({itensCombinados.length})
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-fonti-primary text-fonti-primary hover:bg-fonti-primary/5 gap-1.5"
            onClick={() => { setResultadoItau(null); setModalItauAberto(true) }}
          >
            <Landmark className="h-3.5 w-3.5" />
            Simular Itaú
          </Button>
          <Button
            size="sm"
            className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5"
            onClick={() => setAberto((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar Simulação
          </Button>
        </div>
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
      {(isLoading || carregandoItau) ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : itensCombinados.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhuma simulação cadastrada ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {itensCombinados.map((entrada) => entrada.tipo === 'manual' ? (
            <div
              key={`manual-${entrada.item.id}`}
              className="flex items-start gap-3 border border-gray-100 rounded-xl p-3 bg-white"
            >
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="h-4 w-4 text-gray-400" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-fonti-primary font-medium leading-snug">{entrada.item.descricao}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {entrada.item.usuario?.nome ?? 'Sistema'} ·{' '}
                  {formatDistanceToNow(new Date(entrada.item.criado_em), { addSuffix: true, locale: ptBR })}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {entrada.item.arquivo_path && entrada.item.arquivo_nome && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-400 hover:text-fonti-primary"
                    title="Baixar arquivo"
                    onClick={() => handleBaixar(entrada.item.arquivo_path!, entrada.item.arquivo_nome!)}
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
                  onClick={() => remover.mutate({ id: entrada.item.id, arquivo_path: entrada.item.arquivo_path })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={`itau-${entrada.item.id}`}
              className="flex items-start gap-3 border border-fonti-accent/40 bg-fonti-accent-hover/10 rounded-xl p-3"
            >
              <div className="w-8 h-8 bg-fonti-surface-warm rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Landmark className="h-4 w-4 text-fonti-accent" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-fonti-primary font-medium leading-snug">
                  Consórcio Itaú
                  {(() => {
                    const r = entrada.item.resultado_json as unknown as ResultadoConsorcio | null
                    if (!r) return null
                    return ` — Carta ${fmtMoedaResumo(r.input.valorCarta)} · ${r.input.prazoMeses}x · Lance ${fmtMoedaResumo(r.resumo.valorDoLance)}`
                  })()}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Calculado pelo simulador · {formatDistanceToNow(new Date(entrada.item.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-gray-400 hover:text-fonti-primary"
                  title="Baixar PDF"
                  disabled={baixandoItauId === entrada.item.id}
                  onClick={() => handleBaixarItau(entrada.item)}
                >
                  {baixandoItauId === entrada.item.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Printer className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-gray-400 hover:text-red-500"
                  title="Remover simulação"
                  disabled={excluindoItauId === entrada.item.id}
                  onClick={() => handleExcluirItau(entrada.item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Simulador Itaú */}
      <Dialog open={modalItauAberto} onOpenChange={(o) => { if (!o) { setModalItauAberto(false); setResultadoItau(null) } }}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-0.5rem)] h-[99svh] rounded-xl sm:rounded-lg"
          style={{ maxWidth: 'min(99vw, 1900px)', maxHeight: 'calc(100vh - 4px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Landmark className="w-4 h-4 text-amber-500" />
              Simulador de Consórcio — Itaú
              {clienteNome && <span className="text-xs font-normal text-gray-400">— {clienteNome}</span>}
            </DialogTitle>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
              onClick={handleSalvarItau}
              disabled={salvarConsorcio.isPending || !resultadoItau}
            >
              <Save className="w-3 h-3" />
              {salvarConsorcio.isPending ? 'Salvando...' : 'Salvar nesta simulação'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <SimuladorConsorcio
              clienteNome={clienteNome}
              clienteCpf={clienteCpf}
              onResultadoChange={setResultadoItau}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
