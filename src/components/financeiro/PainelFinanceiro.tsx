'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DollarSign,
  Clock,
  AlertTriangle,
  Lock,
  Plus,
  Landmark,
  FileStack,
  Boxes,
  FileSignature,
  Layers,
} from 'lucide-react'
import { type FinFechamentoStatus } from '@/types/financeiro'
import { useFechamentos } from '@/hooks/financeiro/useFechamento'
import { useConferencias } from '@/hooks/financeiro/useConferencias'
import { usePainelFinanceiro } from '@/hooks/financeiro/usePainelFinanceiro'
import { useContasBancarias, useSaldosBancariosAtuais } from '@/hooks/financeiro/useContasBancarias'
import { ModalDetalheEmissoes } from '@/components/financeiro/ModalDetalheEmissoes'
import { formatarMoeda } from '@/lib/utils'

const STATUS_LABELS: Record<FinFechamentoStatus, string> = {
  rascunho: 'Rascunho',
  em_conferencia: 'Em Conferência',
  aprovado: 'Aprovado',
  pago: 'Pago',
  travado: 'Travado',
  reaberto: 'Reaberto',
}

const STATUS_COLORS: Record<FinFechamentoStatus, string> = {
  rascunho: 'bg-gray-100 text-gray-700',
  em_conferencia: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-blue-100 text-blue-800',
  pago: 'bg-green-100 text-green-800',
  travado: 'bg-red-100 text-red-800',
  reaberto: 'bg-orange-100 text-orange-800',
}

function KpiCard({ cor, icone, valor, label }: { cor: string; icone: React.ReactNode; valor: number; label: string }) {
  return (
    <div className={`rounded-xl p-4 text-white ${cor}`}>
      <div className="flex items-start justify-between">
        <p className="text-xl font-bold">{formatarMoeda(valor)}</p>
        <div className="opacity-80">{icone}</div>
      </div>
      <p className="text-xs font-medium mt-2 opacity-95">{label}</p>
    </div>
  )
}

interface Props {
  mes: number
  ano: number
  onAbrirFechamento: () => void
  onIrParaFechamento: (mes: number, ano: number, aba?: 'fechamento' | 'a_receber' | 'despesas') => void
}

export function PainelFinanceiro({ mes, ano, onAbrirFechamento, onIrParaFechamento }: Props) {
  const [modalEmissoes, setModalEmissoes] = useState(false)

  const { data: fechamentos = [], isLoading } = useFechamentos()
  const fechamentoAtual = fechamentos[0]
  const { data: conferencias = [] } = useConferencias(fechamentoAtual?.id)
  const criticos = conferencias.filter(c => c.status === 'pendente' && c.severidade === 'critico').length

  const { data: kpis, isLoading: kpisLoading } = usePainelFinanceiro(mes, ano)
  const { data: contasBancarias = [] } = useContasBancarias()
  const { data: saldosAtuais = {} } = useSaldosBancariosAtuais()

  const totalSaldoBancos = contasBancarias.reduce((soma, conta) => {
    const saldo = saldosAtuais[conta.id]?.saldo_informado ?? conta.saldo_inicial
    return soma + saldo
  }, 0)

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      {/* Sem fechamento aberto */}
      {!fechamentoAtual && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
          <DollarSign className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-1">Nenhum fechamento aberto</p>
          <p className="text-sm text-gray-400 mb-4">Abra um novo fechamento para iniciar o processo do mês.</p>
          <Button className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1" onClick={onAbrirFechamento}>
            <Plus className="h-4 w-4" />
            Abrir Fechamento
          </Button>
        </div>
      )}

      {fechamentoAtual && (criticos > 0 || fechamentoAtual.status === 'travado') && (
        <div className="flex flex-wrap items-center gap-3">
          <Badge className={STATUS_COLORS[fechamentoAtual.status]}>
            Fechamento {String(fechamentoAtual.competencia_mes).padStart(2, '0')}/{fechamentoAtual.competencia_ano}: {STATUS_LABELS[fechamentoAtual.status]}
          </Badge>
          {criticos > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {criticos} conferência(s) crítica(s) pendente(s)
            </span>
          )}
          {fechamentoAtual.status === 'travado' && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
              <Lock className="h-3.5 w-3.5" />
              Mês encerrado
            </span>
          )}
        </div>
      )}

      {/* A receber */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">A receber</h3>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => onIrParaFechamento(mes, ano, 'a_receber')}>
            <Plus className="h-3.5 w-3.5" /> Nova venda
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KpiCard cor="bg-green-600" icone={<Clock className="h-5 w-5" />} valor={kpisLoading ? 0 : kpis?.a_receber_aberto ?? 0} label="Contas a receber em aberto este mês" />
          <KpiCard cor="bg-sky-500" icone={<AlertTriangle className="h-5 w-5" />} valor={kpisLoading ? 0 : kpis?.a_receber_atraso ?? 0} label="Contas a receber em atraso" />
        </div>
      </div>

      {/* A pagar */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">A pagar</h3>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => onIrParaFechamento(mes, ano, 'despesas')}>
            <Plus className="h-3.5 w-3.5" /> Nova despesa
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KpiCard cor="bg-amber-500" icone={<Clock className="h-5 w-5" />} valor={kpisLoading ? 0 : kpis?.a_pagar_mes ?? 0} label="Contas a pagar este mês" />
          <KpiCard cor="bg-red-600" icone={<AlertTriangle className="h-5 w-5" />} valor={kpisLoading ? 0 : kpis?.a_pagar_atraso ?? 0} label="Contas a pagar em atraso este mês" />
        </div>
      </div>

      {/* Contas bancárias */}
      <div className="rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3 text-center">Contas Bancárias da Empresa</p>
        {contasBancarias.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Nenhuma conta bancária cadastrada.</p>
        ) : (
          <div className="flex flex-wrap items-stretch justify-center gap-3">
            {contasBancarias.map(conta => {
              const saldo = saldosAtuais[conta.id]?.saldo_informado ?? conta.saldo_inicial
              return (
                <div key={conta.id} className="border border-gray-200 rounded-lg px-4 py-2 text-center min-w-[140px]">
                  <p className="text-xs text-gray-500">{conta.apelido || conta.banco_nome}</p>
                  <p className="text-sm font-bold text-fonti-primary">{formatarMoeda(saldo)}</p>
                </div>
              )
            })}
            <div className="border-2 border-fonti-primary rounded-lg px-4 py-2 text-center min-w-[160px] bg-fonti-accent/10">
              <p className="text-xs text-gray-500">Total Saldo Bancos</p>
              <p className="text-sm font-bold text-fonti-primary">{formatarMoeda(totalSaldoBancos)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Fechamentos por tipo de negócio */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          className="rounded-xl p-4 text-left bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60"
          onClick={() => setModalEmissoes(true)}
          disabled={!fechamentoAtual}
        >
          <div className="flex items-start justify-between">
            <p className="text-lg font-bold">{kpisLoading ? '—' : formatarMoeda(kpis?.producao_financiamento_mes ?? 0)}</p>
            <FileStack className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-xs font-medium mt-2 opacity-95">Fechamento Processos</p>
          <p className="text-[11px] opacity-75">
            {kpisLoading ? '' : `${kpis?.qtd_processos_financiamento ?? 0} processos · ver detalhes`}
          </p>
        </button>

        <div className="rounded-xl p-4 bg-gray-200 text-gray-500">
          <div className="flex items-start justify-between">
            <p className="text-lg font-bold">—</p>
            <Boxes className="h-5 w-5 opacity-60" />
          </div>
          <p className="text-xs font-medium mt-2">Fechamento Consórcios</p>
          <p className="text-[11px] opacity-75">Em breve — fase seguinte</p>
        </div>

        <div className="rounded-xl p-4 bg-gray-200 text-gray-500">
          <div className="flex items-start justify-between">
            <p className="text-lg font-bold">—</p>
            <FileSignature className="h-5 w-5 opacity-60" />
          </div>
          <p className="text-xs font-medium mt-2">Fechamento Contratos</p>
          <p className="text-[11px] opacity-75">Em breve — fase seguinte</p>
        </div>

        <div className="rounded-xl p-4 bg-green-700 text-white">
          <div className="flex items-start justify-between">
            <p className="text-lg font-bold">{kpisLoading ? '—' : formatarMoeda(kpis?.producao_financiamento_mes ?? 0)}</p>
            <Layers className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-xs font-medium mt-2 opacity-95">Fechamento Total</p>
          <p className="text-[11px] opacity-75">Só Financiamento nesta fase</p>
        </div>
      </div>

      {fechamentoAtual && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-gray-500" onClick={() => onIrParaFechamento(fechamentoAtual.competencia_mes, fechamentoAtual.competencia_ano, 'fechamento')}>
            <Landmark className="h-3.5 w-3.5" /> Ir para o Fechamento completo
          </Button>
        </div>
      )}

      <ModalDetalheEmissoes aberto={modalEmissoes} onFechar={() => setModalEmissoes(false)} />
    </div>
  )
}
