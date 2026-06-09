'use client'

import { useState } from 'react'
import { fmtData } from '@/lib/utils'
import { useComissoes, useAtualizarComissao } from '@/hooks/financeiro/useComissoes'
import { StatusComissaoBadge } from '../StatusComissaoBadge'
import { type StatusComissao } from '@/types/financeiro'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, DollarSign, X } from 'lucide-react'

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const STATUS_FILTROS: { label: string; value: StatusComissao | 'todos' }[] = [
  { label: 'Todas', value: 'todos' },
  { label: 'A Receber', value: 'a_receber' },
  { label: 'Recebidas', value: 'recebido' },
]

interface Props { mes: number; ano: number }

export function VisaoComissoes({ mes, ano }: Props) {
  const [statusFiltro, setStatusFiltro] = useState<StatusComissao | 'todos'>('todos')
  const { data: comissoes = [], isLoading } = useComissoes({ mes, ano, status: statusFiltro })
  const atualizar = useAtualizarComissao()

  const totalAReceber = comissoes.filter((c) => c.status === 'a_receber').reduce((s, c) => s + c.valor_bruto, 0)
  const totalRecebido = comissoes.filter((c) => c.status === 'recebido').reduce((s, c) => s + c.valor_bruto, 0)

  return (
    <div className="space-y-4">
      {/* Mini KPIs da visão */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">A Receber</p>
          <p className="text-lg font-bold text-amber-700">{fmtMoeda(totalAReceber)}</p>
          <p className="text-xs text-gray-400">{comissoes.filter((c) => c.status === 'a_receber').length} comissões</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">Recebidas no mês</p>
          <p className="text-lg font-bold text-green-700">{fmtMoeda(totalRecebido)}</p>
          <p className="text-xs text-gray-400">{comissoes.filter((c) => c.status === 'recebido').length} comissões</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {STATUS_FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFiltro(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFiltro === f.value ? 'bg-[#253B29] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />)}</div>
        ) : comissoes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma comissão encontrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#253B29]">
                  {['Processo','Banco','Comercial','Emissão','Bruto','Empresa','Comercial (R$)','Status',''].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-white px-4 py-2.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comissoes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[#253B29] text-xs">{c.processo?.numero_processo ?? '—'}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[140px]">{c.processo?.nome_imovel ?? '—'}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.processo?.banco && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.processo.banco.cor ?? '#94a3b8' }} />
                          <span className="text-xs whitespace-nowrap">{c.processo.banco.nome}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{c.comercial?.nome ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {fmtData(c.data_emissao)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[#253B29] whitespace-nowrap">{fmtMoeda(c.valor_bruto)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtMoeda(c.valor_empresa)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtMoeda(c.valor_comercial)}</td>
                    <td className="px-4 py-2.5"><StatusComissaoBadge status={c.status} /></td>
                    <td className="px-4 py-2.5">
                      {c.status === 'a_receber' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="gap-2 text-green-700"
                              onClick={() => atualizar.mutate({
                                id: c.id,
                                status: 'recebido',
                                data_recebimento: new Date().toISOString().slice(0, 10),
                              })}
                            >
                              <DollarSign className="h-3.5 w-3.5" /> Marcar como recebida
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-gray-500"
                              onClick={() => atualizar.mutate({ id: c.id, status: 'cancelado' })}
                            >
                              <X className="h-3.5 w-3.5" /> Cancelar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}