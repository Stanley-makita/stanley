'use client'

import { useState } from 'react'
import { useProcessos, type ProdutoFiltro } from '@/hooks/processos/useProcessos'
import { useAuth } from '@/hooks/auth/useAuth'
import { ChanceBadge } from '../ChanceBadge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { Download, Search } from 'lucide-react'
import { type StatusProcesso } from '@/types/processos'

const FILTROS_STATUS: { label: string; value: StatusProcesso | 'todos' }[] = [
  { label: 'Todos',      value: 'todos' },
  { label: 'Em Análise', value: 'em_analise' },
  { label: 'Aprovados',  value: 'aprovado' },
  { label: 'Pendentes',  value: 'pendente' },
  { label: 'Reprovados', value: 'reprovado' },
]

const FILTROS_PRODUTO: { label: string; value: ProdutoFiltro }[] = [
  { label: 'Financiamento', value: 'financiamento' },
  { label: 'Consórcio',     value: 'consorcio' },
  { label: 'CGI',           value: 'cgi' },
  { label: 'Contrato',      value: 'contrato' },
]

const FILTROS_CHANCE = [
  { label: 'Certeza',   value: 'certeza'   as const },
  { label: 'Incerteza', value: 'incerteza' as const },
]

const FINANCIAMENTO_MODS = new Set(['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista'])

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

  const [statusFiltro, setStatusFiltro] = useState<StatusProcesso | 'todos'>('todos')
  const [produtoFiltro, setProdutoFiltro] = useState<ProdutoFiltro>('todos')
  const [chanceFiltro, setChanceFiltro] = useState<'certeza' | 'incerteza' | 'todos'>('todos')
  const [busca, setBusca] = useState('')

  const { data: processos = [], isLoading } = useProcessos({
    status: statusFiltro,
    produto: produtoFiltro,
    chance: chanceFiltro,
    busca,
  })

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const contagemStatus = processos.reduce((acc, p) => {
    acc[p.status_processo] = (acc[p.status_processo] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const contagemProduto = processos.reduce((acc, p) => {
    const mod = p.modalidade
    if (FINANCIAMENTO_MODS.has(mod)) acc.financiamento = (acc.financiamento ?? 0) + 1
    else if (mod === 'Consorcio') acc.consorcio = (acc.consorcio ?? 0) + 1
    else if (mod === 'CGI')       acc.cgi        = (acc.cgi        ?? 0) + 1
    else if (mod === 'Contrato')  acc.contrato   = (acc.contrato   ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const contagemChance = processos.reduce((acc, p) => {
    acc[p.chance_emissao] = (acc[p.chance_emissao] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const colunas = [
    'Operacional', 'Cliente', 'CPF', 'Modalidade', 'Proposta',
    'Valor Financiado', 'Banco', 'Comercial', 'Entrada',
    'Status', 'Chance', 'Assessoria',
    ...(isGestor ? ['Comissão Comercial', 'Comissão Empresa'] : []),
  ]

  return (
    <div className="space-y-3">
      {/* Filtros em linha única + exportar */}
      <div className="flex items-center gap-1.5 flex-wrap">

        {/* Status */}
        {FILTROS_STATUS.map((f) => {
          const count = f.value === 'todos' ? processos.length : (contagemStatus[f.value] ?? 0)
          return (
            <button
              key={f.value}
              onClick={() => setStatusFiltro(f.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFiltro === f.value
                  ? 'bg-[#253B29] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}{count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}

        <span className="h-4 w-px bg-gray-300 mx-0.5 shrink-0" />

        {/* Produto */}
        {FILTROS_PRODUTO.map((f) => {
          const count = contagemProduto[f.value] ?? 0
          return (
            <button
              key={f.value}
              onClick={() => setProdutoFiltro(produtoFiltro === f.value ? 'todos' : f.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                produtoFiltro === f.value
                  ? 'bg-[#C2AA6A] text-[#253B29]'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {f.label}{count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}

        <span className="h-4 w-px bg-gray-300 mx-0.5 shrink-0" />

        {/* Chance */}
        {FILTROS_CHANCE.map((f) => {
          const count = contagemChance[f.value] ?? 0
          return (
            <button
              key={f.value}
              onClick={() => setChanceFiltro(chanceFiltro === f.value ? 'todos' : f.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                chanceFiltro === f.value
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              {f.label}{count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}

        <span className="h-4 w-px bg-gray-300 mx-0.5 shrink-0" />

        {/* Busca */}
        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Buscar por cliente, CPF ou proposta..."
            className="pl-8 h-7 text-xs"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {/* Exportar */}
        <Button variant="outline" size="sm" className="gap-1.5 text-gray-600 h-7 text-xs ml-auto">
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
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
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                        {p.operacional?.nome ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-[#253B29] whitespace-nowrap max-w-[160px] truncate">
                        {comprador?.nome ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap font-mono text-xs">
                        {formatarCpf(comprador?.cpf ?? null)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {p.modalidade}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                        {p.numero_proposta ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm font-medium whitespace-nowrap">
                        {formatarMoeda(p.valor_financiado)}
                      </TableCell>
                      <TableCell>
                        {p.banco ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
                            <span className="text-xs whitespace-nowrap">{p.banco.nome}</span>
                          </div>
                        ) : <span className="text-gray-400 text-sm">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                        {p.comercial?.nome ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                        {p.data_inicio
                          ? new Date(p.data_inicio).toLocaleDateString('pt-BR')
                          : '—'}
                      </TableCell>
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
                      <TableCell>
                        <ChanceBadge chance={p.chance_emissao} />
                      </TableCell>
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
