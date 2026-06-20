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
import { FileText, Plus, DollarSign, ChevronDown, ChevronRight } from 'lucide-react'
import {
  useContasAReceber,
  useAdicionarNotaFiscal,
  useAdicionarRecebimento,
} from '@/hooks/financeiro/useContasAReceber'
import { type FinContaReceber, type FinStatusContaReceber } from '@/types/financeiro'
import { formatarMoeda } from '@/lib/utils'

const STATUS_NF: Record<FinStatusContaReceber, { label: string; class: string }> = {
  a_faturar:        { label: 'A Faturar',      class: 'bg-gray-100 text-gray-600' },
  faturado:         { label: 'Faturado',        class: 'bg-blue-100 text-blue-700' },
  recebido_parcial: { label: 'Parcial',         class: 'bg-yellow-100 text-yellow-700' },
  recebido:         { label: 'Recebido',        class: 'bg-green-100 text-green-700' },
  vencido:          { label: 'Vencido',         class: 'bg-red-100 text-red-700' },
  cancelado:        { label: 'Cancelado',       class: 'bg-gray-100 text-gray-400' },
}

interface Props {
  fechamento_id: string
  travado: boolean
}

export function VisaoAReceber({ fechamento_id, travado }: Props) {
  const { data: contas = [], isLoading } = useContasAReceber(fechamento_id)
  const adicionarNF = useAdicionarNotaFiscal()
  const adicionarRecebimento = useAdicionarRecebimento()

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [modalNF, setModalNF] = useState<FinContaReceber | null>(null)
  const [modalRec, setModalRec] = useState<FinContaReceber | null>(null)

  const [formNF, setFormNF] = useState({ numero_nf: '', valor_nf: '', data_emissao: '' })
  const [formRec, setFormRec] = useState({ valor: '', data_recebimento: '', forma_recebimento: 'pix' })

  const toggleExpandido = (id: string) =>
    setExpandidos(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })

  const totalPrevisto = contas.reduce((s, c) => s + c.valor_previsto, 0)
  const totalRecebido = contas.reduce((s, c) => s + c.valor_recebido, 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
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

      {/* Tabela */}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-6" />
              <TableHead className="text-xs">Cliente / Banco</TableHead>
              <TableHead className="text-xs">Origem</TableHead>
              <TableHead className="text-xs text-right">Previsto</TableHead>
              <TableHead className="text-xs text-right">Recebido</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Vencimento</TableHead>
              {!travado && <TableHead className="text-xs w-24">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : contas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                  Nenhuma conta a receber. Puxe as emissões primeiro.
                </TableCell>
              </TableRow>
            ) : (
              contas.map(conta => (
                <>
                  <TableRow
                    key={conta.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpandido(conta.id)}
                  >
                    <TableCell>
                      {expandidos.has(conta.id)
                        ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      }
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{conta.cliente_nome ?? '—'}</div>
                      <div className="text-xs text-gray-500">{conta.banco?.nome ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 capitalize">{conta.origem}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{formatarMoeda(conta.valor_previsto)}</TableCell>
                    <TableCell className="text-right text-sm font-mono text-green-700">{formatarMoeda(conta.valor_recebido)}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_NF[conta.status].class}`}>
                        {STATUS_NF[conta.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {conta.data_prevista ? new Date(conta.data_prevista).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    {!travado && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Registrar NF"
                            onClick={() => { setModalNF(conta); setFormNF({ numero_nf: '', valor_nf: String(conta.valor_previsto), data_emissao: '' }) }}
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Registrar Recebimento"
                            onClick={() => { setModalRec(conta); setFormRec({ valor: String(conta.valor_previsto - conta.valor_recebido), data_recebimento: '', forma_recebimento: 'pix' }) }}
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Expansão: NFs e recebimentos */}
                  {expandidos.has(conta.id) && (
                    <TableRow key={`${conta.id}-detail`} className="bg-gray-50">
                      <TableCell colSpan={8} className="py-2 px-6">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="font-medium text-gray-600 mb-1">Notas Fiscais</p>
                            {(conta.notas_fiscais ?? []).length === 0 ? (
                              <p className="text-gray-400">Nenhuma NF registrada</p>
                            ) : conta.notas_fiscais!.map(nf => (
                              <div key={nf.id} className="text-gray-600">
                                NF {nf.numero_nf ?? '—'} · {formatarMoeda(nf.valor_nf ?? 0)} · {new Date(nf.data_emissao).toLocaleDateString('pt-BR')}
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="font-medium text-gray-600 mb-1">Recebimentos</p>
                            {(conta.recebimentos ?? []).length === 0 ? (
                              <p className="text-gray-400">Nenhum recebimento</p>
                            ) : conta.recebimentos!.map(r => (
                              <div key={r.id} className="text-gray-600">
                                {formatarMoeda(r.valor)} · {new Date(r.data_recebimento).toLocaleDateString('pt-BR')} · {r.forma_recebimento ?? '—'}
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal NF */}
      <Dialog open={!!modalNF} onOpenChange={() => setModalNF(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Registrar Nota Fiscal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Número da NF</Label>
              <Input value={formNF.numero_nf} onChange={e => setFormNF(p => ({ ...p, numero_nf: e.target.value }))} placeholder="Ex: 12345" />
            </div>
            <div className="space-y-1">
              <Label>Valor da NF</Label>
              <Input type="number" step="0.01" value={formNF.valor_nf} onChange={e => setFormNF(p => ({ ...p, valor_nf: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Data de Emissão *</Label>
              <Input type="date" value={formNF.data_emissao} onChange={e => setFormNF(p => ({ ...p, data_emissao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNF(null)}>Cancelar</Button>
            <Button
              disabled={!formNF.data_emissao || adicionarNF.isPending}
              onClick={() => {
                if (!modalNF) return
                adicionarNF.mutate({
                  conta_receber_id: modalNF.id,
                  numero_nf: formNF.numero_nf || null,
                  valor_nf: parseFloat(formNF.valor_nf) || null,
                  data_emissao: formNF.data_emissao,
                  data_recebimento: null,
                  arquivo_url: null,
                  observacoes: null,
                }, { onSuccess: () => setModalNF(null) })
              }}
            >
              Registrar NF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Recebimento */}
      <Dialog open={!!modalRec} onOpenChange={() => setModalRec(null)}>
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
              <Input type="number" step="0.01" value={formRec.valor} onChange={e => setFormRec(p => ({ ...p, valor: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Data do Recebimento *</Label>
              <Input type="date" value={formRec.data_recebimento} onChange={e => setFormRec(p => ({ ...p, data_recebimento: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Forma</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formRec.forma_recebimento}
                onChange={e => setFormRec(p => ({ ...p, forma_recebimento: e.target.value }))}
              >
                <option value="pix">PIX</option>
                <option value="transferencia">Transferência</option>
                <option value="boleto">Boleto</option>
                <option value="outros">Outros</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRec(null)}>Cancelar</Button>
            <Button
              disabled={!formRec.valor || !formRec.data_recebimento || adicionarRecebimento.isPending}
              onClick={() => {
                if (!modalRec) return
                adicionarRecebimento.mutate({
                  conta_receber_id: modalRec.id,
                  valor: parseFloat(formRec.valor),
                  data_recebimento: formRec.data_recebimento,
                  banco_conta_id: null,
                  forma_recebimento: formRec.forma_recebimento as 'pix' | 'transferencia' | 'boleto' | 'outros',
                  comprovante_url: null,
                  observacoes: null,
                }, { onSuccess: () => setModalRec(null) })
              }}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
