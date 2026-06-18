'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, UserCheck, UserX } from 'lucide-react'
import { useFechamentoProcessos } from '@/hooks/financeiro/useFechamentoProcessos'
import { formatarMoeda } from '@/lib/utils'

interface Props {
  fechamento_id: string
  travado: boolean
}

export function VisaoEmissoes({ fechamento_id, travado }: Props) {
  const [busca, setBusca] = useState('')
  const { data: processos = [], isLoading } = useFechamentoProcessos(fechamento_id)

  const filtrados = processos.filter(p =>
    !busca ||
    p.cliente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    p.modalidade?.toLowerCase().includes(busca.toLowerCase()) ||
    p.banco?.nome?.toLowerCase().includes(busca.toLowerCase())
  )

  const totalEmitido = processos.reduce((s, p) => s + (p.valor_financiado ?? 0), 0)
  const semComercial = processos.filter(p => !p.comercial_id).length

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Total emitido</p>
          <p className="text-lg font-semibold text-[#253B29]">{formatarMoeda(totalEmitido)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Processos</p>
          <p className="text-lg font-semibold text-[#253B29]">{processos.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Sem comercial</p>
          <p className={`text-lg font-semibold ${semComercial > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
            {semComercial}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Adicionados manual</p>
          <p className="text-lg font-semibold text-gray-600">{processos.filter(p => p.incluido_manual).length}</p>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Buscar por cliente, banco ou modalidade..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Banco</TableHead>
              <TableHead className="text-xs">Modalidade</TableHead>
              <TableHead className="text-xs text-right">Valor Financiado</TableHead>
              <TableHead className="text-xs">Comercial</TableHead>
              <TableHead className="text-xs">Operacional</TableHead>
              <TableHead className="text-xs">Emissão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                  {processos.length === 0
                    ? 'Nenhum processo importado. Use "Puxar Emissões" na aba Fechamento.'
                    : 'Nenhum resultado para a busca.'}
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map(proc => (
                <TableRow key={proc.id} className="hover:bg-gray-50">
                  <TableCell className="text-sm font-medium">{proc.cliente_nome ?? '—'}</TableCell>
                  <TableCell>
                    {proc.banco ? (
                      <span className="flex items-center gap-1 text-sm">
                        {proc.banco.cor && (
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: proc.banco.cor }}
                          />
                        )}
                        {proc.banco.nome}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{proc.modalidade ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {proc.valor_financiado != null ? formatarMoeda(proc.valor_financiado) : '—'}
                  </TableCell>
                  <TableCell>
                    {proc.comercial ? (
                      <span className="flex items-center gap-1 text-sm">
                        <UserCheck className="h-3.5 w-3.5 text-green-600" />
                        {proc.comercial.nome}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-orange-500">
                        <UserX className="h-3.5 w-3.5" />
                        Sem comercial
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {proc.operacional ? (
                      <span className="text-sm">{proc.operacional.nome}</span>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {proc.data_emissao
                      ? new Date(proc.data_emissao).toLocaleDateString('pt-BR')
                      : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filtrados.length > 0 && (
        <div className="flex justify-between text-xs text-gray-500 px-1">
          <span>{filtrados.length} processo(s) exibido(s)</span>
          <span>Total: {formatarMoeda(filtrados.reduce((s, p) => s + (p.valor_financiado ?? 0), 0))}</span>
        </div>
      )}
    </div>
  )
}
