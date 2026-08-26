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
import { FileText, Plus, DollarSign, ChevronDown, ChevronRight, Printer, Search } from 'lucide-react'
import {
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
  contas: FinContaReceber[]
  isLoading: boolean
  travado: boolean
}

export function VisaoAReceber({ contas, isLoading, travado }: Props) {
  const adicionarNF = useAdicionarNotaFiscal()
  const adicionarRecebimento = useAdicionarRecebimento()

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [modalNF, setModalNF] = useState<FinContaReceber | null>(null)
  const [modalRec, setModalRec] = useState<FinContaReceber | null>(null)

  const [formNF, setFormNF] = useState({ numero_nf: '', valor_nf: '', data_emissao: '' })
  const [formRec, setFormRec] = useState({ valor: '', data_recebimento: '', forma_recebimento: 'pix' })

  const [filtroBanco, setFiltroBanco] = useState('todos')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [agrupamento, setAgrupamento] = useState<'banco' | 'cliente'>('banco')

  const toggleExpandido = (id: string) =>
    setExpandidos(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })

  const bancosDisponiveis = Array.from(
    new Map(
      contas
        .filter(c => c.banco_id && c.banco)
        .map(c => [c.banco_id as string, c.banco!.nome])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))

  const contasFiltradas = contas.filter(c =>
    (filtroBanco === 'todos' || c.banco_id === filtroBanco) &&
    (!buscaCliente || c.cliente_nome?.toLowerCase().includes(buscaCliente.toLowerCase()))
  )

  const totalPrevisto = contasFiltradas.reduce((s, c) => s + c.valor_previsto, 0)
  const totalRecebido = contasFiltradas.reduce((s, c) => s + c.valor_recebido, 0)

  const grupos = agruparContas(contasFiltradas, agrupamento)

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

      {/* Filtros + Relatório */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-56"
            value={filtroBanco}
            onChange={e => setFiltroBanco(e.target.value)}
          >
            <option value="todos">Todos os bancos</option>
            {bancosDisponiveis.map(([id, nome]) => (
              <option key={id} value={id}>{nome}</option>
            ))}
          </select>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Buscar por cliente..."
              value={buscaCliente}
              onChange={e => setBuscaCliente(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-input bg-background px-2 py-2 text-xs"
            value={agrupamento}
            onChange={e => setAgrupamento(e.target.value as 'banco' | 'cliente')}
            title="Agrupar relatório por"
          >
            <option value="banco">Agrupar por banco</option>
            <option value="cliente">Agrupar por cliente</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => window.print()}
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir relatório
          </Button>
        </div>
      </div>

      {/* Relatório (só aparece na impressão / "Salvar como PDF") */}
      <div className="print-area hidden print:block">
        <h2 className="text-lg font-bold mb-1">Contas a Receber {agrupamento === 'banco' ? 'por Banco' : 'por Cliente'}</h2>
        {filtroBanco !== 'todos' && (
          <p className="text-sm text-gray-600 mb-1">Banco: {bancosDisponiveis.find(([id]) => id === filtroBanco)?.[1]}</p>
        )}
        {buscaCliente && <p className="text-sm text-gray-600 mb-1">Cliente: {buscaCliente}</p>}
        <p className="text-xs text-gray-500 mb-4">Gerado em {new Date().toLocaleString('pt-BR')}</p>

        {grupos.map(grupo => (
          <div key={grupo.chave} className="mb-4 break-inside-avoid">
            <h3 className="text-sm font-semibold border-b border-gray-300 pb-1 mb-1">{grupo.titulo}</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2">Cliente</th>
                  <th className="py-1 pr-2">Banco</th>
                  <th className="py-1 pr-2">Origem</th>
                  <th className="py-1 pr-2 text-right">Previsto</th>
                  <th className="py-1 text-right">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {grupo.contas.map(c => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-1 pr-2">{c.cliente_nome ?? '—'}</td>
                    <td className="py-1 pr-2">{c.banco?.nome ?? '—'}</td>
                    <td className="py-1 pr-2 capitalize">{c.origem}</td>
                    <td className="py-1 pr-2 text-right font-mono">{formatarMoeda(c.valor_previsto)}</td>
                    <td className="py-1 text-right font-mono">{formatarMoeda(c.valor_recebido)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={3} className="py-1 pr-2 text-right">Subtotal</td>
                  <td className="py-1 pr-2 text-right font-mono">{formatarMoeda(grupo.previsto)}</td>
                  <td className="py-1 text-right font-mono">{formatarMoeda(grupo.recebido)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        <div className="mt-4 pt-2 border-t-2 border-gray-800 flex justify-between text-sm font-bold">
          <span>Total geral</span>
          <span>{formatarMoeda(totalPrevisto)} previsto · {formatarMoeda(totalRecebido)} recebido</span>
        </div>
      </div>

      {/* Tabela */}
      <div className="print:hidden rounded-lg border bg-white overflow-x-auto">
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
            ) : contasFiltradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                  {contas.length === 0 ? 'Nenhuma conta a receber para o período.' : 'Nenhum resultado para o filtro.'}
                </TableCell>
              </TableRow>
            ) : (
              contasFiltradas.map(conta => (
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

interface GrupoContas {
  chave: string
  titulo: string
  contas: FinContaReceber[]
  previsto: number
  recebido: number
}

function agruparContas(contas: FinContaReceber[], por: 'banco' | 'cliente'): GrupoContas[] {
  const mapa = new Map<string, GrupoContas>()
  for (const c of contas) {
    const chave = por === 'banco' ? (c.banco_id ?? '__sem_banco__') : (c.cliente_nome ?? '__sem_cliente__')
    const titulo = por === 'banco' ? (c.banco?.nome ?? 'Sem banco') : (c.cliente_nome ?? 'Sem cliente')
    let grupo = mapa.get(chave)
    if (!grupo) {
      grupo = { chave, titulo, contas: [], previsto: 0, recebido: 0 }
      mapa.set(chave, grupo)
    }
    grupo.contas.push(c)
    grupo.previsto += c.valor_previsto
    grupo.recebido += c.valor_recebido
  }
  return Array.from(mapa.values()).sort((a, b) => a.titulo.localeCompare(b.titulo))
}
