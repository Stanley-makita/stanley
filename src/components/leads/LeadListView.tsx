'use client'

import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Trash2, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Filter, X, Phone, Mail, CalendarDays, DollarSign, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLeadsTodos } from '@/hooks/leads/useLeads'
import { useLeadsInativos } from '@/hooks/leads/useLeadsDashboard'
import { useFases } from '@/hooks/configuracoes/useFases'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { LeadOrigemBadge } from './LeadOrigemBadge'
import { ExcluirLeadDialog } from './ExcluirLeadDialog'
import { TableShell } from '@/components/ui/table-shell'
import { type Lead, type ProdutoInteresse } from '@/types/leads'

interface Props {
  busca: string
  faseId?: string
  onFaseChange: (faseId?: string) => void
  onAbrirLead: (id: string) => void
  filtroEspecial?: 'inativos'
}

type ColKey =
  | 'nome'
  | 'contato'
  | 'fase'
  | 'status'
  | 'origem'
  | 'produto'
  | 'comercial'
  | 'operacional'
  | 'valor'
  | 'criado_em'

type SortDir = 'asc' | 'desc'

const FILTERABLE_COLS = new Set<ColKey>(['fase', 'status', 'origem', 'produto', 'comercial', 'operacional'])

const PRODUTO_LABELS: Record<ProdutoInteresse, string> = {
  financiamento: 'Financiamento',
  consorcio: 'Consórcio',
  cgi: 'CGI',
  portabilidade: 'Portabilidade',
  contrato: 'Contrato',
}

function produtoLabel(v: ProdutoInteresse | null): string {
  if (!v) return ''
  return PRODUTO_LABELS[v] ?? v
}

function fmtValor(v: number | null) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v)
}

function getColValue(lead: Lead, col: ColKey): string {
  switch (col) {
    case 'nome':         return lead.nome.toLowerCase()
    case 'contato':      return lead.telefone ?? ''
    case 'fase':         return lead.fase?.nome ?? ''
    case 'status':       return lead.perdido_em ? 'Perdido' : (lead.status?.nome ?? '')
    case 'origem':       return lead.origem ?? ''
    case 'produto':      return produtoLabel(lead.produto_interesse)
    case 'comercial':    return lead.responsavel?.nome ?? ''
    case 'operacional':  return (lead as any).responsavel_operacional?.nome ?? ''
    case 'valor':        return String(lead.valor_pretendido ?? 0)
    case 'criado_em':    return lead.created_at
    default:             return ''
  }
}

function sortLeads(leads: Lead[], col: ColKey, dir: SortDir): Lead[] {
  return [...leads].sort((a, b) => {
    const va = getColValue(a, col)
    const vb = getColValue(b, col)
    if (col === 'valor') {
      const na = Number(va)
      const nb = Number(vb)
      return dir === 'asc' ? na - nb : nb - na
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function getUniqueValues(leads: Lead[], col: ColKey): string[] {
  const values = new Set<string>()
  for (const lead of leads) {
    const val = getColValue(lead, col)
    if (val) values.add(val)
  }
  return Array.from(values).sort()
}

function applyFilters(leads: Lead[], colFilters: Record<string, string>): Lead[] {
  return leads.filter(lead =>
    Object.entries(colFilters).every(([col, val]) => {
      if (!val) return true
      return getColValue(lead, col as ColKey) === val
    })
  )
}

type DropdownPos = { top: number; left: number }

export function LeadListView({ busca, faseId, onFaseChange, onAbrirLead, filtroEspecial }: Props) {
  const { pode } = usePermissao()
  const podeExcluir = pode('leads.excluir')
  const [leadParaExcluir, setLeadParaExcluir] = useState<{ id: string; faseId: string; nome: string } | null>(null)
  const [sortCol, setSortCol] = useState<ColKey>('criado_em')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [openFilter, setOpenFilter] = useState<ColKey | null>(null)
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null)

  const isInativos = filtroEspecial === 'inativos'

  const { data: todosLeads = [], isLoading: carregandoTodos } = useLeadsTodos(undefined, isInativos ? '' : busca)
  const { data: leadsInativos = [], isLoading: carregandoInativos } = useLeadsInativos()
  const { data: fases = [] } = useFases('leads')

  const isLoading = isInativos ? carregandoInativos : carregandoTodos

  const leadsBase = isInativos
    ? leadsInativos.filter(l => !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || l.telefone?.includes(busca))
    : faseId ? todosLeads.filter(l => l.fase_id === faseId) : todosLeads

  const leadsFiltrados = applyFilters(leadsBase, colFilters)
  const leads = sortLeads(leadsFiltrados, sortCol, sortDir)

  const totalPorFase = todosLeads.reduce<Record<string, number>>((acc, l) => {
    acc[l.fase_id] = (acc[l.fase_id] ?? 0) + 1
    return acc
  }, {})

  const hasFilters = Object.values(colFilters).some(v => !!v)

  function handleSort(col: ColKey) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function clearAllFilters() {
    setColFilters({})
  }

  return (
    <div className="space-y-4">
      {/* Banner inativos */}
      {isInativos && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <span className="text-amber-700 text-xs font-medium">
            Captações sem contato há mais de 7 dias e sem tarefas agendadas — {leads.length} encontrada{leads.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Filtros por fase */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <button
          onClick={() => onFaseChange(undefined)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
            !faseId
              ? 'bg-fonti-primary text-white border-fonti-primary'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          )}
        >
          Todos {!isLoading && <span className="ml-1 opacity-70">{todosLeads.length}</span>}
        </button>

        {fases.map((f) => (
          <button
            key={f.id}
            onClick={() => onFaseChange(f.id === faseId ? undefined : f.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
              faseId === f.id
                ? 'text-white border-transparent'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            )}
            style={faseId === f.id ? { backgroundColor: f.cor ?? 'var(--fonti-primary)', borderColor: f.cor ?? 'var(--fonti-primary)' } : undefined}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.cor ?? '#94a3b8' }} />
            {f.nome}
            <span className={cn('ml-0.5', faseId === f.id ? 'opacity-80' : 'opacity-50')}>
              {totalPorFase[f.id] ?? 0}
            </span>
          </button>
        ))}

        {hasFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border border-fonti-primary/40 text-fonti-primary hover:bg-fonti-primary/5"
          >
            <X className="h-3 w-3" />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Aviso leads convertidos */}
      {leads.some(l => l.convertido_em) && (
        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          Captações com <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-medium px-1.5 py-0.5 rounded">Convertido</span> foram transformadas em processo e não aparecem no Kanban.
        </p>
      )}

      {/* Tabela */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="px-4 py-16 text-center text-gray-400">
            <p className="text-sm">
              {busca ? `Nenhuma captação encontrada para "${busca}"` : hasFilters ? 'Nenhuma captação com esses filtros.' : 'Nenhuma captação nesta fase.'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 md:hidden">
              {leads.map((lead) => (
                <LeadMobileCard
                  key={lead.id}
                  lead={lead}
                  podeExcluir={podeExcluir}
                  onClick={() => onAbrirLead(lead.id)}
                  onExcluir={() => setLeadParaExcluir({ id: lead.id, faseId: lead.fase_id, nome: lead.nome })}
                />
              ))}
            </div>

            <TableShell className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fonti-accent" style={{ backgroundColor: 'var(--fonti-accent)' }}>
                    <ColHeader label="Nome"             col="nome"        active={sortCol} dir={sortDir} onSort={handleSort} />
                    <ColHeader label="Contato"          col="contato"     active={sortCol} dir={sortDir} onSort={handleSort} />
                    <ColHeader label="Fase"             col="fase"        active={sortCol} dir={sortDir} onSort={handleSort}
                      filterable colFilters={colFilters} setColFilters={setColFilters}
                      openFilter={openFilter} setOpenFilter={setOpenFilter}
                      dropdownPos={dropdownPos} setDropdownPos={setDropdownPos}
                      allLeads={leadsBase} />
                    <ColHeader label="Status"           col="status"      active={sortCol} dir={sortDir} onSort={handleSort}
                      filterable colFilters={colFilters} setColFilters={setColFilters}
                      openFilter={openFilter} setOpenFilter={setOpenFilter}
                      dropdownPos={dropdownPos} setDropdownPos={setDropdownPos}
                      allLeads={leadsBase} />
                    <ColHeader label="Origem"           col="origem"      active={sortCol} dir={sortDir} onSort={handleSort}
                      filterable colFilters={colFilters} setColFilters={setColFilters}
                      openFilter={openFilter} setOpenFilter={setOpenFilter}
                      dropdownPos={dropdownPos} setDropdownPos={setDropdownPos}
                      allLeads={leadsBase} />
                    <ColHeader label="Produto"          col="produto"     active={sortCol} dir={sortDir} onSort={handleSort}
                      filterable colFilters={colFilters} setColFilters={setColFilters}
                      openFilter={openFilter} setOpenFilter={setOpenFilter}
                      dropdownPos={dropdownPos} setDropdownPos={setDropdownPos}
                      allLeads={leadsBase} />
                    <ColHeader label="Comercial"        col="comercial"   active={sortCol} dir={sortDir} onSort={handleSort}
                      filterable colFilters={colFilters} setColFilters={setColFilters}
                      openFilter={openFilter} setOpenFilter={setOpenFilter}
                      dropdownPos={dropdownPos} setDropdownPos={setDropdownPos}
                      allLeads={leadsBase} />
                    <ColHeader label="Operacional"      col="operacional" active={sortCol} dir={sortDir} onSort={handleSort}
                      filterable colFilters={colFilters} setColFilters={setColFilters}
                      openFilter={openFilter} setOpenFilter={setOpenFilter}
                      dropdownPos={dropdownPos} setDropdownPos={setDropdownPos}
                      allLeads={leadsBase} />
                    <ColHeader label="Valor pretendido" col="valor"       active={sortCol} dir={sortDir} onSort={handleSort} align="right" />
                    <ColHeader label="Criado em"        col="criado_em"   active={sortCol} dir={sortDir} onSort={handleSort} />
                    {podeExcluir && <th className="w-10 px-2 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      podeExcluir={podeExcluir}
                      onClick={() => onAbrirLead(lead.id)}
                      onExcluir={() => setLeadParaExcluir({ id: lead.id, faseId: lead.fase_id, nome: lead.nome })}
                    />
                  ))}
                </tbody>
              </table>
            </TableShell>
          </>
        )}
      </div>

      {podeExcluir && leadParaExcluir && (
        <ExcluirLeadDialog
          aberto={!!leadParaExcluir}
          onFechar={() => setLeadParaExcluir(null)}
          leadId={leadParaExcluir.id}
          faseId={leadParaExcluir.faseId}
          nomeCliente={leadParaExcluir.nome}
          onExcluido={() => setLeadParaExcluir(null)}
        />
      )}
    </div>
  )
}

function LeadMobileCard({
  lead,
  podeExcluir,
  onClick,
  onExcluir,
}: {
  lead: Lead
  podeExcluir: boolean
  onClick: () => void
  onExcluir: () => void
}) {
  const responsavelOp = (lead as any).responsavel_operacional as { nome: string } | null | undefined

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="block w-full cursor-pointer bg-white p-4 text-left transition-colors hover:bg-fonti-primary/[0.03] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-fonti-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-sm font-semibold leading-snug text-fonti-primary">
              {lead.nome}
            </h3>
            {lead.convertido_em && (
              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-600">
                Convertido
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {lead.fase && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: lead.fase.cor ?? '#94a3b8' }} />
                {lead.fase.nome}
              </span>
            )}
            {lead.perdido_em ? (
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                Perdido
              </span>
            ) : lead.status && (
              <span
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: lead.status.cor ? `${lead.status.cor}18` : '#f3f4f6',
                  borderColor:     lead.status.cor ? `${lead.status.cor}40` : '#e5e7eb',
                  color:           lead.status.cor ?? '#374151',
                }}
              >
                {lead.status.nome}
              </span>
            )}
            <LeadOrigemBadge origem={lead.origem} />
            {lead.produto_interesse && (
              <span className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                {produtoLabel(lead.produto_interesse)}
              </span>
            )}
          </div>
        </div>

        {podeExcluir && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onExcluir() }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onExcluir()
              }
            }}
            title="Excluir captação"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-2 text-xs text-gray-500">
        <div className="flex min-w-0 items-center gap-2">
          <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate">{lead.telefone || 'Sem telefone'}</span>
        </div>
        {lead.email && (
          <div className="flex min-w-0 items-center gap-2">
            <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate font-medium text-fonti-primary">{fmtValor(lead.valor_pretendido)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-1 pt-1 sm:grid-cols-2">
          <div className="flex min-w-0 items-center gap-2">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">Comercial: {lead.responsavel?.nome ?? '-'}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">Operacional: {responsavelOp?.nome ?? '-'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ColHeader ────────────────────────────────────────────────────────────────

function ColHeader({
  label, col, active, dir, onSort, align = 'left',
  filterable = false,
  colFilters, setColFilters,
  openFilter, setOpenFilter,
  dropdownPos, setDropdownPos,
  allLeads = [],
}: {
  label: string
  col: ColKey
  active: ColKey
  dir: SortDir
  onSort: (col: ColKey) => void
  align?: 'left' | 'right'
  filterable?: boolean
  colFilters?: Record<string, string>
  setColFilters?: React.Dispatch<React.SetStateAction<Record<string, string>>>
  openFilter?: ColKey | null
  setOpenFilter?: (col: ColKey | null) => void
  dropdownPos?: DropdownPos | null
  setDropdownPos?: (pos: DropdownPos | null) => void
  allLeads?: Lead[]
}) {
  const isActive = active === col
  const btnRef = useRef<HTMLButtonElement>(null)
  const unique = useMemo(() => getUniqueValues(allLeads, col), [allLeads, col])

  const activeVal = colFilters?.[col] ?? ''
  const isFiltered = !!activeVal
  const isOpen = openFilter === col

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!setOpenFilter || !setDropdownPos) return
    if (isOpen) {
      setOpenFilter(null)
      setDropdownPos(null)
    } else {
      const rect = btnRef.current?.getBoundingClientRect()
      if (rect) setDropdownPos({ top: rect.bottom + 4, left: rect.left })
      setOpenFilter(col)
    }
  }

  const handleSelect = (val: string) => {
    if (!setColFilters || !setOpenFilter || !setDropdownPos) return
    setColFilters(prev => ({ ...prev, [col]: val }))
    setOpenFilter(null)
    setDropdownPos(null)
  }

  const handleClearFilter = (e: React.MouseEvent) => {
    e.stopPropagation()
    setColFilters?.(prev => ({ ...prev, [col]: '' }))
  }

  if (filterable) {
    return (
      <th className="px-3 py-2 whitespace-nowrap text-left">
        <button
          ref={btnRef}
          onClick={handleOpen}
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium transition-colors select-none',
            isFiltered ? 'text-white' : 'text-white/80 hover:text-white',
          )}
        >
          {isFiltered && <Filter className="h-3 w-3 shrink-0" />}
          <span className="max-w-[120px] truncate">{isFiltered ? activeVal : label}</span>
          {isFiltered
            ? <X className="h-3 w-3 shrink-0 ml-0.5" onClick={handleClearFilter} />
            : <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          }
        </button>

        {isOpen && dropdownPos && typeof document !== 'undefined' && createPortal(
          <div
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
            className="min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-h-56 overflow-y-auto py-1">
              <button
                onClick={() => handleSelect('')}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors',
                  !activeVal ? 'text-fonti-primary font-semibold' : 'text-gray-500',
                )}
              >
                Todos
              </button>
              {unique.length === 0
                ? <p className="px-3 py-2 text-xs text-gray-400">Sem opções</p>
                : unique.map(val => (
                  <button
                    key={val}
                    onClick={() => handleSelect(val)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs hover:bg-fonti-primary/5 transition-colors',
                      activeVal === val ? 'text-fonti-primary font-semibold bg-fonti-primary/5' : 'text-gray-700',
                    )}
                  >
                    {val || '—'}
                  </button>
                ))
              }
            </div>
          </div>,
          document.body,
        )}
      </th>
    )
  }

  // Sort-only header
  return (
    <th className={cn('px-3 py-2 whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left')}>
      <button
        onClick={() => onSort(col)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium transition-colors select-none',
          isActive ? 'text-white' : 'text-white/80 hover:text-white',
        )}
      >
        {label}
        {isActive
          ? dir === 'asc'
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />
          : <ArrowUpDown className="h-3 w-3 opacity-40" />
        }
      </button>
    </th>
  )
}

// ─── LeadRow ──────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  podeExcluir,
  onClick,
  onExcluir,
}: {
  lead: Lead
  podeExcluir: boolean
  onClick: () => void
  onExcluir: () => void
}) {
  const responsavelOp = (lead as any).responsavel_operacional as { nome: string } | null | undefined

  return (
    <tr
      onClick={onClick}
      className="border-b border-gray-200 last:border-0 odd:bg-white even:bg-gray-50/50 hover:bg-fonti-primary/[0.04] cursor-pointer transition-colors"
    >
      {/* Nome */}
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-fonti-primary truncate max-w-[180px] uppercase">{lead.nome}</p>
          {lead.convertido_em && (
            <span className="shrink-0 text-xs bg-blue-50 text-blue-600 font-medium px-1.5 py-0.5 rounded">
              Convertido
            </span>
          )}
        </div>
      </td>

      {/* Contato */}
      <td className="px-3 py-1.5">
        <p className="text-xs text-gray-700">{lead.telefone}</p>
        {lead.email && (
          <p className="text-xs text-gray-400 mt-0.5">{lead.email}</p>
        )}
      </td>

      {/* Fase */}
      <td className="px-3 py-1.5">
        {lead.fase ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lead.fase.cor ?? '#94a3b8' }} />
            {lead.fase.nome}
          </span>
        ) : '—'}
      </td>

      {/* Status */}
      <td className="px-3 py-1.5">
        {lead.perdido_em ? (
          <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-600">
            Perdido
          </span>
        ) : lead.status ? (
          <span
            className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: lead.status.cor ? `${lead.status.cor}18` : '#f3f4f6',
              borderColor:     lead.status.cor ? `${lead.status.cor}40` : '#e5e7eb',
              color:           lead.status.cor ?? '#374151',
            }}
          >
            {lead.status.nome}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Origem */}
      <td className="px-3 py-1.5">
        <LeadOrigemBadge origem={lead.origem} />
      </td>

      {/* Produto */}
      <td className="px-3 py-1.5">
        <span className="text-xs text-gray-600">
          {lead.produto_interesse ? produtoLabel(lead.produto_interesse) : <span className="text-gray-300">—</span>}
        </span>
      </td>

      {/* Comercial */}
      <td className="px-3 py-1.5">
        <span className="text-xs text-gray-600">{lead.responsavel?.nome ?? '—'}</span>
      </td>

      {/* Operacional */}
      <td className="px-3 py-1.5">
        <span className="text-xs text-gray-600">{responsavelOp?.nome ?? '—'}</span>
      </td>

      {/* Valor */}
      <td className="px-3 py-1.5 text-right text-xs font-medium text-fonti-primary">
        {fmtValor(lead.valor_pretendido)}
      </td>

      {/* Data */}
      <td className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap">
        {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}
      </td>

      {/* Excluir */}
      {podeExcluir && (
        <td className="px-2 py-1.5 text-center">
          <button
            onClick={(e) => { e.stopPropagation(); onExcluir() }}
            title="Excluir captação"
            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  )
}
