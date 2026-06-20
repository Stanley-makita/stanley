'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { useFolha, useAtualizarFolhaItem, useMarcarItemPago, useFecharFolha } from '@/hooks/financeiro/useFolha'
import { type FinFolhaItem } from '@/types/financeiro'
import { formatarMoeda } from '@/lib/utils'

interface Props {
  fechamento_id: string
  travado: boolean
}

export function VisaoFolha({ fechamento_id, travado }: Props) {
  const { data: folha, isLoading } = useFolha(fechamento_id)
  const atualizar = useAtualizarFolhaItem()
  const marcarPago = useMarcarItemPago()
  const fecharFolha = useFecharFolha()

  const [modalEditar, setModalEditar] = useState<FinFolhaItem | null>(null)
  const [modalPagar, setModalPagar] = useState<FinFolhaItem | null>(null)
  const [form, setForm] = useState<Partial<FinFolhaItem>>({})
  const [dataPagamento, setDataPagamento] = useState('')

  const itens = folha?.itens ?? []

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
  }

  if (!folha) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-3">Folha não gerada ainda.</p>
        <p className="text-sm text-gray-400">Use "Gerar Folha" na aba Fechamento.</p>
      </div>
    )
  }

  const abrirEditar = (item: FinFolhaItem) => {
    setModalEditar(item)
    setForm({
      vale_transporte: item.vale_transporte,
      vale_alimentacao: item.vale_alimentacao,
      unimed: item.unimed,
      ferias: item.ferias,
      decimo_terceiro: item.decimo_terceiro,
      descontos: item.descontos,
      outros_creditos: item.outros_creditos,
      outros_debitos: item.outros_debitos,
      observacoes: item.observacoes ?? undefined,
    })
  }

  return (
    <div className="space-y-4">
      {/* Totais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Total salários</p>
          <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(folha.total_salarios)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Benefícios</p>
          <p className="text-lg font-semibold text-blue-700">{formatarMoeda(folha.total_beneficios)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Comissões</p>
          <p className="text-lg font-semibold text-purple-700">{formatarMoeda(folha.total_comissoes)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Líquido total</p>
          <p className="text-lg font-semibold text-green-700">{formatarMoeda(folha.total_liquido)}</p>
        </div>
      </div>

      {/* Status da folha */}
      <div className="flex items-center justify-between">
        <Badge className={folha.status === 'paga' ? 'bg-green-100 text-green-700' : folha.status === 'fechada' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}>
          Folha: {folha.status}
        </Badge>
        {!travado && folha.status === 'rascunho' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => fecharFolha.mutate(folha.id)}
            disabled={fecharFolha.isPending}
          >
            Fechar Folha
          </Button>
        )}
      </div>

      {/* Tabela por funcionário */}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Funcionário</TableHead>
              <TableHead className="text-xs text-right">Salário</TableHead>
              <TableHead className="text-xs text-right">Com. Comercial</TableHead>
              <TableHead className="text-xs text-right">Com. Contratos</TableHead>
              <TableHead className="text-xs text-right">Benefícios</TableHead>
              <TableHead className="text-xs text-right">Descontos</TableHead>
              <TableHead className="text-xs text-right font-semibold">Líquido</TableHead>
              <TableHead className="text-xs">Pgto</TableHead>
              {!travado && <TableHead className="text-xs w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-gray-400 text-sm">
                  Nenhum funcionário na folha.
                </TableCell>
              </TableRow>
            ) : (
              itens.map(item => (
                <TableRow key={item.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="text-sm font-medium">{item.funcionario?.nome}</div>
                    {item.funcionario?.cargo && (
                      <div className="text-xs text-gray-500">{item.funcionario.cargo.nome}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatarMoeda(item.salario_base)}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatarMoeda(item.comissao_comercial)}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatarMoeda(item.comissao_contratos)}</TableCell>
                  <TableCell className="text-right text-sm font-mono text-blue-700">
                    {formatarMoeda(item.vale_transporte + item.vale_alimentacao + item.unimed + item.outros_creditos)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono text-red-500">
                    {formatarMoeda(item.descontos + item.outros_debitos)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold font-mono">
                    {formatarMoeda(item.total_liquido)}
                  </TableCell>
                  <TableCell>
                    <Badge className={item.status_pagamento === 'pago' ? 'bg-green-100 text-green-700 text-xs' : 'bg-yellow-100 text-yellow-700 text-xs'}>
                      {item.status_pagamento}
                    </Badge>
                  </TableCell>
                  {!travado && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Editar"
                          onClick={() => abrirEditar(item)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {item.status_pagamento !== 'pago' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600"
                            title="Marcar pago"
                            onClick={() => { setModalPagar(item); setDataPagamento('') }}
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

      {/* Modal Editar Item */}
      <Dialog open={!!modalEditar} onOpenChange={() => setModalEditar(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar — {modalEditar?.funcionario?.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[
              ['vale_transporte', 'Vale Transporte'],
              ['vale_alimentacao', 'Vale Alimentação'],
              ['unimed', 'Unimed'],
              ['ferias', 'Férias'],
              ['decimo_terceiro', '13º Salário'],
              ['descontos', 'Descontos (INSS/IR)'],
              ['outros_creditos', 'Outros Créditos'],
              ['outros_debitos', 'Outros Débitos'],
            ].map(([campo, label]) => (
              <div key={campo} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(form[campo as keyof FinFolhaItem] ?? 0)}
                  onChange={e => setForm(p => ({ ...p, [campo]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEditar(null)}>Cancelar</Button>
            <Button
              disabled={atualizar.isPending}
              onClick={() => {
                if (!modalEditar) return
                const { id } = modalEditar
                const beneficios = (form.vale_transporte ?? 0) + (form.vale_alimentacao ?? 0) + (form.unimed ?? 0) + (form.ferias ?? 0) + (form.decimo_terceiro ?? 0) + (form.outros_creditos ?? 0)
                const debitos = (form.descontos ?? 0) + (form.outros_debitos ?? 0)
                const total_liquido = modalEditar.salario_base + modalEditar.comissao_comercial + modalEditar.comissao_contratos + beneficios - debitos
                atualizar.mutate({ id, ...form, total_liquido }, { onSuccess: () => setModalEditar(null) })
              }}
            >
              {atualizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Pagar */}
      <Dialog open={!!modalPagar} onOpenChange={() => setModalPagar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como pago — {modalPagar?.funcionario?.nome}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-gray-600">Líquido: <strong>{modalPagar ? formatarMoeda(modalPagar.total_liquido) : ''}</strong></p>
            <div className="space-y-1">
              <Label>Data do Pagamento *</Label>
              <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalPagar(null)}>Cancelar</Button>
            <Button
              disabled={!dataPagamento || marcarPago.isPending}
              onClick={() => {
                if (!modalPagar) return
                marcarPago.mutate(
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
