'use client'

import { useState } from 'react'
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
import { Plus, CheckCircle2, Loader2 } from 'lucide-react'
import {
  useDespesas,
  useAdicionarDespesa,
  useMarcarDespesaPaga,
  useRemoverDespesa,
} from '@/hooks/financeiro/useDespesas'
import { type FinDespesa, type FinCategoriaDespesa, type FinTipoDespesa } from '@/types/financeiro'
import { formatarMoeda } from '@/lib/utils'

const CATEGORIAS: Record<FinCategoriaDespesa, string> = {
  aluguel:    'Aluguel',
  salarios:   'Salários',
  marketing:  'Marketing',
  software:   'Software',
  impostos:   'Impostos',
  servicos:   'Serviços',
  outros:     'Outros',
}

const STATUS_COLORS: Record<string, string> = {
  prevista: 'bg-gray-100 text-gray-600',
  a_pagar:  'bg-blue-100 text-blue-700',
  paga:     'bg-green-100 text-green-700',
  vencida:  'bg-red-100 text-red-700',
  cancelada:'bg-gray-100 text-gray-400',
}

interface Props {
  fechamento_id: string
  travado: boolean
}

export function VisaoDespesas({ fechamento_id, travado }: Props) {
  const { data: despesas = [], isLoading } = useDespesas(fechamento_id)
  const adicionar = useAdicionarDespesa()
  const marcarPaga = useMarcarDespesaPaga()
  const remover = useRemoverDespesa()

  const [modalAdd, setModalAdd] = useState(false)
  const [modalPagar, setModalPagar] = useState<FinDespesa | null>(null)
  const [dataPagamento, setDataPagamento] = useState('')
  const [form, setForm] = useState({
    descricao: '',
    categoria: 'outros' as FinCategoriaDespesa,
    fornecedor: '',
    valor: '',
    data_vencimento: '',
    tipo: 'avulsa' as FinTipoDespesa,
  })

  const totalPrevisto = despesas.reduce((s, d) => s + d.valor, 0)
  const totalPago = despesas.filter(d => d.status === 'paga').reduce((s, d) => s + d.valor, 0)
  const totalPendente = despesas.filter(d => !['paga', 'cancelada'].includes(d.status)).reduce((s, d) => s + d.valor, 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Total previsto</p>
          <p className="text-lg font-semibold text-[#253B29]">{formatarMoeda(totalPrevisto)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Pago</p>
          <p className="text-lg font-semibold text-green-700">{formatarMoeda(totalPago)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">A pagar</p>
          <p className={`text-lg font-semibold ${totalPendente > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
            {formatarMoeda(totalPendente)}
          </p>
        </div>
      </div>

      {/* Ação adicionar */}
      {!travado && (
        <div className="flex justify-end">
          <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2a1d] text-white gap-1" onClick={() => setModalAdd(true)}>
            <Plus className="h-4 w-4" />
            Nova Despesa
          </Button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Descrição</TableHead>
              <TableHead className="text-xs">Categoria</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="text-xs">Vencimento</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {!travado && <TableHead className="text-xs w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell>
              </TableRow>
            ) : despesas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                  Nenhuma despesa registrada.
                </TableCell>
              </TableRow>
            ) : (
              despesas.map(d => (
                <TableRow key={d.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="text-sm font-medium">{d.descricao}</div>
                    {d.fornecedor && <div className="text-xs text-gray-500">{d.fornecedor}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{CATEGORIAS[d.categoria]}</TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${d.tipo === 'recorrente' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {d.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono font-semibold">{formatarMoeda(d.valor)}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {d.data_vencimento ? new Date(d.data_vencimento).toLocaleDateString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  {!travado && (
                    <TableCell>
                      <div className="flex gap-1">
                        {!['paga', 'cancelada'].includes(d.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600"
                            title="Marcar paga"
                            onClick={() => { setModalPagar(d); setDataPagamento('') }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Adicionar */}
      <Dialog open={modalAdd} onOpenChange={setModalAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Despesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={v => setForm(p => ({ ...p, categoria: v as FinCategoriaDespesa }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIAS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fornecedor</Label>
                <Input value={form.fornecedor} onChange={e => setForm(p => ({ ...p, fornecedor: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor *</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Vencimento</Label>
                <Input type="date" value={form.data_vencimento} onChange={e => setForm(p => ({ ...p, data_vencimento: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAdd(false)}>Cancelar</Button>
            <Button
              disabled={!form.descricao || !form.valor || adicionar.isPending}
              onClick={() => {
                adicionar.mutate({
                  fechamento_id,
                  tipo: 'avulsa',
                  categoria: form.categoria,
                  fornecedor: form.fornecedor || null,
                  descricao: form.descricao,
                  valor: parseFloat(form.valor),
                  data_vencimento: form.data_vencimento || null,
                  data_pagamento: null,
                  status: 'prevista',
                  recorrente_id: null,
                  comprovante_url: null,
                  observacoes: null,
                }, { onSuccess: () => { setModalAdd(false); setForm({ descricao: '', categoria: 'outros', fornecedor: '', valor: '', data_vencimento: '', tipo: 'avulsa' }) } })
              }}
            >
              {adicionar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Pagar */}
      <Dialog open={!!modalPagar} onOpenChange={() => setModalPagar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como paga</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-gray-600">{modalPagar?.descricao} — <strong>{modalPagar ? formatarMoeda(modalPagar.valor) : ''}</strong></p>
            <div className="space-y-1">
              <Label>Data do Pagamento *</Label>
              <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalPagar(null)}>Cancelar</Button>
            <Button
              disabled={!dataPagamento || marcarPaga.isPending}
              onClick={() => {
                if (!modalPagar) return
                marcarPaga.mutate(
                  { id: modalPagar.id, data_pagamento: dataPagamento },
                  { onSuccess: () => setModalPagar(null) }
                )
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
