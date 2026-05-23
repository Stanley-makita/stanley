'use client'

import { useState } from 'react'
import { useProcessos } from '@/hooks/processos/useProcessos'
import { useAuth } from '@/hooks/auth/useAuth'
import { ProcessoStatusBadge } from '../ProcessoStatusBadge'
import { ChanceBadge } from '../ChanceBadge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { Download, Search } from 'lucide-react'

function formatarMoeda(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function formatarCpf(cpf: string | null) {
  if (!cpf) return '—'
  const d = cpf.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
  return cpf
}

export function VisaoTabela() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [busca, setBusca] = useState('')
  const { data: processos = [], isLoading } = useProcessos({ busca })

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const colunas = [
    'Operacional', 'Cliente', 'CPF', 'Modalidade', 'Proposta',
    'Valor Financiado', 'Banco', 'Comercial', 'Entrada',
    'Status', 'Chance', 'Assessoria',
    ...(isGestor ? ['Comissão Comercial', 'Comissão Empresa'] : []),
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#253B29]">Gestão de Processos</h2>
        <Button variant="outline" size="sm" className="gap-1.5 text-gray-600">
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </div>

      {/* Busca */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por cliente, CPF ou proposta..."
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow style={{ backgroundColor: '#253B29' }} className="hover:bg-[#253B29]">
                {colunas.map((col) => (
                  <TableHead key={col} style={{ color: 'white' }} className="text-xs font-medium whitespace-nowrap">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={colunas.length} className="text-center py-8 text-gray-400">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : processos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colunas.length} className="text-center py-8 text-gray-400">
                    Nenhum processo encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                processos.map((p) => {
                  const comprador = p.compradores?.find(c => c.principal) ?? p.compradores?.[0] ?? null
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-[#E7E0C4]/30 transition-colors"
                      onClick={() => router.push(`/processos/${p.id}`)}
                    >
                      {/* Operacional */}
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                        {p.operacional?.nome ?? '—'}
                      </TableCell>

                      {/* Cliente */}
                      <TableCell className="text-sm font-medium text-[#253B29] whitespace-nowrap max-w-[160px] truncate">
                        {comprador?.nome ?? '—'}
                      </TableCell>

                      {/* CPF */}
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap font-mono text-xs">
                        {formatarCpf(comprador?.cpf ?? null)}
                      </TableCell>

                      {/* Modalidade */}
                      <TableCell>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {p.modalidade}
                        </Badge>
                      </TableCell>

                      {/* Proposta (número do banco) */}
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                        {p.numero_proposta ?? '—'}
                      </TableCell>

                      {/* Valor Financiado */}
                      <TableCell className="text-sm font-medium whitespace-nowrap">
                        {formatarMoeda(p.valor_financiado)}
                      </TableCell>

                      {/* Banco */}
                      <TableCell>
                        {p.banco ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
                            <span className="text-xs whitespace-nowrap">{p.banco.nome}</span>
                          </div>
                        ) : <span className="text-gray-400 text-sm">—</span>}
                      </TableCell>

                      {/* Comercial */}
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                        {p.comercial?.nome ?? '—'}
                      </TableCell>

                      {/* Entrada */}
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                        {p.data_inicio
                          ? new Date(p.data_inicio).toLocaleDateString('pt-BR')
                          : '—'}
                      </TableCell>

                      {/* Status emissão */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            p.status_emissao === 'emitido'
                              ? 'text-xs bg-green-50 text-green-700 border-green-200 whitespace-nowrap'
                              : 'text-xs bg-gray-50 text-gray-500 border-gray-200 whitespace-nowrap'
                          }
                        >
                          {p.status_emissao === 'emitido' ? 'Emitido' : 'Não Emitido'}
                        </Badge>
                      </TableCell>

                      {/* Chance */}
                      <TableCell>
                        <ChanceBadge chance={p.chance_emissao} />
                      </TableCell>

                      {/* Assessoria */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            p.tem_assessoria
                              ? 'text-xs bg-[#E7E0C4] text-[#253B29] border-[#C2AA6A]'
                              : 'text-xs bg-gray-50 text-gray-400'
                          }
                        >
                          {p.tem_assessoria ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>

                      {/* Comissão Comercial + Empresa — somente gestores */}
                      {isGestor && (
                        <>
                          <TableCell className="text-sm whitespace-nowrap">
                            {p.comissao_comercial != null
                              ? <span className="text-[#253B29] font-medium">{p.comissao_comercial}%</span>
                              : <span className="text-gray-400">—</span>
                            }
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {p.comissao_empresa != null
                              ? <span className="text-[#C2AA6A] font-medium">{p.comissao_empresa}%</span>
                              : <span className="text-gray-400">—</span>
                            }
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
