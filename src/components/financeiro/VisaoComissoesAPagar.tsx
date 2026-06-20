'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Pencil, CheckCircle2, Loader2 } from 'lucide-react'
import {
  useComissoesAPagar,
  useAtualizarComissaoPagar,
  useMarcarComissoesPagas,
} from '@/hooks/financeiro/useComissoesAPagar'
import { type FinComissaoPagar, type FinPapelComissao } from '@/types/financeiro'
import { formatarMoeda } from '@/lib/utils'

const PAPEL_LABELS: Record<FinPapelComissao, string> = {
  comercial:   'Comercial',
  operacional: 'Operacional',
  parceiro:    'Parceiro',
  assessoria:  'Assessoria',
  gerente:     'Gerente',
  outro:       'Outro',
}

const PAPEL_COLORS: Record<FinPapelComissao, string> = {
  comercial:   'bg-blue-100 text-blue-700',
  operacional: 'bg-purple-100 text-purple-700',
  parceiro:    'bg-orange-100 text-orange-700',
  assessoria:  'bg-teal-100 text-teal-700',
  gerente:     'bg-green-100 text-green-700',
  outro:       'bg-gray-100 text-gray-600',
}

interface Props {
  fechamento_id: string
  travado: boolean
}

export function VisaoComissoesAPagar({ fechamento_id, travado }: Props) {
  const { data: comissoes = [], isLoading } = useComissoesAPagar(fechamento_id)
  const atualizar = useAtualizarComissaoPagar()
  const marcarPagas = useMarcarComissoesPagas()

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [modalAjuste, setModalAjuste] = useState<FinComissaoPagar | null>(null)
  const [modalPagar, setModalPagar] = useState(false)
  const [ajusteValor, setAjusteValor] = useState('')
  const [ajusteObs, setAjusteObs] = useState('')
  const [dataPagamento, setDataPagamento] = useState('')

  const totalFinal = comissoes.reduce((s, c) => s + c.valor_final, 0)
  const pendentes = comissoes.filter(c => c.status !== 'paga' && c.status !== 'cancelada')
  const totalPendente = pendentes.reduce((s, c) => s + c.valor_final, 0)

  const toggleSelecionado = (id: string) =>
    setSelecionados(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })

  const toggleTodos = () =>
    setSelecionados(prev =>
      prev.size === pendentes.length
        ? new Set()
        : new Set(pendentes.map(c => c.id))
    )

  const nomePessoa = (c: FinComissaoPagar) =>
    c.funcionario?.nome ?? c.usuario?.nome ?? 'Externo'

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Total a pagar</p>
          <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(totalFinal)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Pendentes</p>
          <p className="text-lg font-semibold text-orange-600">{formatarMoeda(totalPendente)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Comissões</p>
          <p className="text-lg font-semibold text-gray-700">{comissoes.length}</p>
        </div>
      </div>

      {/* Ações em lote */}
      {!travado && selecionados.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-fonti-accent bg-fonti-surface-accent p-3">
          <span className="text-sm font-medium">{selecionados.size} selecionado(s)</span>
          <Button
            size="sm"
            className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1"
            onClick={() => setModalPagar(true)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Marcar como pago
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>
            Limpar
          </Button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              {!travado && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={selecionados.size === pendentes.length && pendentes.length > 0}
                    onChange={toggleTodos}
                    className="cursor-pointer"
                  />
                </TableHead>
              )}
              <TableHead className="text-xs">Pessoa</TableHead>
              <TableHead className="text-xs">Papel</TableHead>
              <TableHead className="text-xs text-right">Base</TableHead>
              <TableHead className="text-xs text-right">%</TableHead>
              <TableHead className="text-xs text-right">Calculado</TableHead>
              <TableHead className="text-xs text-right">Ajuste</TableHead>
              <TableHead className="text-xs text-right font-semibold">Final</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {!travado && <TableHead className="text-xs w-8" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell>
              </TableRow>
            ) : comissoes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">
                  Nenhuma comissão. Use "Gerar Comissões" na aba Fechamento.
                </TableCell>
              </TableRow>
            ) : (
              comissoes.map(c => (
                <TableRow key={c.id} className="hover:bg-gray-50">
                  {!travado && (
                    <TableCell>
                      {c.status !== 'paga' && c.status !== 'cancelada' && (
                        <input
                          type="checkbox"
                          checked={selecionados.has(c.id)}
                          onChange={() => toggleSelecionado(c.id)}
                          className="cursor-pointer"
                        />
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-sm font-medium">{nomePessoa(c)}</TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${PAPEL_COLORS[c.papel]}`}>
                      {PAPEL_LABELS[c.papel]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono text-gray-500">
                    {formatarMoeda(c.valor_base)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-500">
                    {c.percentual.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {formatarMoeda(c.valor_calculado)}
                  </TableCell>
                  <TableCell className={`text-right text-sm font-mono ${c.ajuste_manual !== 0 ? c.ajuste_manual > 0 ? 'text-green-600' : 'text-red-500' : 'text-gray-400'}`}>
                    {c.ajuste_manual !== 0 ? (c.ajuste_manual > 0 ? '+' : '') + formatarMoeda(c.ajuste_manual) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold font-mono">
                    {formatarMoeda(c.valor_final)}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${c.status === 'paga' ? 'bg-green-100 text-green-700' : c.status === 'cancelada' ? 'bg-gray-100 text-gray-400' : 'bg-yellow-100 text-yellow-700'}`}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  {!travado && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Ajuste manual"
                        onClick={() => { setModalAjuste(c); setAjusteValor(String(c.ajuste_manual)); setAjusteObs(c.observacoes ?? '') }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Ajuste */}
      <Dialog open={!!modalAjuste} onOpenChange={() => setModalAjuste(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste Manual — {modalAjuste ? nomePessoa(modalAjuste) : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-gray-500">
              Calculado: <strong>{modalAjuste ? formatarMoeda(modalAjuste.valor_calculado) : ''}</strong>
            </p>
            <div className="space-y-1">
              <Label>Ajuste (positivo ou negativo)</Label>
              <Input
                type="number"
                step="0.01"
                value={ajusteValor}
                onChange={e => setAjusteValor(e.target.value)}
                placeholder="Ex: -50.00 ou 100.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Textarea value={ajusteObs} onChange={e => setAjusteObs(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAjuste(null)}>Cancelar</Button>
            <Button
              disabled={atualizar.isPending}
              onClick={() => {
                if (!modalAjuste) return
                atualizar.mutate({
                  id: modalAjuste.id,
                  ajuste_manual: parseFloat(ajusteValor) || 0,
                  observacoes: ajusteObs,
                }, { onSuccess: () => setModalAjuste(null) })
              }}
            >
              {atualizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Pagar */}
      <Dialog open={modalPagar} onOpenChange={setModalPagar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar {selecionados.size} comissão(ões) como pagas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Data do Pagamento *</Label>
              <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalPagar(false)}>Cancelar</Button>
            <Button
              disabled={!dataPagamento || marcarPagas.isPending}
              onClick={() => {
                marcarPagas.mutate(
                  { ids: Array.from(selecionados), data_pagamento: dataPagamento },
                  { onSuccess: () => { setModalPagar(false); setSelecionados(new Set()) } }
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
