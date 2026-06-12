'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Trash2, ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLeadsTodos } from '@/hooks/leads/useLeads'
import { useLeadsInativos } from '@/hooks/leads/useLeadsDashboard'
import { useFases } from '@/hooks/configuracoes/useFases'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { LeadOrigemBadge } from './LeadOrigemBadge'
import { ExcluirLeadDialog } from './ExcluirLeadDialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { type Lead } from '@/types/leads'

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
  | 'comercial'
  | 'operacional'
  | 'valor'
  | 'criado_em'

type SortDir = 'asc' | 'desc'

const FILTERABLE_COLS = new Set<ColKey>(['fase', 'status', 'origem', 'comercial', 'operacional'])

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
    case 'nome':       return lead.nome.toLowerCase()
    case 'contato':    return lead.telefone ?? ''
    case 'fase':       return lead.fase?.nome ?? ''
    case 'status':     return lead.status?.nome ?? ''
    case 'origem':     return lead.origem ?? ''
    case 'comercial':  return lead.responsavel?.nome ?? ''
    case 'operacional': return (lead as any).responsavel_operacional?.nome ?? ''
    case 'valor':      return String(lead.valor_pretendido ?? 0)
    case 'criado_em':  return lead.created_at
    default:           return ''
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

function applyFilters(leads: Lead[], filters: Partial<Record<ColKey, string[]>>): Lead[] {
  return leads.filter(lead =>
    Object.entries(filters).every(([col, vals]) => {
      if (!vals || vals.length === 0) return true
      const val = getColValue(lead, col as ColKey)
      return vals.includes(val)
    })
  )
}

export function LeadListView({ busca, faseId, onFaseChange, onAbrirLead, filtroEspecial }: Props) {
  const { pode } = usePermissao()
  const podeExcluir = pode('leads.excluir')
  const [leadParaExcluir, setLeadParaExcluir] = useState<{ id: string; faseId: string; nome: string } | null>(null)
  const [sortCol, setSortCol] = useState<ColKey>('criado_em')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filters, setFilters] = useState<Partial<Record<ColKey, string[]>>>({})

  const isInativos = filtroEspecial === 'inativos'

  const { data: todosLeads = [], isLoading: carregandoTodos } = useLeadsTodos(undefined, isInativos ? '' : busca)
  const { data: leadsInativos = [], isLoading: carregandoInativos } = useLeadsInativos()
  const { data: fases = [] } = useFases('leads')

  const isLoading = isInativos ? carregandoInativos : carregandoTodos

  const leadsBase = isInativos
    ? leadsInativos.filter(l => !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || l.telefone?.includes(busca))
    : faseId ? todosLeads.filter(l => l.fase_id === faseId) : todosLeads

  const leadsFiltrados = applyFilters(leadsBase, filters)
  const leads = sortLeads(leadsFiltrados, sortCol, sortDir)

  const totalPorFase = todosLeads.reduce<Record<string, number>>((acc, l) => {
    acc[l.fase_id] = (acc[l.fase_id] ?? 0) + 1
    return acc
  }, {})

  const hasFilters = Object.values(filters).some(v => v && v.length > 0)

  function handleSort(col: ColKey) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function setFilter(col: ColKey, vals: string[]) {
    setFilters(prev => ({ ...prev, [col]: vals.length ? vals : undefined }))
  }

  function clearAllFilters() {
    setFilters({})
  }

  return (
    <div className="space-y-4">
      {/* Banner inativos */}
      {isInativos && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <span className="text-amber-700 text-xs font-medium">
            Leads sem contato há mais de 7 dias e sem tarefas agendadas — {leads.length} encontrado{leads.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Filtros por fase */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onFaseChange(undefined)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
            !faseId
              ? 'bg-[#253B29] text-white border-[#253B29]'
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
            style={faseId === f.id ? { backgroundColor: f.cor ?? '#253B29', borderColor: f.cor ?? '#253B29' } : undefined}
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border border-[#253B29]/40 text-[#253B29] hover:bg-[#253B29]/5"
          >
            <X className="h-3 w-3" />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Aviso leads convertidos */}
      {leads.some(l => l.convertido_em) && (
        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          Leads com <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-medium px-1.5 py-0.5 rounded">Convertido</span> foram transformados em processo e não aparecem no Kanban.
        </p>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-sm">
              {busca ? `Nenhum lead encontrado para "${busca}"` : hasFilters ? 'Nenhum lead com esses filtros.' : 'Nenhum lead nesta fase.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <ColHeader label="Nome"              col="nome"        active={sortCol} dir={sortDir} onSort={handleSort} />
                <ColHeader label="Contato"           col="contato"     active={sortCol} dir={sortDir} onSort={handleSort} />
                <ColHeader label="Fase"              col="fase"        active={sortCol} dir={sortDir} onSort={handleSort}
                  filterable filterOptions={getUniqueValues(leadsBase, 'fase')} activeFilter={filters.fase ?? []} onFilterChange={v => setFilter('fase', v)} />
                <ColHeader label="Status"            col="status"      active={sortCol} dir={sortDir} onSort={handleSort}
                  filterable filterOptions={getUniqueValues(leadsBase, 'status')} activeFilter={filters.status ?? []} onFilterChange={v => setFilter('status', v)} />
                <ColHeader label="Origem"            col="origem"      active={sortCol} dir={sortDir} onSort={handleSort}
                  filterable filterOptions={getUniqueValues(leadsBase, 'origem')} activeFilter={filters.origem ?? []} onFilterChange={v => setFilter('origem', v)} />
                <ColHeader label="Comercial"         col="comercial"   active={sortCol} dir={sortDir} onSort={handleSort}
                  filterable filterOptions={getUniqueValues(leadsBase, 'comercial')} activeFilter={filters.comercial ?? []} onFilterChange={v => setFilter('comercial', v)} />
                <ColHeader label="Operacional"       col="operacional" active={sortCol} dir={sortDir} onSort={handleSort}
                  filterable filterOptions={getUniqueValues(leadsBase, 'operacional')} activeFilter={filters.operacional ?? []} onFilterChange={v => setFilter('operacional', v)} />
                <ColHeader label="Valor pretendido"  col="valor"       active={sortCol} dir={sortDir} onSort={handleSort} align="right" />
                <ColHeader label="Criado em"         col="criado_em"   active={sortCol} dir={sortDir} onSort={handleSort} />
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

// ─── FilterPopover ────────────────────────────────────────────────────────────

function FilterPopover({
  options,
  selected,
  onChange,
}: {
  options: string[]
  selected: string[]
  onChange: (vals: string[]) => void
}) {
  const hasFilter = selected.length > 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={e => e.stopPropagation()}
          className={cn(
            'relative inline-flex items-center justify-center p-0.5 rounded transition-colors',
            hasFilter ? 'text-[#253B29]' : 'text-gray-300 hover:text-gray-500',
          )}
          title="Filtrar coluna"
        >
          <Filter className="h-3 w-3" />
          {hasFilter && (
            <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-[#253B29] text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {selected.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-0 border-gray-200">
        <div className="px-2 py-1.5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-600">Filtrar por valor</span>
          {hasFilter && (
            <button
              onClick={() => onChange([])}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
        {options.length === 0 ? (
          <p className="px-3 py-3 text-xs text-gray-400">Sem opções disponíveis</p>
        ) : (
          <div className="max-h-52 overflow-y-auto py-1">
            {options.map(opt => (
              <label
                key={opt}
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-gray-300 text-[#253B29] accent-[#253B29]"
                  checked={selected.includes(opt)}
                  onChange={e => {
                    if (e.target.checked) onChange([...selected, opt])
                    else onChange(selected.filter(v => v !== opt))
                  }}
                />
                <span className="text-xs text-gray-700 truncate">{opt}</span>
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ─── ColHeader ────────────────────────────────────────────────────────────────

function ColHeader({
  label, col, active, dir, onSort, align = 'left',
  filterable = false, filterOptions = [], activeFilter = [], onFilterChange,
}: {
  label: string
  col: ColKey
  active: ColKey
  dir: SortDir
  onSort: (col: ColKey) => void
  align?: 'left' | 'right'
  filterable?: boolean
  filterOptions?: string[]
  activeFilter?: string[]
  onFilterChange?: (vals: string[]) => void
}) {
  const isActive = active === col
  const hasFilter = activeFilter.length > 0

  return (
    <th className={cn('px-4 py-3 whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left')}>
      <div className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        <button
          onClick={() => onSort(col)}
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium transition-colors select-none',
            isActive ? 'text-[#253B29]' : 'text-gray-500 hover:text-gray-700',
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
        {filterable && onFilterChange && (
          <FilterPopover
            options={filterOptions}
            selected={activeFilter}
            onChange={onFilterChange}
          />
        )}
        {hasFilter && !filterable && null}
      </div>
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
      className="border-b border-gray-50 last:border-0 hover:bg-[#253B29]/[0.03] cursor-pointer transition-colors"
    >
      {/* Nome */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="font-medium text-[#253B29] truncate max-w-[180px]">{lead.nome}</p>
          {lead.convertido_em && (
            <span className="shrink-0 text-xs bg-blue-50 text-blue-600 font-medium px-1.5 py-0.5 rounded">
              Convertido
            </span>
          )}
        </div>
      </td>

      {/* Contato */}
      <td className="px-4 py-3">
        <p className="text-gray-700">{lead.telefone}</p>
        {lead.email && (
          <p className="text-xs text-gray-400 mt-0.5">{lead.email}</p>
        )}
      </td>

      {/* Fase */}
      <td className="px-4 py-3">
        {lead.fase ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lead.fase.cor ?? '#94a3b8' }} />
            {lead.fase.nome}
          </span>
        ) : '—'}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        {lead.status ? (
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
      <td className="px-4 py-3">
        <LeadOrigemBadge origem={lead.origem} />
      </td>

      {/* Comercial */}
      <td className="px-4 py-3">
        <span className="text-xs text-gray-600">{lead.responsavel?.nome ?? '—'}</span>
      </td>

      {/* Operacional */}
      <td className="px-4 py-3">
        <span className="text-xs text-gray-600">{responsavelOp?.nome ?? '—'}</span>
      </td>

      {/* Valor */}
      <td className="px-4 py-3 text-right font-medium text-[#253B29]">
        {fmtValor(lead.valor_pretendido)}
      </td>

      {/* Data */}
      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
        {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}
      </td>

      {/* Excluir */}
      {podeExcluir && (
        <td className="px-2 py-3 text-center">
          <button
            onClick={(e) => { e.stopPropagation(); onExcluir() }}
            title="Excluir lead"
            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  )
}
