'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { DollarSign, Loader2, X } from 'lucide-react'
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
  return {
    cliente: processo?.lead?.nome ?? '—',
    administradora: cota?.administradora_nome ?? '—',
    grupo: cota?.grupo ?? '—',
    cota: cota?.cota ?? '—',
  }
}

const SEM_FILTRO = 'todos'

function FiltroInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-7 text-xs"
    />
  )
}

function FiltroSelect({ value, onChange, opcoes, placeholder }: { value: string; onChange: (v: string) => void; opcoes: { value: string; label: string }[]; placeholder: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
        {opcoes.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function BotaoLimparFiltros({ visivel, onClick }: { visivel: boolean; onClick: () => void }) {
  if (!visivel) return null
  return (
    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-gray-500" onClick={onClick}>
      <X className="h-3 w-3" />
      Limpar filtros
    </Button>
  )
}

function VisaoConsorcioReceber() {
  const { data, isLoading } = useConsorcioReceber()
  const marcarRecebida = useMarcarParcelaConsorcioRecebida()
  const parcelas = data ?? []

  const [modal, setModal] = useState<FinConsorcioReceber | null>(null)
  const [form, setForm] = useState({ valor: '', data: '' })

  const [filtros, setFiltros] = useState({
    cliente: '', administradora: SEM_FILTRO, grupo: '', cota: '',
    vencimentoDe: '', vencimentoAte: '', status: SEM_FILTRO,
  })
  const filtrosAtivos = filtros.cliente !== '' || filtros.administradora !== SEM_FILTRO || filtros.grupo !== ''
    || filtros.cota !== '' || filtros.vencimentoDe !== '' || filtros.vencimentoAte !== '' || filtros.status !== SEM_FILTRO
  const limparFiltros = () => setFiltros({ cliente: '', administradora: SEM_FILTRO, grupo: '', cota: '', vencimentoDe: '', vencimentoAte: '', status: SEM_FILTRO })

  const administradoras = useMemo(
    () => Array.from(new Set(parcelas.map(p => p.processo_cota?.administradora_nome).filter((v): v is string => !!v))).sort(),
    [parcelas]
  )

  const parcelasFiltradas = parcelas.filter(p => {
    const { cliente, administradora, grupo, cota } = nomeCota(p.processo, p.processo_cota)
    if (filtros.cliente && !cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false
    if (filtros.administradora !== SEM_FILTRO && administradora !== filtros.administradora) return false
    if (filtros.grupo && !grupo.toLowerCase().includes(filtros.grupo.toLowerCase())) return false
    if (filtros.cota && !cota.toLowerCase().includes(filtros.cota.toLowerCase())) return false
    if (filtros.status !== SEM_FILTRO && p.status !== filtros.status) return false
    const venc = p.data_vencimento?.slice(0, 10) ?? ''
    if (filtros.vencimentoDe && venc < filtros.vencimentoDe) return false
    if (filtros.vencimentoAte && venc > filtros.vencimentoAte) return false
    return true
  })

  const totalPrevisto = parcelasFiltradas.filter(p => p.status !== 'cancelada').reduce((s, p) => s + p.valor_parcela, 0)
  const totalRecebido = parcelasFiltradas.reduce((s, p) => s + (p.valor_recebido ?? 0), 0)

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

      <div className="flex justify-end">
        <BotaoLimparFiltros visivel={filtrosAtivos} onClick={limparFiltros} />
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Administradora</TableHead>
              <TableHead className="text-xs">Grupo</TableHead>
              <TableHead className="text-xs">Cota</TableHead>
              <TableHead className="text-xs">Parcela</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="text-xs">Vencimento</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-16">Ações</TableHead>
            </TableRow>
            <TableRow className="bg-gray-50/60">
              <TableHead className="py-1.5"><FiltroInput value={filtros.cliente} onChange={v => setFiltros(f => ({ ...f, cliente: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5">
                <FiltroSelect
                  value={filtros.administradora}
                  onChange={v => setFiltros(f => ({ ...f, administradora: v }))}
                  opcoes={administradoras.map(a => ({ value: a, label: a }))}
                  placeholder="Todas"
                />
              </TableHead>
              <TableHead className="py-1.5"><FiltroInput value={filtros.grupo} onChange={v => setFiltros(f => ({ ...f, grupo: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5"><FiltroInput value={filtros.cota} onChange={v => setFiltros(f => ({ ...f, cota: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5" />
              <TableHead className="py-1.5" />
              <TableHead className="py-1.5">
                <div className="flex gap-1">
                  <Input type="date" value={filtros.vencimentoDe} onChange={e => setFiltros(f => ({ ...f, vencimentoDe: e.target.value }))} className="h-7 text-xs px-1" />
                  <Input type="date" value={filtros.vencimentoAte} onChange={e => setFiltros(f => ({ ...f, vencimentoAte: e.target.value }))} className="h-7 text-xs px-1" />
                </div>
              </TableHead>
              <TableHead className="py-1.5">
                <FiltroSelect
                  value={filtros.status}
                  onChange={v => setFiltros(f => ({ ...f, status: v }))}
                  opcoes={Object.entries(STATUS_PARCELA).map(([value, s]) => ({ value, label: s.label }))}
                  placeholder="Todos"
                />
              </TableHead>
              <TableHead className="py-1.5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : parcelasFiltradas.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400 text-sm">Nenhuma parcela de consórcio a receber.</TableCell></TableRow>
            ) : (
              parcelasFiltradas.map(p => {
                const { cliente, administradora, grupo, cota } = nomeCota(p.processo, p.processo_cota)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">{cliente}</TableCell>
                    <TableCell className="text-sm text-gray-500">{administradora}</TableCell>
                    <TableCell className="text-sm text-gray-500">{grupo}</TableCell>
                    <TableCell className="text-sm text-gray-500">{cota}</TableCell>
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

  const [filtros, setFiltros] = useState({
    comercial: SEM_FILTRO, cliente: '', administradora: SEM_FILTRO, grupo: '', cota: '',
    vencimentoDe: '', vencimentoAte: '', status: SEM_FILTRO,
  })
  const filtrosAtivos = filtros.comercial !== SEM_FILTRO || filtros.cliente !== '' || filtros.administradora !== SEM_FILTRO
    || filtros.grupo !== '' || filtros.cota !== '' || filtros.vencimentoDe !== '' || filtros.vencimentoAte !== '' || filtros.status !== SEM_FILTRO
  const limparFiltros = () => setFiltros({ comercial: SEM_FILTRO, cliente: '', administradora: SEM_FILTRO, grupo: '', cota: '', vencimentoDe: '', vencimentoAte: '', status: SEM_FILTRO })

  const comerciais = useMemo(
    () => Array.from(new Set(parcelas.map(p => p.usuario?.nome).filter((v): v is string => !!v))).sort(),
    [parcelas]
  )
  const administradoras = useMemo(
    () => Array.from(new Set(parcelas.map(p => p.processo_cota?.administradora_nome).filter((v): v is string => !!v))).sort(),
    [parcelas]
  )

  const parcelasFiltradas = parcelas.filter(p => {
    const { cliente, administradora, grupo, cota } = nomeCota(p.processo, p.processo_cota)
    if (filtros.comercial !== SEM_FILTRO && p.usuario?.nome !== filtros.comercial) return false
    if (filtros.cliente && !cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false
    if (filtros.administradora !== SEM_FILTRO && administradora !== filtros.administradora) return false
    if (filtros.grupo && !grupo.toLowerCase().includes(filtros.grupo.toLowerCase())) return false
    if (filtros.cota && !cota.toLowerCase().includes(filtros.cota.toLowerCase())) return false
    if (filtros.status !== SEM_FILTRO && p.status !== filtros.status) return false
    const venc = p.data_vencimento?.slice(0, 10) ?? ''
    if (filtros.vencimentoDe && venc < filtros.vencimentoDe) return false
    if (filtros.vencimentoAte && venc > filtros.vencimentoAte) return false
    return true
  })

  const totalPrevisto = parcelasFiltradas.filter(p => p.status !== 'cancelada').reduce((s, p) => s + p.valor_parcela, 0)
  const totalPago = parcelasFiltradas.reduce((s, p) => s + (p.valor_pago ?? 0), 0)

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

      <div className="flex justify-end">
        <BotaoLimparFiltros visivel={filtrosAtivos} onClick={limparFiltros} />
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Comercial</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Administradora</TableHead>
              <TableHead className="text-xs">Grupo</TableHead>
              <TableHead className="text-xs">Cota</TableHead>
              <TableHead className="text-xs">Parcela</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="text-xs">Vencimento</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-16">Ações</TableHead>
            </TableRow>
            <TableRow className="bg-gray-50/60">
              <TableHead className="py-1.5">
                <FiltroSelect
                  value={filtros.comercial}
                  onChange={v => setFiltros(f => ({ ...f, comercial: v }))}
                  opcoes={comerciais.map(c => ({ value: c, label: c }))}
                  placeholder="Todos"
                />
              </TableHead>
              <TableHead className="py-1.5"><FiltroInput value={filtros.cliente} onChange={v => setFiltros(f => ({ ...f, cliente: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5">
                <FiltroSelect
                  value={filtros.administradora}
                  onChange={v => setFiltros(f => ({ ...f, administradora: v }))}
                  opcoes={administradoras.map(a => ({ value: a, label: a }))}
                  placeholder="Todas"
                />
              </TableHead>
              <TableHead className="py-1.5"><FiltroInput value={filtros.grupo} onChange={v => setFiltros(f => ({ ...f, grupo: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5"><FiltroInput value={filtros.cota} onChange={v => setFiltros(f => ({ ...f, cota: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5" />
              <TableHead className="py-1.5" />
              <TableHead className="py-1.5">
                <div className="flex gap-1">
                  <Input type="date" value={filtros.vencimentoDe} onChange={e => setFiltros(f => ({ ...f, vencimentoDe: e.target.value }))} className="h-7 text-xs px-1" />
                  <Input type="date" value={filtros.vencimentoAte} onChange={e => setFiltros(f => ({ ...f, vencimentoAte: e.target.value }))} className="h-7 text-xs px-1" />
                </div>
              </TableHead>
              <TableHead className="py-1.5">
                <FiltroSelect
                  value={filtros.status}
                  onChange={v => setFiltros(f => ({ ...f, status: v }))}
                  opcoes={Object.entries(STATUS_PARCELA).map(([value, s]) => ({ value, label: s.label }))}
                  placeholder="Todos"
                />
              </TableHead>
              <TableHead className="py-1.5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : parcelasFiltradas.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">Nenhuma parcela de comissão de consórcio a pagar.</TableCell></TableRow>
            ) : (
              parcelasFiltradas.map(p => {
                const { cliente, administradora, grupo, cota } = nomeCota(p.processo, p.processo_cota)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.usuario?.nome ?? '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{cliente}</TableCell>
                    <TableCell className="text-sm text-gray-500">{administradora}</TableCell>
                    <TableCell className="text-sm text-gray-500">{grupo}</TableCell>
                    <TableCell className="text-sm text-gray-500">{cota}</TableCell>
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
  administradora: string
  grupo: string
  cota: string
  valorCarta: number
  comissaoFontinhas: number
  comissaoComercial: number
}

function VisaoConsorcioResumoPorCota() {
  const { data: receber, isLoading: carregandoReceber } = useConsorcioReceber()
  const { data: pagar, isLoading: carregandoPagar } = useConsorcioComercialPagar()
  const isLoading = carregandoReceber || carregandoPagar

  const [filtros, setFiltros] = useState({ cliente: '', administradora: SEM_FILTRO, grupo: '', cota: '' })
  const filtrosAtivos = filtros.cliente !== '' || filtros.administradora !== SEM_FILTRO || filtros.grupo !== '' || filtros.cota !== ''
  const limparFiltros = () => setFiltros({ cliente: '', administradora: SEM_FILTRO, grupo: '', cota: '' })

  const porCota = new Map<string, ResumoCota>()

  for (const p of receber ?? []) {
    const { cliente, administradora, grupo, cota } = nomeCota(p.processo, p.processo_cota)
    const atual = porCota.get(p.processo_cota_id) ?? {
      cliente, administradora, grupo, cota, valorCarta: p.processo_cota?.valor_carta ?? 0, comissaoFontinhas: 0, comissaoComercial: 0,
    }
    atual.comissaoFontinhas += p.status !== 'cancelada' ? p.valor_parcela : 0
    porCota.set(p.processo_cota_id, atual)
  }

  for (const p of pagar ?? []) {
    const { cliente, administradora, grupo, cota } = nomeCota(p.processo, p.processo_cota)
    const atual = porCota.get(p.processo_cota_id) ?? {
      cliente, administradora, grupo, cota, valorCarta: p.processo_cota?.valor_carta ?? 0, comissaoFontinhas: 0, comissaoComercial: 0,
    }
    atual.comissaoComercial += p.status !== 'cancelada' ? p.valor_parcela : 0
    porCota.set(p.processo_cota_id, atual)
  }

  const administradoras = useMemo(
    () => Array.from(new Set(Array.from(porCota.values()).map(r => r.administradora).filter(a => a && a !== '—'))).sort(),
    [porCota]
  )

  const linhas = Array.from(porCota.values()).filter(r => {
    if (filtros.cliente && !r.cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false
    if (filtros.administradora !== SEM_FILTRO && r.administradora !== filtros.administradora) return false
    if (filtros.grupo && !r.grupo.toLowerCase().includes(filtros.grupo.toLowerCase())) return false
    if (filtros.cota && !r.cota.toLowerCase().includes(filtros.cota.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <BotaoLimparFiltros visivel={filtrosAtivos} onClick={limparFiltros} />
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Administradora</TableHead>
              <TableHead className="text-xs">Grupo</TableHead>
              <TableHead className="text-xs">Cota</TableHead>
              <TableHead className="text-xs text-right">Valor da Carta</TableHead>
              <TableHead className="text-xs text-right">% Fontinhas</TableHead>
              <TableHead className="text-xs text-right">Comissão Fontinhas</TableHead>
              <TableHead className="text-xs text-right">% Comercial</TableHead>
              <TableHead className="text-xs text-right">Comissão Comercial</TableHead>
              <TableHead className="text-xs text-right">Saldo Empresa</TableHead>
            </TableRow>
            <TableRow className="bg-gray-50/60">
              <TableHead className="py-1.5"><FiltroInput value={filtros.cliente} onChange={v => setFiltros(f => ({ ...f, cliente: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5">
                <FiltroSelect
                  value={filtros.administradora}
                  onChange={v => setFiltros(f => ({ ...f, administradora: v }))}
                  opcoes={administradoras.map(a => ({ value: a, label: a }))}
                  placeholder="Todas"
                />
              </TableHead>
              <TableHead className="py-1.5"><FiltroInput value={filtros.grupo} onChange={v => setFiltros(f => ({ ...f, grupo: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5"><FiltroInput value={filtros.cota} onChange={v => setFiltros(f => ({ ...f, cota: v }))} placeholder="Filtrar..." /></TableHead>
              <TableHead className="py-1.5" colSpan={6} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : linhas.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">Nenhuma cota com fluxo financeiro gerado.</TableCell></TableRow>
            ) : (
              linhas.map((r, i) => {
                const pctFontinhas = r.valorCarta > 0 ? (r.comissaoFontinhas / r.valorCarta) * 100 : 0
                const pctComercial = r.valorCarta > 0 ? (r.comissaoComercial / r.valorCarta) * 100 : 0
                const saldo = r.comissaoFontinhas - r.comissaoComercial
                return (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{r.cliente}</TableCell>
                    <TableCell className="text-sm text-gray-500">{r.administradora}</TableCell>
                    <TableCell className="text-sm text-gray-500">{r.grupo}</TableCell>
                    <TableCell className="text-sm text-gray-500">{r.cota}</TableCell>
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
