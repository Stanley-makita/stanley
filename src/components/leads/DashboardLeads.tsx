'use client'

import { useState } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import {
  ClipboardList, Users, FileText, CreditCard, Clock, LayoutList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  useLeadsDashboardContagens,
  useFilaDeTrabalho,
  type FilaItem,
  type PrioridadeFila,
} from '@/hooks/leads/useLeadsDashboard'

const PRIORIDADE_CSS: Record<PrioridadeFila, string> = {
  urgente: 'bg-red-100 text-red-700',
  alta:    'bg-orange-100 text-orange-700',
  normal:  'bg-blue-100 text-blue-700',
  baixa:   'bg-gray-100 text-gray-500',
}

const PRIORIDADE_LABEL: Record<PrioridadeFila, string> = {
  urgente: 'Urgente',
  alta:    'Alta',
  normal:  'Normal',
  baixa:   'Baixa',
}

// ─── CardResumo ───────────────────────────────────────────────────────────────

interface CardResumoProps {
  titulo: string
  icon: React.ElementType
  linhaA: { label: string; valor: number | string }
  linhaB: { label: string; valor: number | string }
  destaque?: boolean
  isLoading?: boolean
}

function CardResumo({ titulo, icon: Icon, linhaA, linhaB, destaque, isLoading }: CardResumoProps) {
  return (
    <div className={cn(
      'flex flex-col gap-4 rounded-xl border p-5',
      destaque
        ? 'bg-[#253B29] border-[#253B29]'
        : 'bg-white border-gray-200',
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
          destaque ? 'bg-white/15' : 'bg-[#E7E0C4]',
        )}>
          <Icon className={cn('h-4 w-4', destaque ? 'text-[#C2AA6A]' : 'text-[#253B29]')} />
        </div>
        <span className={cn('font-semibold text-sm', destaque ? 'text-white' : 'text-[#253B29]')}>
          {titulo}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className={cn('h-4 rounded animate-pulse', destaque ? 'bg-white/20' : 'bg-gray-100')} />
          <div className={cn('h-4 rounded animate-pulse w-3/4', destaque ? 'bg-white/20' : 'bg-gray-100')} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={cn('text-xs', destaque ? 'text-white/70' : 'text-gray-500')}>{linhaA.label}</span>
            <span className={cn('text-sm font-bold', destaque ? 'text-[#C2AA6A]' : 'text-[#253B29]')}>{linhaA.valor}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={cn('text-xs', destaque ? 'text-white/70' : 'text-gray-500')}>{linhaB.label}</span>
            <span className={cn('text-sm font-bold', destaque ? 'text-white' : 'text-gray-600')}>{linhaB.valor}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ItemFila ─────────────────────────────────────────────────────────────────

function ItemFila({ item, onAbrirLead }: { item: FilaItem; onAbrirLead: (id: string) => void }) {
  const diasAtraso = item.vencido && item.prazo
    ? differenceInDays(
        new Date(),
        item.prazo.length > 10 ? parseISO(item.prazo) : new Date(item.prazo + 'T00:00:00'),
      )
    : 0

  return (
    <button
      onClick={() => onAbrirLead(item.leadId)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
        item.vencido
          ? 'bg-red-50 border-l-4 border-red-400 hover:bg-red-100'
          : item.venceHoje
            ? 'bg-amber-50 border-l-4 border-amber-400 hover:bg-amber-100'
            : 'bg-gray-50 hover:bg-gray-100',
      )}
    >
      {/* Badge de tipo */}
      <span className={cn(
        'shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap',
        item.tipoCss,
      )}>
        {item.tipoLabel}
      </span>

      {/* Conteúdo principal */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.leadNome}</p>
        <p className="text-xs text-gray-500 truncate">{item.titulo}</p>
      </div>

      {/* Indicador de urgência */}
      {item.vencido && (
        <span className="shrink-0 text-xs text-red-500 font-medium whitespace-nowrap">
          {diasAtraso <= 1 ? '1 dia atraso' : `${diasAtraso} dias atraso`}
        </span>
      )}
      {item.venceHoje && (
        <span className="shrink-0 text-xs text-amber-600 font-medium whitespace-nowrap">
          Vence hoje
        </span>
      )}

      {/* Badge de prioridade */}
      <span className={cn(
        'shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap',
        PRIORIDADE_CSS[item.prioridade],
      )}>
        {PRIORIDADE_LABEL[item.prioridade]}
      </span>
    </button>
  )
}

// ─── DashboardLeads ───────────────────────────────────────────────────────────

interface Props {
  onAbrirLead: (id: string) => void
}

export function DashboardLeads({ onAbrirLead }: Props) {
  const { usuario } = useAuth()
  const [todasDaEmpresa, setTodasDaEmpresa] = useState(false)

  const isGestor =
    usuario?.perfil === 'admin' ||
    usuario?.perfil === 'gerente' ||
    usuario?.perfil === 'gestor'

  const { data: contagens, isLoading: carregandoContagens } = useLeadsDashboardContagens()
  const { data: fila = [], isLoading: carregandoFila } = useFilaDeTrabalho(todasDaEmpresa)

  const vencidosCount = fila.filter(i => i.vencido).length
  const hojeCount = fila.filter(i => i.venceHoje).length

  return (
    <div className="space-y-5">
      {/* Row 1 — Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <CardResumo
          titulo="Minhas Pendências"
          icon={ClipboardList}
          linhaA={{ label: 'itens abertos', valor: contagens?.minhasPendencias ?? 0 }}
          linhaB={{ label: 'vencidos', valor: contagens?.minhasPendenciasVencidas ?? 0 }}
          destaque
          isLoading={carregandoContagens}
        />
        <CardResumo
          titulo="Aguardando Ação"
          icon={Users}
          linhaA={{ label: 'clientes únicos', valor: contagens?.leadsAguardandoAcao ?? 0 }}
          linhaB={{ label: 'sol. ou tarefa aberta', valor: '' }}
          isLoading={carregandoContagens}
        />
        <CardResumo
          titulo="Documentação"
          icon={FileText}
          linhaA={{ label: 'conferir OCR', valor: contagens?.docsAguardandoConferencia ?? 0 }}
          linhaB={{ label: 'extrair dados', valor: contagens?.docsAguardandoExtracao ?? 0 }}
          isLoading={carregandoContagens}
        />
        <CardResumo
          titulo="Crédito"
          icon={CreditCard}
          linhaA={{ label: 'em análise', valor: contagens?.creditoEmAnalise ?? 0 }}
          linhaB={{ label: 'pré-aprovados', valor: contagens?.creditoPreAprovado ?? 0 }}
          isLoading={carregandoContagens}
        />
        <CardResumo
          titulo="Inativos"
          icon={Clock}
          linhaA={{ label: 'sem contato', valor: contagens?.leadsInativos ?? 0 }}
          linhaB={{ label: 'há mais de 7 dias', valor: '' }}
          isLoading={carregandoContagens}
        />
      </div>

      {/* Row 2 — Fila de Trabalho */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {/* Header da fila */}
        <div className="flex items-center gap-2 mb-4">
          <LayoutList className="h-4 w-4 text-[#253B29] shrink-0" />
          <h2 className="font-semibold text-[#253B29] text-sm">Fila de Trabalho</h2>

          {isGestor && (
            <div className="flex items-center gap-0.5 ml-2 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setTodasDaEmpresa(false)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  !todasDaEmpresa
                    ? 'bg-white text-[#253B29] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                Minhas
              </button>
              <button
                onClick={() => setTodasDaEmpresa(true)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  todasDaEmpresa
                    ? 'bg-white text-[#253B29] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                Equipe
              </button>
            </div>
          )}

          {!carregandoFila && (
            <div className="ml-auto flex items-center gap-3 text-xs">
              {vencidosCount > 0 && (
                <span className="text-red-500 font-medium">
                  {vencidosCount} vencido{vencidosCount !== 1 ? 's' : ''}
                </span>
              )}
              {hojeCount > 0 && (
                <span className="text-amber-500 font-medium">
                  {hojeCount} vence{hojeCount !== 1 ? 'm' : ''} hoje
                </span>
              )}
              <span className="text-gray-400">
                {fila.length} item{fila.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Lista */}
        {carregandoFila ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : fila.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-gray-400 text-sm">Nenhuma ação pendente</p>
            <p className="text-gray-300 text-xs mt-1">Tudo em dia!</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {fila.map(item => (
              <ItemFila
                key={`${item.tipo}-${item.id}`}
                item={item}
                onAbrirLead={onAbrirLead}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
