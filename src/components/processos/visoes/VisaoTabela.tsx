'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
import { Download, Search, ChevronDown, Filter, X } from 'lucide-react'
import { type StatusProcesso, type Processo } from '@/types/processos'

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

const EXTRACTORS: Record<string, (p: Processo) => string> = {
  Operacional:  (p) => p.operacional?.nome ?? '',
  Cliente:      (p) => p.compradores?.find(c => c.principal)?.nome ?? p.compradores?.[0]?.nome ?? '',
  Modalidade:   (p) => p.modalidade,
  Proposta:     (p) => p.numero_proposta ?? '',
  Banco:        (p) => p.banco?.nome ?? '',
  Comercial:    (p) => p.comercial?.nome ?? '',
  Status:       (p) => p.status_emissao === 'emitido' ? 'Emitido' : 'Não Emitido',
  Chance:       (p) => p.chance_emissao === 'certeza' ? 'Certeza' : 'Incerteza',
  Assessoria:   (p) => p.tem_assessoria ? 'Sim' : 'Não',
  Corretor:     (p) => (p.corretores?.find(c => c.principal) ?? p.corretores?.[0])?.nome ?? '',
  Imobiliária:  (p) => (p as any).imobiliaria?.nome ?? '',
}

function getUniqueValues(col: string, processos: Processo[]): string[] {
  const ext = EXTRACTORS[col]
  if (!ext) return []
  const set = new Set(processos.map(ext).filter(Boolean))
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

type DropdownPos = { top: number; left: number }

function FilterHead({
  col, colFilters, setColFilters, openFilter, setOpenFilter, dropdownPos, setDropdownPos, allProcessos, children,
}: {
  col: string
  colFilters: Record<string, string>
  setColFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>
  openFilter: string | null
  setOpenFilter: (col: string | null) => void
  dropdownPos: DropdownPos | null
  setDropdownPos: (pos: DropdownPos | null) => void
  allProcessos: Processo[]
  children: React.ReactNode
}) {
  const isActive = !!colFilters[col]
  const isOpen = openFilter === col
  const btnRef = useRef<HTMLButtonElement>(null)
  const unique = useMemo(() => getUniqueValues(col, allProcessos), [col, allProcessos])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (isOpen) {
      setOpenFilter(null)
      setDropdownPos(null)
    } else {
      const rect = btnRef.current?.getBoundingClientRect()
      if (rect) setDropdownPos({ top: rect.bottom + 4, left: rect.left })
      setOpenFilter(col)
    }
  }

  function select(val: string) {
    setColFilters(prev => ({ ...prev, [col]: val }))
    setOpenFilter(null)
    setDropdownPos(null)
  }

  function clearFilter(e: React.MouseEvent) {
    e.stopPropagation()
    setColFilters(prev => ({ ...prev, [col]: '' }))
  }

  return (
    <TableHead style={{ color: 'white' }} className="text-xs font-medium whitespace-nowrap">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={`flex items-center gap-1 transition-colors ${isActive ? 'text-[#C2AA6A]' : 'text-white hover:text-[#C2AA6A]'}`}
      >
        {isActive && <Filter className="h-3 w-3 shrink-0" />}
        <span className="max-w-[120px] truncate">{isActive ? colFilters[col] : children}</span>
        {isActive
          ? <X className="h-3 w-3 shrink-0 ml-0.5" onClick={clearFilter} />
          : <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        }
      </button>

      {/* Dropdown renderizado via portal para não afetar o layout da tabela */}
      {isOpen && dropdownPos && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          className="min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              onClick={() => select('')}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${!colFilters[col] ? 'text-[#253B29] font-semibold' : 'text-gray-500'}`}
            >
              Todos
            </button>
            {unique.length === 0
              ? <p className="px-3 py-2 text-xs text-gray-400">Sem opções</p>
              : unique.map(val => (
                <button
                  key={val}
                  onClick={() => select(val)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[#E7E0C4]/40 transition-colors ${
                    colFilters[col] === val ? 'text-[#253B29] font-semibold bg-[#E7E0C4]/30' : 'text-gray-700'
                  }`}
                >
                  {val || '—'}
                </button>
              ))
            }
          </div>
        </div>,
        document.body
      )}
    </TableHead>
  )
}

function StaticHead({ children }: { children: React.ReactNode }) {
  return (
    <TableHead style={{ color: 'white' }} className="text-xs font-medium whitespace-nowrap">
      {children}
    </TableHead>
  )
}

interface Props {
  produtoFixo?: ProdutoFiltro
}

export function VisaoTabela({ produtoFixo }: Props) {
  const router = useRouter()
  const { usuario } = useAuth()

  const [statusFiltro, setStatusFiltro] = useState<StatusProcesso | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null)

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    if (!openFilter) return
    function handleClick() { setOpenFilter(null); setDropdownPos(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openFilter])

  const { data: processos = [], isLoading } = useProcessos({
    status: statusFiltro,
    produto: produtoFixo ?? 'todos',
    chance: 'todos',
    busca,
  })

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const filteredProcessos = useMemo(() => {
    return processos.filter(p =>
      Object.entries(colFilters).every(([col, val]) => {
        if (!val) return true
        const ext = EXTRACTORS[col]
        return ext ? ext(p) === val : true
      })
    )
  }, [processos, colFilters])

  const contagemStatus = processos.reduce((acc, p) => {
    acc[p.status_processo] = (acc[p.status_processo] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const activeFilters = Object.entries(colFilters).filter(([, v]) => !!v)
  const totalColunas = 14 + (isGestor ? 2 : 0)

  const filterProps = { colFilters, setColFilters, openFilter, setOpenFilter, dropdownPos, setDropdownPos, allProcessos: processos }

  return (
    <div className="space-y-3">
      {/* Barra de filtros */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          { label: 'Todos',      value: 'todos'      as const },
          { label: 'Em Análise', value: 'em_analise' as const },
          { label: 'Aprovados',  value: 'aprovado'   as const },
          { label: 'Pendentes',  value: 'pendente'   as const },
          { label: 'Reprovados', value: 'reprovado'  as const },
        ]).map((f) => {
          const count = f.value === 'todos' ? processos.length : (contagemStatus[f.value] ?? 0)
          return (
            <button
              key={f.value}
              onClick={() => setStatusFiltro(f.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFiltro === f.value ? 'bg-[#253B29] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}{count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}

        <span className="h-4 w-px bg-gray-300 mx-0.5 shrink-0" />

        <div className="relative min-w-[160px] max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Buscar por cliente, CPF..."
            className="pl-8 h-7 text-xs"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {activeFilters.map(([col, val]) => (
          <span key={col} className="flex items-center gap-1 px-2 py-0.5 bg-[#E7E0C4] text-[#253B29] text-xs rounded-full border border-[#C2AA6A]">
            <span className="opacity-60">{col}:</span> {val}
            <button onClick={() => setColFilters(prev => ({ ...prev, [col]: '' }))} className="ml-0.5 hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {activeFilters.length > 1 && (
          <button onClick={() => setColFilters({})} className="text-xs text-gray-400 hover:text-red-500 transition-colors px-1">
            Limpar tudo
          </button>
        )}

        <Button variant="outline" size="sm" className="gap-1.5 text-gray-600 h-7 text-xs ml-auto">
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </div>

      {activeFilters.length > 0 && (
        <p className="text-xs text-gray-500">
          Mostrando <strong>{filteredProcessos.length}</strong> de {processos.length} processos
        </p>
      )}

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow style={{ backgroundColor: '#253B29' }} className="hover:bg-[#253B29]">
                <FilterHead col="Operacional" {...filterProps}>Operacional</FilterHead>
                <FilterHead col="Cliente"     {...filterProps}>Cliente</FilterHead>
                <StaticHead>CPF</StaticHead>
                <FilterHead col="Modalidade"  {...filterProps}>Modalidade</FilterHead>
                <FilterHead col="Proposta"    {...filterProps}>Proposta</FilterHead>
                <StaticHead>Valor Financiado</StaticHead>
                <FilterHead col="Banco"       {...filterProps}>Banco</FilterHead>
                <FilterHead col="Comercial"   {...filterProps}>Comercial</FilterHead>
                <StaticHead>Entrada</StaticHead>
                <FilterHead col="Status"       {...filterProps}>Status</FilterHead>
                <FilterHead col="Chance"       {...filterProps}>Chance</FilterHead>
                <FilterHead col="Assessoria"   {...filterProps}>Assessoria</FilterHead>
                <FilterHead col="Corretor"     {...filterProps}>Corretor</FilterHead>
                <FilterHead col="Imobiliária"  {...filterProps}>Imobiliária</FilterHead>
                {isGestor && (
                  <>
                    <StaticHead>Comissão Comercial</StaticHead>
                    <StaticHead>Comissão Empresa</StaticHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={totalColunas} className="text-center py-8 text-gray-400">Carregando...</TableCell>
                </TableRow>
              ) : filteredProcessos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={totalColunas} className="text-center py-8 text-gray-400">Nenhum processo encontrado.</TableCell>
                </TableRow>
              ) : (
                filteredProcessos.map((p) => {
                  const comprador = p.compradores?.find(c => c.principal) ?? p.compradores?.[0] ?? null
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-[#E7E0C4]/30 transition-colors"
                      onClick={() => router.push(`/processos/${p.id}`)}
                    >
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">{p.operacional?.nome ?? '—'}</TableCell>
                      <TableCell className="text-sm font-medium text-[#253B29] whitespace-nowrap max-w-[160px] truncate">{comprador?.nome ?? '—'}</TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap font-mono text-xs">{formatarCpf(comprador?.cpf ?? null)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs whitespace-nowrap">{p.modalidade}</Badge></TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">{p.numero_proposta ?? '—'}</TableCell>
                      <TableCell className="text-sm font-medium whitespace-nowrap">{formatarMoeda(p.valor_financiado)}</TableCell>
                      <TableCell>
                        {p.banco
                          ? <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full shrink-0 bg-gray-400" /><span className="text-xs whitespace-nowrap">{p.banco.nome}</span></div>
                          : <span className="text-gray-400 text-sm">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">{p.comercial?.nome ?? '—'}</TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">{p.data_inicio ? new Date(p.data_inicio).toLocaleDateString('pt-BR') : '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.status_emissao === 'emitido' ? 'text-xs bg-green-50 text-green-700 border-green-200 whitespace-nowrap' : 'text-xs bg-gray-50 text-gray-500 border-gray-200 whitespace-nowrap'}>
                          {p.status_emissao === 'emitido' ? 'Emitido' : 'Não Emitido'}
                        </Badge>
                      </TableCell>
                      <TableCell><ChanceBadge chance={p.chance_emissao} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.tem_assessoria ? 'text-xs bg-[#E7E0C4] text-[#253B29] border-[#C2AA6A]' : 'text-xs bg-gray-50 text-gray-400'}>
                          {p.tem_assessoria ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                        {(p.corretores?.find(c => c.principal) ?? p.corretores?.[0])?.nome ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                        {(p as any).imobiliaria?.nome ?? '—'}
                      </TableCell>
                      {isGestor && (
                        <>
                          <TableCell className="text-sm whitespace-nowrap">
                            {p.comissao_comercial != null ? <span className="text-[#253B29] font-medium">{p.comissao_comercial}%</span> : <span className="text-gray-400">—</span>}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {p.comissao_empresa != null ? <span className="text-[#C2AA6A] font-medium">{p.comissao_empresa}%</span> : <span className="text-gray-400">—</span>}
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
