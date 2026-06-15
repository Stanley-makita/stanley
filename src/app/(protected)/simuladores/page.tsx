'use client'

import { useState } from 'react'
import { Calculator, Plus, Building2, TrendingUp, CheckCircle2, Clock, AlertTriangle, Eye, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { SimuladorFinanciamento } from '@/components/simuladorFinanciamento/SimuladorFinanciamento'
import { SimuladorCustas } from '@/components/simulador/SimuladorCustas'
import { ResultadosFinanciamento } from '@/components/simuladorFinanciamento/ResultadosFinanciamento'
import { AnalisePredicativaCard } from '@/components/simuladorFinanciamento/AnalisePredicativaCard'
import { useSimulacoesCentral } from '@/hooks/simulacoes/useSimulacoesCentral'
import { useSalvarSimulacaoCentral } from '@/hooks/simulacoes/useSalvarSimulacaoCentral'
import { useSalvarCustasCentral } from '@/hooks/simulacoes/useSalvarCustasCentral'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import type { ResultadoSimulador, EntradaSimulador } from '@/types/simulador'
import type { SimulacaoCentral } from '@/hooks/simulacoes/useSimulacoesCentral'

type TipoModal = null | 'escolha' | 'custas' | 'financiamento'

function fmtData(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
  } catch {
    return '—'
  }
}

function BadgeTipo({ tipo }: { tipo: 'custas' | 'financiamento' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tipo === 'custas'
          ? 'bg-blue-50 text-blue-700 border border-blue-200'
          : 'bg-green-50 text-green-700 border border-green-200'
      )}
    >
      {tipo === 'custas' ? <Building2 className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {tipo === 'custas' ? 'Custas' : 'Financiamento'}
    </span>
  )
}

function BadgeStatus({ status }: { status: 'aguardando' | 'concluida' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'concluida'
          ? 'bg-gray-50 text-gray-600 border border-gray-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      )}
    >
      {status === 'concluida'
        ? <CheckCircle2 className="w-3 h-3" />
        : <Clock className="w-3 h-3" />}
      {status === 'concluida' ? 'Concluída' : 'Aguardando'}
    </span>
  )
}

function VerSimulacaoDialog({
  simulacao,
  onFechar,
}: {
  simulacao: SimulacaoCentral | null
  onFechar: () => void
}) {
  if (!simulacao) return null

  const resultado = simulacao.tipo === 'financiamento'
    ? (simulacao.resultado_json as unknown as ResultadoCompleto | null)
    : null

  return (
    <Dialog open={!!simulacao} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className="p-0 flex flex-col overflow-hidden"
        style={{ maxWidth: '90vw', width: '1100px', maxHeight: 'calc(100vh - 40px)' }}
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {simulacao.tipo === 'custas'
              ? <Building2 className="w-4 h-4 text-blue-500" />
              : <TrendingUp className="w-4 h-4 text-green-500" />}
            Simulação de {simulacao.tipo === 'custas' ? 'Custas' : 'Financiamento'}
            {simulacao.nome_cliente && (
              <span className="text-sm font-normal text-gray-400 ml-1">— {simulacao.nome_cliente}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {simulacao.tipo === 'financiamento' && resultado ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ResultadosFinanciamento resultados={resultado.bancos} />
              </div>
              <div>
                <AnalisePredicativaCard analise={resultado.analise} />
              </div>
            </div>
          ) : simulacao.tipo === 'financiamento' && !resultado ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Dados do resultado não disponíveis para esta simulação.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                <p className="font-medium text-gray-800 mb-2">Simulação de Custas Cartoriais</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {simulacao.nome_cliente && (
                    <div>
                      <p className="text-gray-400">Cliente</p>
                      <p className="font-medium">{simulacao.nome_cliente}</p>
                    </div>
                  )}
                  {simulacao.cpf_cliente && (
                    <div>
                      <p className="text-gray-400">CPF</p>
                      <p className="font-medium">{simulacao.cpf_cliente}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400">Data</p>
                    <p className="font-medium">{fmtData(simulacao.created_at)}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  O detalhe completo da simulação de custas está disponível no simulador integrado aos Processos.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function SimuladoresPage() {
  const [modal, setModal]         = useState<TipoModal>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteCpf, setClienteCpf]   = useState('')
  const [simulacaoVer, setSimulacaoVer]       = useState<SimulacaoCentral | null>(null)
  const [custaVer, setCustaVer]               = useState<SimulacaoCentral | null>(null)
  const [custasResultado, setCustasResultado] = useState<ResultadoSimulador | null>(null)
  const [custaVerResultado, setCustaVerResultado] = useState<ResultadoSimulador | null>(null)

  const { data: simulacoes = [], isLoading, error: erroLista, refetch } = useSimulacoesCentral()
  const salvar      = useSalvarSimulacaoCentral()
  const salvarCustas = useSalvarCustasCentral()

  const total      = simulacoes.length
  const aguardando = simulacoes.filter((s) => s.status === 'aguardando').length
  const concluidas = simulacoes.filter((s) => s.status === 'concluida').length

  function abrirTipo(tipo: 'custas' | 'financiamento') {
    setModal(tipo)
  }

  function fecharSimulador() {
    setModal(null)
    setClienteNome('')
    setClienteCpf('')
    setCustasResultado(null)
  }

  async function handleSalvarFinanciamento(resultado: ResultadoCompleto) {
    try {
      await salvar.mutateAsync(resultado)
      toast.success('Simulação salva no histórico')
      await refetch()
      fecharSimulador()
    } catch (err) {
      console.error('[simulacoes-central] erro ao salvar:', err)
      toast.error('Erro ao salvar simulação')
    }
  }

  async function handleSalvarCustas() {
    try {
      await salvarCustas.mutateAsync({
        nomeCliente: clienteNome || undefined,
        cpfCliente: clienteCpf || undefined,
        resultadoJson: custasResultado as unknown as Record<string, unknown> ?? undefined,
      })
      toast.success('Simulação de custas salva no histórico')
      await refetch()
      fecharSimulador()
    } catch (err) {
      console.error('[simulacoes-central] erro ao salvar custas:', err)
      toast.error('Erro ao salvar no histórico')
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#253B29] flex items-center justify-center">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Central de Simulações</h1>
            <p className="text-xs text-gray-400">Custas cartoriais e financiamento bancário</p>
          </div>
        </div>
        <Button
          className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-2"
          onClick={() => setModal('escolha')}
        >
          <Plus className="w-4 h-4" />
          Nova Simulação
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Total" value={total} icon={<Calculator className="w-4 h-4 text-gray-400" />} />
        <SummaryCard label="Aguardando" value={aguardando} icon={<Clock className="w-4 h-4 text-amber-500" />} cor="amber" />
        <SummaryCard label="Concluídas" value={concluidas} icon={<CheckCircle2 className="w-4 h-4 text-green-500" />} cor="green" />
      </div>

      {/* Tabela de histórico */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Histórico</p>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : erroLista ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Erro ao carregar histórico. Recarregue a página.
          </div>
        ) : simulacoes.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Calculator className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Nenhuma simulação ainda</p>
            <p className="text-xs text-gray-300 mt-1">Clique em &quot;Nova Simulação&quot; para começar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Data</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
                  <th className="px-4 py-2.5 text-left font-medium">Banco / Referência</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {simulacoes.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {fmtData(s.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <BadgeTipo tipo={s.tipo} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{s.nome_cliente || '—'}</p>
                      {s.cpf_cliente && (
                        <p className="text-xs text-gray-400">{s.cpf_cliente}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.banco || '—'}</td>
                    <td className="px-4 py-3">
                      <BadgeStatus status={s.status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => s.tipo === 'custas' ? setCustaVer(s) : setSimulacaoVer(s)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        title={s.tipo === 'custas' ? 'Abrir simulador' : 'Ver simulação'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: escolha de tipo + dados do cliente ─────────────────── */}
      <Dialog open={modal === 'escolha'} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Simulação</DialogTitle>
          </DialogHeader>

          {/* Dados avulsos do cliente */}
          <div className="space-y-3 pb-2">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Cliente (opcional)</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-gray-500">Nome completo</Label>
                <Input
                  className="mt-1 text-sm"
                  placeholder="Ex: João Silva"
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">CPF</Label>
                <Input
                  className="mt-1 text-sm"
                  placeholder="000.000.000-00"
                  value={clienteCpf}
                  onChange={(e) => setClienteCpf(e.target.value)}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-2">Escolha o tipo:</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => abrirTipo('custas')}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-5 hover:border-[#253B29] hover:bg-[#253B29]/5 transition-all group"
            >
              <Building2 className="w-8 h-8 text-blue-500 group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Custas</p>
                <p className="text-xs text-gray-400 mt-0.5">Cartório, ITBI, escritura</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => abrirTipo('financiamento')}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-5 hover:border-[#253B29] hover:bg-[#253B29]/5 transition-all group"
            >
              <TrendingUp className="w-8 h-8 text-green-500 group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Financiamento</p>
                <p className="text-xs text-gray-400 mt-0.5">SAC, PRICE, 7 bancos</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: SimuladorCustas ─────────────────────────────────────── */}
      <Dialog open={modal === 'custas'} onOpenChange={(o) => !o && fecharSimulador()}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden"
          style={{ maxWidth: '90vw', width: '1100px', maxHeight: 'calc(100vh - 16px)' }}
        >
          {/* Barra slim: título + "Salvar no histórico" (X do shadcn fica absolute top-4 right-4) */}
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Building2 className="w-4 h-4 text-blue-500" />
              Simulador de Custas
              {clienteNome && (
                <span className="text-xs font-normal text-gray-400">— {clienteNome}</span>
              )}
            </DialogTitle>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 shrink-0"
              onClick={handleSalvarCustas}
              disabled={salvarCustas.isPending}
            >
              <Save className="w-3 h-3" />
              {salvarCustas.isPending ? 'Salvando...' : 'Salvar no histórico'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <SimuladorCustas modoAvulso onResultadoChange={setCustasResultado} />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Re-simular custas (olho na linha de custas) ────────── */}
      <Dialog open={!!custaVer} onOpenChange={(o) => !o && setCustaVer(null)}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden"
          style={{ maxWidth: '90vw', width: '1100px', maxHeight: 'calc(100vh - 16px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Building2 className="w-4 h-4 text-blue-500" />
              Simulador de Custas
              {custaVer?.nome_cliente && (
                <span className="text-xs font-normal text-gray-400">— {custaVer.nome_cliente}</span>
              )}
            </DialogTitle>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 shrink-0"
              onClick={() => salvarCustas.mutateAsync({
                nomeCliente: custaVer?.nome_cliente ?? undefined,
                cpfCliente: custaVer?.cpf_cliente ?? undefined,
                resultadoJson: custaVerResultado as unknown as Record<string, unknown> ?? undefined,
              }).then(() => { toast.success('Salvo no histórico'); setCustaVer(null); setCustaVerResultado(null) }).catch(() => toast.error('Erro ao salvar'))}
              disabled={salvarCustas.isPending}
            >
              <Save className="w-3 h-3" />
              {salvarCustas.isPending ? 'Salvando...' : 'Salvar no histórico'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <SimuladorCustas
              key={custaVer?.id}
              modoAvulso
              clienteNome={custaVer?.nome_cliente ?? undefined}
              entradaInicial={(custaVer?.resultado_json as ResultadoSimulador | null)?.entrada as EntradaSimulador | undefined}
              onResultadoChange={setCustaVerResultado}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: SimuladorFinanciamento ──────────────────────────────── */}
      <Dialog open={modal === 'financiamento'} onOpenChange={(o) => !o && fecharSimulador()}>
        <DialogContent
          className="flex flex-col overflow-hidden"
          style={{ maxWidth: '90vw', width: '1100px', maxHeight: 'calc(100vh - 40px)' }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Simulador de Financiamento
              {clienteNome && (
                <span className="text-sm font-normal text-gray-400 ml-1">— {clienteNome}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <SimuladorFinanciamento
              nomeCliente={clienteNome || undefined}
              cpfCliente={clienteCpf || undefined}
              onSalvar={handleSalvarFinanciamento}
              salvando={salvar.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Ver simulação salva ─────────────────────────────────── */}
      <VerSimulacaoDialog
        simulacao={simulacaoVer}
        onFechar={() => setSimulacaoVer(null)}
      />
    </div>
  )
}

function SummaryCard({
  label, value, icon, cor,
}: {
  label: string
  value: number
  icon: React.ReactNode
  cor?: 'amber' | 'green'
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 flex items-center gap-3">
      <div className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center',
        cor === 'amber' ? 'bg-amber-50'
        : cor === 'green' ? 'bg-green-50'
        : 'bg-gray-50'
      )}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  )
}
