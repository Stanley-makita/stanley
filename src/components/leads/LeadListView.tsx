'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLeadsTodos } from '@/hooks/leads/useLeads'
import { useFases } from '@/hooks/configuracoes/useFases'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { LeadOrigemBadge } from './LeadOrigemBadge'
import { ExcluirLeadDialog } from './ExcluirLeadDialog'
import { type Lead } from '@/types/leads'

interface Props {
  busca: string
  faseId?: string
  onFaseChange: (faseId?: string) => void
  onAbrirLead: (id: string) => void
}

function fmtValor(v: number | null) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v)
}

export function LeadListView({ busca, faseId, onFaseChange, onAbrirLead }: Props) {
  const { pode } = usePermissao()
  const podeExcluir = pode('leads.excluir')
  const [leadParaExcluir, setLeadParaExcluir] = useState<{ id: string; faseId: string; nome: string } | null>(null)

  // Busca TODOS os leads (sem filtro de fase) para os contadores dos tabs
  const { data: todosLeads = [], isLoading } = useLeadsTodos(undefined, busca)
  const { data: fases = [] } = useFases('leads')

  // Filtra client-side para exibição na tabela
  const leads = faseId ? todosLeads.filter(l => l.fase_id === faseId) : todosLeads

  // Contadores sempre baseados em todos os leads — nunca zerados ao filtrar
  const totalPorFase = todosLeads.reduce<Record<string, number>>((acc, l) => {
    acc[l.fase_id] = (acc[l.fase_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
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
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: f.cor ?? '#94a3b8' }}
            />
            {f.nome}
            <span className={cn('ml-0.5', faseId === f.id ? 'opacity-80' : 'opacity-50')}>
              {totalPorFase[f.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Aviso quando há leads convertidos */}
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
              {busca ? `Nenhum lead encontrado para "${busca}"` : 'Nenhum lead nesta fase.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Nome</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Contato</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Fase</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Origem</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Valor pretendido</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Criado em</th>
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
  return (
    <tr
      onClick={onClick}
      className="border-b border-gray-50 last:border-0 hover:bg-[#253B29]/[0.03] cursor-pointer transition-colors"
    >
      {/* Nome */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="font-medium text-[#253B29] truncate max-w-[200px]">{lead.nome}</p>
          {lead.convertido_em && (
            <span className="shrink-0 text-xs bg-blue-50 text-blue-600 font-medium px-1.5 py-0.5 rounded">
              Convertido
            </span>
          )}
        </div>
        {lead.responsavel && (
          <p className="text-xs text-gray-400 mt-0.5">{lead.responsavel.nome}</p>
        )}
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
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: lead.fase.cor ?? '#94a3b8' }}
            />
            {lead.fase.nome}
          </span>
        ) : '—'}
      </td>

      {/* Origem */}
      <td className="px-4 py-3">
        <LeadOrigemBadge origem={lead.origem} />
      </td>

      {/* Valor */}
      <td className="px-4 py-3 text-right font-medium text-[#253B29]">
        {fmtValor(lead.valor_pretendido)}
      </td>

      {/* Data */}
      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
        {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}
      </td>

      {/* Ação excluir */}
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
