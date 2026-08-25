'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSimulacoesCentralPorProcesso, type SimulacaoCentral } from '@/hooks/simulacoes/useSimulacoesCentral'
import { useSalvarCgiCentral } from '@/hooks/simulacoes/useSalvarCgiCentral'
import { SimuladorCgi } from './SimuladorCgi'
import type { ResultadoCgiCompleto } from '@/lib/simuladorCgi/tipos'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Plus, Home, Trash2, Eye, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

interface Props {
  processoId: string
  clienteNome?: string
  clienteCpf?: string
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function AbaSimulacoesCgi({ processoId, clienteNome, clienteCpf }: Props) {
  const { data: simulacoes = [], isLoading } = useSimulacoesCentralPorProcesso(processoId, 'cgi')
  const salvarCgi = useSalvarCgiCentral()
  const queryClient = useQueryClient()

  const [modalNovaAberto, setModalNovaAberto] = useState(false)
  const [resultadoNova, setResultadoNova] = useState<ResultadoCgiCompleto | null>(null)
  const [verSim, setVerSim] = useState<SimulacaoCentral | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  async function handleSalvarNova() {
    if (!resultadoNova) return
    try {
      await salvarCgi.mutateAsync({ resultado: resultadoNova, processoId })
      toast.success('Simulação de CGI salva.')
      setModalNovaAberto(false)
      setResultadoNova(null)
    } catch {
      toast.error('Erro ao salvar simulação.')
    }
  }

  async function handleExcluir(id: string) {
    setExcluindoId(id)
    try {
      const { error } = await supabase.from('simulacoes_central').delete().eq('id', id)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['simulacoes-central-processo', processoId] })
      toast.success('Simulação removida.')
    } catch {
      toast.error('Erro ao remover simulação.')
    } finally {
      setExcluindoId(null)
    }
  }

  function resumo(sim: SimulacaoCentral): string {
    const r = sim.resultado_json as unknown as ResultadoCgiCompleto | null
    if (!r) return 'Simulação de CGI'
    const menor = r.bancos.find((b) => b.bancoId === r.bancoMenorPrestacaoId)
    return menor
      ? `${menor.bancoNome} — ${BRL.format(menor.prestacaoEstimada)}/mês`
      : `Imóvel (garantia) ${BRL.format(r.input.valorImovel)}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Simulações CGI ({simulacoes.length})
        </p>
        <Button
          size="sm"
          className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5"
          onClick={() => { setResultadoNova(null); setModalNovaAberto(true) }}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Simulação
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}
        </div>
      ) : simulacoes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhuma simulação de CGI cadastrada ainda.</p>
      ) : (
        <div className="space-y-2">
          {simulacoes.map((sim) => (
            <div key={sim.id} className="flex items-start gap-3 border border-purple-100 bg-purple-50/40 rounded-xl p-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Home className="h-4 w-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-fonti-primary font-medium leading-snug">{resumo(sim)}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDistanceToNow(new Date(sim.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-fonti-primary" title="Ver simulação" onClick={() => setVerSim(sim)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-500" title="Remover simulação"
                  disabled={excluindoId === sim.id} onClick={() => handleExcluir(sim.id)}
                >
                  {excluindoId === sim.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Nova simulação */}
      <Dialog open={modalNovaAberto} onOpenChange={(o) => { if (!o) { setModalNovaAberto(false); setResultadoNova(null) } }}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-0.5rem)] h-[99svh] rounded-xl sm:rounded-lg"
          style={{ maxWidth: 'min(99vw, 1600px)', maxHeight: 'calc(100vh - 4px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Home className="w-4 h-4 text-purple-500" />
              Simulador de CGI / Home Equity
              {clienteNome && <span className="text-xs font-normal text-gray-400">— {clienteNome}</span>}
            </DialogTitle>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
              onClick={handleSalvarNova}
              disabled={salvarCgi.isPending || !resultadoNova}
            >
              {salvarCgi.isPending ? 'Salvando...' : 'Salvar nesta simulação'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <SimuladorCgi
              clienteNome={clienteNome}
              clienteCpf={clienteCpf}
              processoId={processoId}
              onResultadoChange={setResultadoNova}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Ver simulação salva */}
      <Dialog open={!!verSim} onOpenChange={(o) => !o && setVerSim(null)}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-0.5rem)] h-[99svh] rounded-xl sm:rounded-lg"
          style={{ maxWidth: 'min(99vw, 1600px)', maxHeight: 'calc(100vh - 4px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Home className="w-4 h-4 text-purple-500" />
              Simulação de CGI / Home Equity
              {verSim?.nome_cliente && <span className="text-xs font-normal text-gray-400">— {verSim.nome_cliente}</span>}
            </DialogTitle>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            {verSim && (
              <SimuladorCgi
                key={verSim.id}
                resultadoInicial={verSim.resultado_json as unknown as ResultadoCgiCompleto}
                simulacaoExistenteId={verSim.id}
                clienteNome={verSim.nome_cliente ?? undefined}
                clienteCpf={verSim.cpf_cliente ?? undefined}
                processoId={processoId}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
