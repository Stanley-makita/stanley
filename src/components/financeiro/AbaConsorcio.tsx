'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { DollarSign, Loader2 } from 'lucide-react'
import {
  useConsorcioReceber,
  useConsorcioComercialPagar,
  useMarcarParcelaConsorcioRecebida,
  useMarcarParcelaConsorcioPaga,
} from '@/hooks/financeiro/useConsorcioFluxo'
import { type FinConsorcioReceber, type FinConsorcioComercialPagar, type FinStatusParcelaConsorcio } from '@/types/financeiro'
import { formatarMoeda } from '@/lib/utils'
import { calcularPeriodo, type TipoPeriodo } from '@/components/relatorios/SeletorPeriodo'
import { DREPeriodoCards, type ResumoPeriodoDRE } from '@/components/financeiro/DREPeriodoCards'

const STATUS_PARCELA: Record<FinStatusParcelaConsorcio, { label: string; class: string }> = {
  prevista:  { label: 'Prevista',  class: 'bg-gray-100 text-gray-600' },
  recebida:  { label: 'Recebida',  class: 'bg-green-100 text-green-700' },
  paga:      { label: 'Paga',      class: 'bg-green-100 text-green-700' },
  atrasada:  { label: 'Atrasada',  class: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada', class: 'bg-gray-100 text-gray-400' },
}

type SubAba = 'receber' | 'pagar' | 'resumo' | 'dre'

export function AbaConsorcio() {
  const [subAba, setSubAba] = useState<SubAba>('receber')

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setSubAba('receber')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'receber' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          A Receber (Empresa)
        </button>
        <button
          onClick={() => setSubAba('pagar')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'pagar' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Comercial a Pagar
        </button>
        <button
          onClick={() => setSubAba('resumo')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'resumo' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Resumo por Cota
        </button>
        <button
          onClick={() => setSubAba('dre')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'dre' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Prévia Financeira / DRE
        </button>
      </div>

      {subAba === 'receber' ? <VisaoConsorcioReceber />
        : subAba === 'pagar' ? <VisaoConsorcioComercialPagar />
        : subAba === 'resumo' ? <VisaoConsorcioResumoPorCota />
        : <VisaoConsorcioDRE />}
    </div>
  )
}

function nomeCota(processo?: FinConsorcioReceber['processo'], cota?: FinConsorcioReceber['processo_cota']) {
  const cliente = processo?.lead?.nome ?? '—'
  const partes = [cota?.administradora_nome, cota?.grupo && `Grupo ${cota.grupo}`, cota?.cota && `Cota ${cota.cota}`].filter(Boolean)
  return { cliente, detalhe: partes.join(' · ') || '—' }
}

function VisaoConsorcioReceber() {
  const { data, isLoading } = useConsorcioReceber()
  const marcarRecebida = useMarcarParcelaConsorcioRecebida()
  const parcelas = data ?? []

  const [modal, setModal] = useState<FinConsorcioReceber | null>(null)
  const [form, setForm] = useState({ valor: '', data: '' })

  const totalPrevisto = parcelas.filter(p => p.status !== 'cancelada').reduce((s, p) => s + p.valor_parcela, 0)
  const totalRecebido = parcelas.reduce((s, p) => s + (p.valor_recebido ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Previsto</p>
          <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(totalPrevisto)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Recebido</p>
          <p className="text-lg font-semibold text-green-700">{formatarMoeda(totalRecebido)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Saldo</p>
          <p className={`text-lg font-semibold ${totalPrevisto - totalRecebido > 0 ? 'text-orange-600' : 'text-green-700'}`}>
            {formatarMoeda(totalPrevisto - totalRecebido)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Cliente / Cota</TableHead>
              <TableHead className="text-xs">Parcela</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="text-xs">Vencimento</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-16">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : parcelas.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400 text-sm">Nenhuma parcela de consórcio a receber.</TableCell></TableRow>
            ) : (
              parcelas.map(p => {
                const { cliente, detalhe } = nomeCota(p.processo, p.processo_cota)
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{cliente}</div>
                      <div className="text-xs text-gray-500">{detalhe}</div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{p.numero_parcela}/{p.total_parcelas}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{formatarMoeda(p.valor_parcela)}</TableCell>
                    <TableCell className="text-sm text-gray-500">{new Date(p.data_vencimento).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_PARCELA[p.status].class}`}>{STATUS_PARCELA[p.status].label}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.status === 'prevista' || p.status === 'atrasada' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Marcar como recebida"
                          onClick={() => { setModal(p); setForm({ valor: String(p.valor_parcela), data: '' }) }}
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!modal} onOpenChange={() => setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Registrar Recebimento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Valor Recebido *</Label>
              <Input type="number" step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Data do Recebimento *</Label>
              <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button
              disabled={!form.valor || !form.data || marcarRecebida.isPending}
              onClick={() => {
                if (!modal) return
                marcarRecebida.mutate(
                  { id: modal.id, valor_recebido: parseFloat(form.valor), data_recebimento: form.data },
                  { onSuccess: () => setModal(null) }
                )
              }}
            >
              {marcarRecebida.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function VisaoConsorcioComercialPagar() {
  const { data, isLoading } = useConsorcioComercialPagar()
  const marcarPaga = useMarcarParcelaConsorcioPaga()
  const parcelas = data ?? []

  const [modal, setModal] = useState<FinConsorcioComercialPagar | null>(null)
  const [form, setForm] = useState({ valor: '', data: '' })

  const totalPrevisto = parcelas.filter(p => p.status !== 'cancelada').reduce((s, p) => s + p.valor_parcela, 0)
  const totalPago = parcelas.reduce((s, p) => s + (p.valor_pago ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Previsto</p>
          <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(totalPrevisto)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Pago</p>
          <p className="text-lg font-semibold text-green-700">{formatarMoeda(totalPago)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Saldo</p>
          <p className={`text-lg font-semibold ${totalPrevisto - totalPago > 0 ? 'text-orange-600' : 'text-green-700'}`}>
            {formatarMoeda(totalPrevisto - totalPago)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Comercial</TableHead>
              <TableHead className="text-xs">Cliente / Cota</TableHead>
              <TableHead className="text-xs">Parcela</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="text-xs">Vencimento</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-16">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : parcelas.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Nenhuma parcela de comissão de consórcio a pagar.</TableCell></TableRow>
            ) : (
              parcelas.map(p => {
                const { cliente, detalhe } = nomeCota(p.processo, p.processo_cota)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.usuario?.nome ?? '—'}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{cliente}</div>
                      <div className="text-xs text-gray-500">{detalhe}</div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{p.numero_parcela}/{p.total_parcelas}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{formatarMoeda(p.valor_parcela)}</TableCell>
                    <TableCell className="text-sm text-gray-500">{new Date(p.data_vencimento).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_PARCELA[p.status].class}`}>{STATUS_PARCELA[p.status].label}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.status === 'prevista' || p.status === 'atrasada' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Marcar como paga"
                          onClick={() => { setModal(p); setForm({ valor: String(p.valor_parcela), data: '' }) }}
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!modal} onOpenChange={() => setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Registrar Pagamento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Valor Pago *</Label>
              <Input type="number" step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Data do Pagamento *</Label>
              <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button
              disabled={!form.valor || !form.data || marcarPaga.isPending}
              onClick={() => {
                if (!modal) return
                marcarPaga.mutate(
                  { id: modal.id, valor_pago: parseFloat(form.valor), data_pagamento: form.data },
                  { onSuccess: () => setModal(null) }
                )
              }}
            >
              {marcarPaga.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface ResumoCota {
  cliente: string
  detalhe: string
  valorCarta: number
  comissaoFontinhas: number
  comissaoComercial: number
}

function VisaoConsorcioResumoPorCota() {
  const { data: receber, isLoading: carregandoReceber } = useConsorcioReceber()
  const { data: pagar, isLoading: carregandoPagar } = useConsorcioComercialPagar()
  const isLoading = carregandoReceber || carregandoPagar

  const porCota = new Map<string, ResumoCota>()

  for (const p of receber ?? []) {
    const { cliente, detalhe } = nomeCota(p.processo, p.processo_cota)
    const atual = porCota.get(p.processo_cota_id) ?? {
      cliente, detalhe, valorCarta: p.processo_cota?.valor_carta ?? 0, comissaoFontinhas: 0, comissaoComercial: 0,
    }
    atual.comissaoFontinhas += p.status !== 'cancelada' ? p.valor_parcela : 0
    porCota.set(p.processo_cota_id, atual)
  }

  for (const p of pagar ?? []) {
    const { cliente, detalhe } = nomeCota(p.processo, p.processo_cota)
    const atual = porCota.get(p.processo_cota_id) ?? {
      cliente, detalhe, valorCarta: p.processo_cota?.valor_carta ?? 0, comissaoFontinhas: 0, comissaoComercial: 0,
    }
    atual.comissaoComercial += p.status !== 'cancelada' ? p.valor_parcela : 0
    porCota.set(p.processo_cota_id, atual)
  }

  const linhas = Array.from(porCota.values())

  return (
    <div className="rounded-lg border bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="text-xs">Cliente / Cota</TableHead>
            <TableHead className="text-xs text-right">Valor da Carta</TableHead>
            <TableHead className="text-xs text-right">% Fontinhas</TableHead>
            <TableHead className="text-xs text-right">Comissão Fontinhas</TableHead>
            <TableHead className="text-xs text-right">% Comercial</TableHead>
            <TableHead className="text-xs text-right">Comissão Comercial</TableHead>
            <TableHead className="text-xs text-right">Saldo Empresa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
          ) : linhas.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Nenhuma cota com fluxo financeiro gerado.</TableCell></TableRow>
          ) : (
            linhas.map((r, i) => {
              const pctFontinhas = r.valorCarta > 0 ? (r.comissaoFontinhas / r.valorCarta) * 100 : 0
              const pctComercial = r.valorCarta > 0 ? (r.comissaoComercial / r.valorCarta) * 100 : 0
              const saldo = r.comissaoFontinhas - r.comissaoComercial
              return (
                <TableRow key={i}>
                  <TableCell>
                    <div className="text-sm font-medium">{r.cliente}</div>
                    <div className="text-xs text-gray-500">{r.detalhe}</div>
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatarMoeda(r.valorCarta)}</TableCell>
                  <TableCell className="text-right text-sm text-gray-500">{pctFontinhas.toFixed(2)}%</TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatarMoeda(r.comissaoFontinhas)}</TableCell>
                  <TableCell className="text-right text-sm text-gray-500">{pctComercial.toFixed(2)}%</TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatarMoeda(r.comissaoComercial)}</TableCell>
                  <TableCell className="text-right text-sm font-mono font-medium text-fonti-primary">{formatarMoeda(saldo)}</TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

const PERIODOS_DRE: { tipo: TipoPeriodo; label: string }[] = [
  { tipo: 'mes',       label: 'Mês Vigente' },
  { tipo: 'trimestre', label: 'Trimestre Vigente' },
  { tipo: 'semestre',  label: 'Semestre Vigente' },
  { tipo: 'ano',       label: 'Ano Vigente' },
]

// Compara só a parte AAAA-MM-DD (datas do banco vêm como DATE puro) —
// inclusive nas duas pontas do período.
function dentroPeriodo(data: string | null | undefined, inicio: string, fim: string): boolean {
  if (!data) return false
  const dataOnly = data.slice(0, 10)
  return dataOnly >= inicio && dataOnly <= fim
}

function VisaoConsorcioDRE() {
  const { data: receber, isLoading: carregandoReceber } = useConsorcioReceber()
  const { data: pagar, isLoading: carregandoPagar } = useConsorcioComercialPagar()
  const isLoading = carregandoReceber || carregandoPagar

  const resumos: ResumoPeriodoDRE[] = PERIODOS_DRE.map(({ tipo, label }) => {
    const { dataInicio, dataFim } = calcularPeriodo(tipo)

    const receitaPrevista = (receber ?? [])
      .filter(p => p.status !== 'cancelada' && dentroPeriodo(p.data_vencimento, dataInicio, dataFim))
      .reduce((s, p) => s + p.valor_parcela, 0)

    const receitaRealizada = (receber ?? [])
      .filter(p => dentroPeriodo(p.data_recebimento, dataInicio, dataFim))
      .reduce((s, p) => s + (p.valor_recebido ?? 0), 0)

    const despesaPrevista = (pagar ?? [])
      .filter(p => p.status !== 'cancelada' && dentroPeriodo(p.data_vencimento, dataInicio, dataFim))
      .reduce((s, p) => s + p.valor_parcela, 0)

    const despesaRealizada = (pagar ?? [])
      .filter(p => dentroPeriodo(p.data_pagamento, dataInicio, dataFim))
      .reduce((s, p) => s + (p.valor_pago ?? 0), 0)

    return { label, dataInicio, dataFim, receitaPrevista, receitaRealizada, despesaPrevista, despesaRealizada }
  })

  return (
    <DREPeriodoCards
      resumos={resumos}
      isLoading={isLoading}
      legenda={<>Comissão de Consórcio acumulada por período — <strong>Previsto</strong> soma pelo vencimento (regime de competência), <strong>Realizado</strong> soma pelo que já foi efetivamente recebido/pago (regime de caixa).</>}
    />
  )
}
