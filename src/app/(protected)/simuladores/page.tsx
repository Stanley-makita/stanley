'use client'

import { useState } from 'react'
import { Calculator, Plus, Building2, TrendingUp, Landmark, Home, Save } from 'lucide-react'
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
import { SimuladorConsorcio } from '@/components/simuladorConsorcio/SimuladorConsorcio'
import { SimuladorCgi } from '@/components/simuladorCgi/SimuladorCgi'
import {
  useSimulacoesCentralPorTipo,
  useEstatisticasSimulacoesCentralPorTipo,
} from '@/hooks/simulacoes/useSimulacoesCentral'
import { HistoricoTipoView } from '@/components/simuladores/HistoricoTipoView'
import { useSalvarSimulacaoCentral } from '@/hooks/simulacoes/useSalvarSimulacaoCentral'
import { useSalvarCustasCentral } from '@/hooks/simulacoes/useSalvarCustasCentral'
import { useSalvarConsorcioCentral } from '@/hooks/simulacoes/useSalvarConsorcioCentral'
import { useSalvarCgiCentral } from '@/hooks/simulacoes/useSalvarCgiCentral'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import type { ResultadoSimulador, EntradaSimulador } from '@/types/simulador'
import type { ResultadoConsorcio } from '@/lib/simuladorConsorcio/tipos'
import type { ResultadoCgiCompleto } from '@/lib/simuladorCgi/tipos'
import type { SimulacaoCentral } from '@/hooks/simulacoes/useSimulacoesCentral'

type TipoModal = null | 'escolha' | 'custas' | 'consorcio' | 'cgi'

function fmtData(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
  } catch {
    return '—'
  }
}

// Config visual por tipo — fonte única usada pelos cards do dashboard e
// pela tela de histórico (HistoricoTipoView).
const TIPO_CONFIG: Record<SimulacaoCentral['tipo'], {
  label: string; descricao: string; corIcone: string; corCard: string
  icone: React.ReactNode
}> = {
  financiamento: {
    label: 'Financiamento', descricao: 'SAC, PRICE, 7 bancos',
    corIcone: 'text-green-500', corCard: 'hover:border-green-300 hover:bg-green-50/40',
    icone: <TrendingUp className="w-6 h-6 text-green-500" />,
  },
  custas: {
    label: 'Custas', descricao: 'Cartório, ITBI, escritura',
    corIcone: 'text-blue-500', corCard: 'hover:border-blue-300 hover:bg-blue-50/40',
    icone: <Building2 className="w-6 h-6 text-blue-500" />,
  },
  consorcio: {
    label: 'Consórcio', descricao: 'Consórcio x compra à vista',
    corIcone: 'text-amber-500', corCard: 'hover:border-amber-300 hover:bg-amber-50/40',
    icone: <Landmark className="w-6 h-6 text-amber-500" />,
  },
  cgi: {
    label: 'CGI / Home Equity', descricao: 'Crédito com garantia de imóvel',
    corIcone: 'text-purple-500', corCard: 'hover:border-purple-300 hover:bg-purple-50/40',
    icone: <Home className="w-6 h-6 text-purple-500" />,
  },
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
        className="p-0 flex flex-col overflow-hidden w-[calc(100vw-1rem)] h-[95svh] rounded-xl sm:rounded-lg sm:h-auto"
        style={{ maxWidth: 'min(90vw, 1100px)', maxHeight: 'calc(100dvh - 40px)' }}
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {simulacao.tipo === 'custas'
              ? <Building2 className="w-4 h-4 text-blue-500" />
              : simulacao.tipo === 'cgi'
                ? <Home className="w-4 h-4 text-purple-500" />
                : <TrendingUp className="w-4 h-4 text-green-500" />}
            Simulação de {simulacao.tipo === 'custas' ? 'Custas' : simulacao.tipo === 'cgi' ? 'CGI' : 'Financiamento'}
            {simulacao.nome_cliente && (
              <span className="text-sm font-normal text-gray-400 ml-1">— {simulacao.nome_cliente}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {simulacao.tipo === 'cgi' ? (
            <SimuladorCgi
              key={simulacao.id}
              resultadoInicial={simulacao.resultado_json as unknown as ResultadoCgiCompleto}
              simulacaoExistenteId={simulacao.id}
              clienteNome={simulacao.nome_cliente ?? undefined}
              clienteCpf={simulacao.cpf_cliente ?? undefined}
              leadId={simulacao.lead_id ?? undefined}
            />
          ) : simulacao.tipo === 'financiamento' && resultado ? (
            // resultadoInicial: mostra os números exatos salvos na época, sem
            // recalcular com taxas/calibração atuais — histórico fiel. Print/
            // Compartilhar (já embutidos no SimuladorFinanciamento) operam
            // sobre esse mesmo resultado.
            <SimuladorFinanciamento
              key={simulacao.id}
              resultadoInicial={resultado}
              simulacaoExistenteId={simulacao.id}
              nomeCliente={simulacao.nome_cliente ?? undefined}
              cpfCliente={simulacao.cpf_cliente ?? undefined}
              leadId={simulacao.lead_id ?? undefined}
            />
          ) : simulacao.tipo === 'financiamento' && !resultado ? (
            <div className="text-center py-12 text-gray-400 text-sm p-6">
              Dados do resultado não disponíveis para esta simulação.
            </div>
          ) : (
            <div className="space-y-3 p-6">
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
  const [visao, setVisao]         = useState<'lista' | 'financiamento'>('lista')
  // null = dashboard (4 cards); senão, tela de histórico daquele tipo
  const [abaAtiva, setAbaAtiva] = useState<SimulacaoCentral['tipo'] | null>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteCpf, setClienteCpf]   = useState('')
  const [simulacaoVer, setSimulacaoVer]       = useState<SimulacaoCentral | null>(null)
  const [custaVer, setCustaVer]               = useState<SimulacaoCentral | null>(null)
  const [custasResultado, setCustasResultado] = useState<ResultadoSimulador | null>(null)
  const [custaVerResultado, setCustaVerResultado] = useState<ResultadoSimulador | null>(null)
  const [consorcioVer, setConsorcioVer]               = useState<SimulacaoCentral | null>(null)
  const [consorcioResultado, setConsorcioResultado]   = useState<ResultadoConsorcio | null>(null)
  const [consorcioVerResultado, setConsorcioVerResultado] = useState<ResultadoConsorcio | null>(null)
  const [cgiVer, setCgiVer]               = useState<SimulacaoCentral | null>(null)
  const [cgiResultado, setCgiResultado]   = useState<ResultadoCgiCompleto | null>(null)
  const [cgiVerResultado, setCgiVerResultado] = useState<ResultadoCgiCompleto | null>(null)

  // Uma query por tipo, só habilitada quando aquela aba está aberta — evita
  // buscar os 4 históricos de uma vez só pra mostrar o dashboard.
  const finan     = useSimulacoesCentralPorTipo('financiamento', abaAtiva === 'financiamento')
  const custas    = useSimulacoesCentralPorTipo('custas',        abaAtiva === 'custas')
  const consorcio = useSimulacoesCentralPorTipo('consorcio',     abaAtiva === 'consorcio')
  const cgi       = useSimulacoesCentralPorTipo('cgi',           abaAtiva === 'cgi')
  const porTipo: Record<SimulacaoCentral['tipo'], typeof finan> = { financiamento: finan, custas, consorcio, cgi }

  const { data: stats, refetch: refetchStats } = useEstatisticasSimulacoesCentralPorTipo()
  const salvar      = useSalvarSimulacaoCentral()
  const salvarCustas = useSalvarCustasCentral()
  const salvarConsorcio = useSalvarConsorcioCentral()
  const salvarCgi = useSalvarCgiCentral()

  function abrirTipo(tipo: 'custas' | 'financiamento' | 'consorcio' | 'cgi') {
    if (tipo === 'financiamento') {
      setModal(null)
      setVisao('financiamento')
    } else {
      setModal(tipo)
    }
  }

  function fecharSimulador() {
    setModal(null)
    setClienteNome('')
    setClienteCpf('')
    setCustasResultado(null)
    setConsorcioResultado(null)
    setCgiResultado(null)
  }

  function fecharFinanciamento() {
    setVisao('lista')
    setClienteNome('')
    setClienteCpf('')
  }

  async function handleSalvarFinanciamento(resultado: ResultadoCompleto) {
    try {
      await salvar.mutateAsync({ resultado })
      toast.success('Simulação salva no histórico')
      await Promise.all([finan.refetch(), refetchStats()])
      fecharFinanciamento()
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
      await Promise.all([custas.refetch(), refetchStats()])
      fecharSimulador()
    } catch (err) {
      console.error('[simulacoes-central] erro ao salvar custas:', err)
      toast.error('Erro ao salvar no histórico')
    }
  }

  async function handleSalvarConsorcio() {
    if (!consorcioResultado) return
    try {
      await salvarConsorcio.mutateAsync({ resultado: consorcioResultado })
      toast.success('Simulação de consórcio salva no histórico')
      await Promise.all([consorcio.refetch(), refetchStats()])
      fecharSimulador()
    } catch (err) {
      console.error('[simulacoes-central] erro ao salvar consórcio:', err)
      toast.error('Erro ao salvar no histórico')
    }
  }

  async function handleSalvarCgi() {
    if (!cgiResultado) return
    try {
      await salvarCgi.mutateAsync({ resultado: cgiResultado })
      toast.success('Simulação de CGI salva no histórico')
      await Promise.all([cgi.refetch(), refetchStats()])
      fecharSimulador()
    } catch (err) {
      console.error('[simulacoes-central] erro ao salvar CGI:', err)
      toast.error('Erro ao salvar no histórico')
    }
  }

  /* ── View: Simulador de Financiamento (tela cheia, sem modal) ── */
  if (visao === 'financiamento') {
    return (
      <div className="p-2 sm:p-4 md:p-6">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={fecharFinanciamento}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Calculator className="w-4 h-4" />
            ← Central de Simulações
          </button>
          {clienteNome && (
            <span className="text-sm text-gray-400">— {clienteNome}</span>
          )}
        </div>
        <SimuladorFinanciamento
          nomeCliente={clienteNome || undefined}
          cpfCliente={clienteCpf || undefined}
          onSalvar={handleSalvarFinanciamento}
          salvando={salvar.isPending}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {abaAtiva === null ? (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-fonti-primary flex items-center justify-center">
                <Calculator className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Central de Simulações</h1>
                <p className="text-xs text-gray-400">Custas cartoriais, financiamento bancário e consórcio</p>
              </div>
            </div>
            <Button
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-2"
              onClick={() => setModal('escolha')}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nova Simulação</span>
            </Button>
          </div>

          {/* Dashboard: 1 card por tipo — clicar abre o histórico daquele tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(Object.keys(TIPO_CONFIG) as SimulacaoCentral['tipo'][]).map((tipo) => {
              const cfg = TIPO_CONFIG[tipo]
              const s = stats?.[tipo]
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setAbaAtiva(tipo)}
                  className={cn(
                    'text-left rounded-xl border-2 border-gray-100 bg-white p-5 transition-all',
                    cfg.corCard,
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    {cfg.icone}
                    <span className="text-2xl font-bold text-gray-900">{s?.total ?? 0}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{cfg.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{cfg.descricao}</p>
                  {s && s.total > 0 && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      {s.aguardando} aguardando · {s.concluidas} concluída{s.concluidas === 1 ? '' : 's'}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <HistoricoTipoView
          tipo={abaAtiva}
          label={TIPO_CONFIG[abaAtiva].label}
          icone={TIPO_CONFIG[abaAtiva].icone}
          descricao={TIPO_CONFIG[abaAtiva].descricao}
          itens={porTipo[abaAtiva].data ?? []}
          isLoading={porTipo[abaAtiva].isLoading}
          erro={porTipo[abaAtiva].error}
          onVoltar={() => setAbaAtiva(null)}
          onNovo={() => abrirTipo(abaAtiva)}
          onVer={(s) => {
            if (s.tipo === 'custas') setCustaVer(s)
            else if (s.tipo === 'consorcio') setConsorcioVer(s)
            else if (s.tipo === 'cgi') setCgiVer(s)
            else setSimulacaoVer(s)
          }}
        />
      )}

      {/* ── Modal: escolha de tipo + dados do cliente ─────────────────── */}
      <Dialog open={modal === 'escolha'} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-xl">
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
              className="flex flex-col items-center justify-center text-center gap-2 rounded-xl border-2 border-gray-100 px-4 py-5 min-h-[140px] hover:border-fonti-primary hover:bg-fonti-primary/5 transition-all group"
            >
              <Building2 className="w-7 h-7 text-blue-500 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-gray-800 leading-snug">Custas</p>
                <p className="text-xs text-gray-400 leading-snug">Cartório, ITBI, escritura</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => abrirTipo('financiamento')}
              className="flex flex-col items-center justify-center text-center gap-2 rounded-xl border-2 border-gray-100 px-4 py-5 min-h-[140px] hover:border-fonti-primary hover:bg-fonti-primary/5 transition-all group"
            >
              <TrendingUp className="w-7 h-7 text-green-500 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-gray-800 leading-snug">Financiamento</p>
                <p className="text-xs text-gray-400 leading-snug">SAC, PRICE, 7 bancos</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => abrirTipo('consorcio')}
              className="flex flex-col items-center justify-center text-center gap-2 rounded-xl border-2 border-gray-100 px-4 py-5 min-h-[140px] hover:border-fonti-primary hover:bg-fonti-primary/5 transition-all group"
            >
              <Landmark className="w-7 h-7 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-gray-800 leading-snug">Consórcio</p>
                <p className="text-xs text-gray-400 leading-snug">Consórcio x compra à vista</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => abrirTipo('cgi')}
              className="flex flex-col items-center justify-center text-center gap-2 rounded-xl border-2 border-gray-100 px-4 py-5 min-h-[140px] hover:border-fonti-primary hover:bg-fonti-primary/5 transition-all group"
            >
              <Home className="w-7 h-7 text-purple-500 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-gray-800 leading-snug">CGI / Home Equity</p>
                <p className="text-xs text-gray-400 leading-snug">Crédito com garantia de imóvel</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: SimuladorCustas ─────────────────────────────────────── */}
      <Dialog open={modal === 'custas'} onOpenChange={(o) => !o && fecharSimulador()}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-1rem)] h-[95svh] rounded-xl sm:rounded-lg sm:h-auto"
          style={{ maxWidth: 'min(90vw, 1100px)', maxHeight: 'calc(100vh - 16px)' }}
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
              className="ml-auto h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
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
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-1rem)] h-[95svh] rounded-xl sm:rounded-lg sm:h-auto"
          style={{ maxWidth: 'min(90vw, 1100px)', maxHeight: 'calc(100vh - 16px)' }}
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
              className="ml-auto h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
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
              simulacaoExistenteId={custaVer?.id}
              clienteNome={custaVer?.nome_cliente ?? undefined}
              entradaInicial={(custaVer?.resultado_json as ResultadoSimulador | null)?.entrada as EntradaSimulador | undefined}
              onResultadoChange={setCustaVerResultado}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: SimuladorConsorcio ────────────────────────────────────── */}
      <Dialog open={modal === 'consorcio'} onOpenChange={(o) => !o && fecharSimulador()}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-0.5rem)] h-[99svh] rounded-xl sm:rounded-lg"
          style={{ maxWidth: 'min(99vw, 1900px)', maxHeight: 'calc(100vh - 4px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Landmark className="w-4 h-4 text-amber-500" />
              Simulador de Consórcio
              {clienteNome && (
                <span className="text-xs font-normal text-gray-400">— {clienteNome}</span>
              )}
            </DialogTitle>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
              onClick={handleSalvarConsorcio}
              disabled={salvarConsorcio.isPending || !consorcioResultado}
            >
              <Save className="w-3 h-3" />
              {salvarConsorcio.isPending ? 'Salvando...' : 'Salvar no histórico'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <SimuladorConsorcio
              clienteNome={clienteNome || undefined}
              clienteCpf={clienteCpf || undefined}
              onResultadoChange={setConsorcioResultado}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Re-simular consórcio (olho na linha de consórcio) ──── */}
      <Dialog open={!!consorcioVer} onOpenChange={(o) => !o && setConsorcioVer(null)}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-0.5rem)] h-[99svh] rounded-xl sm:rounded-lg"
          style={{ maxWidth: 'min(99vw, 1900px)', maxHeight: 'calc(100vh - 4px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Landmark className="w-4 h-4 text-amber-500" />
              Simulador de Consórcio
              {consorcioVer?.nome_cliente && (
                <span className="text-xs font-normal text-gray-400">— {consorcioVer.nome_cliente}</span>
              )}
            </DialogTitle>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
              onClick={() => {
                if (!consorcioVerResultado) return
                salvarConsorcio.mutateAsync({ resultado: consorcioVerResultado })
                  .then(() => { toast.success('Salvo no histórico'); setConsorcioVer(null); setConsorcioVerResultado(null) })
                  .catch(() => toast.error('Erro ao salvar'))
              }}
              disabled={salvarConsorcio.isPending || !consorcioVerResultado}
            >
              <Save className="w-3 h-3" />
              {salvarConsorcio.isPending ? 'Salvando...' : 'Salvar no histórico'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <SimuladorConsorcio
              key={consorcioVer?.id}
              simulacaoExistenteId={consorcioVer?.id}
              resultadoInicial={(consorcioVer?.resultado_json as unknown as ResultadoConsorcio) ?? undefined}
              clienteNome={consorcioVer?.nome_cliente ?? undefined}
              clienteCpf={consorcioVer?.cpf_cliente ?? undefined}
              onResultadoChange={setConsorcioVerResultado}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: SimuladorCgi ──────────────────────────────────────────── */}
      <Dialog open={modal === 'cgi'} onOpenChange={(o) => !o && fecharSimulador()}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-0.5rem)] h-[99svh] rounded-xl sm:rounded-lg"
          style={{ maxWidth: 'min(99vw, 1600px)', maxHeight: 'calc(100vh - 4px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Home className="w-4 h-4 text-purple-500" />
              Simulador de CGI / Home Equity
              {clienteNome && (
                <span className="text-xs font-normal text-gray-400">— {clienteNome}</span>
              )}
            </DialogTitle>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
              onClick={handleSalvarCgi}
              disabled={salvarCgi.isPending || !cgiResultado}
            >
              <Save className="w-3 h-3" />
              {salvarCgi.isPending ? 'Salvando...' : 'Salvar no histórico'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <SimuladorCgi
              clienteNome={clienteNome || undefined}
              clienteCpf={clienteCpf || undefined}
              onResultadoChange={setCgiResultado}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Re-simular CGI (olho na linha de CGI) ────────────────── */}
      <Dialog open={!!cgiVer} onOpenChange={(o) => !o && setCgiVer(null)}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-0.5rem)] h-[99svh] rounded-xl sm:rounded-lg"
          style={{ maxWidth: 'min(99vw, 1600px)', maxHeight: 'calc(100vh - 4px)' }}
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Home className="w-4 h-4 text-purple-500" />
              Simulador de CGI / Home Equity
              {cgiVer?.nome_cliente && (
                <span className="text-xs font-normal text-gray-400">— {cgiVer.nome_cliente}</span>
              )}
            </DialogTitle>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
              onClick={() => {
                if (!cgiVerResultado) return
                salvarCgi.mutateAsync({ resultado: cgiVerResultado })
                  .then(() => { toast.success('Salvo no histórico'); setCgiVer(null); setCgiVerResultado(null) })
                  .catch(() => toast.error('Erro ao salvar'))
              }}
              disabled={salvarCgi.isPending || !cgiVerResultado}
            >
              <Save className="w-3 h-3" />
              {salvarCgi.isPending ? 'Salvando...' : 'Salvar no histórico'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <SimuladorCgi
              key={cgiVer?.id}
              simulacaoExistenteId={cgiVer?.id}
              resultadoInicial={(cgiVer?.resultado_json as unknown as ResultadoCgiCompleto) ?? undefined}
              clienteNome={cgiVer?.nome_cliente ?? undefined}
              clienteCpf={cgiVer?.cpf_cliente ?? undefined}
              onResultadoChange={setCgiVerResultado}
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
