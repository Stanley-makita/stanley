'use client'

import { useState } from 'react'
import { type Lead } from '@/types/leads'
import { useLeadHistorico } from '@/hooks/leads/useLeadHistorico'
import { useLeadTarefas } from '@/hooks/leads/useLeadTarefas'
import { useFases } from '@/hooks/configuracoes/useFases'
import { formatDistanceToNow, differenceInDays, isPast, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MessageSquare, Calendar, TrendingUp, Banknote, Users, ArrowRight, AlertCircle, Clock, CheckCircle2, CalendarClock } from 'lucide-react'
import { cn, fmtData } from '@/lib/utils'
import { useSolicitacoesAbertasPorLead } from '@/hooks/solicitacoes/useSolicitacoesAbertasPorLead'

const PRODUTO_LABELS: Record<string, string> = {
  financiamento: 'Financiamento',
  consorcio:     'Consórcio',
  cgi:           'CGI',
  portabilidade: 'Portabilidade',
}

const ESTADO_CIVIL_LABELS: Record<string, string> = {
  solteiro:      'Solteiro(a)',
  casado:        'Casado(a)',
  uniao_estavel: 'União Estável',
  divorciado:    'Divorciado(a)',
  viuvo:         'Viúvo(a)',
}

const REGIME_LABELS: Record<string, string> = {
  comunhao_parcial:   'Comunhão Parcial de Bens',
  comunhao_total:     'Comunhão Total de Bens',
  separacao_total:    'Separação Total de Bens',
  participacao_final: 'Participação Final nos Aquestos',
}

function fmtMoeda(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

interface Props { lead: Lead; onMudarAba?: (aba: string) => void }

export function AbaResumo({ lead, onMudarAba }: Props) {
  const { data: notas = [] } = useLeadHistorico(lead.id, ['comentario'])
  const { data: fases = [] } = useFases('leads')
  const { data: tarefas = [] } = useLeadTarefas(lead.id)

  const { data: pendencias = [] } = useSolicitacoesAbertasPorLead(lead.id)
  const diasComoLead = differenceInDays(new Date(), new Date(lead.created_at))
  const rendaTotal = (lead.renda_formal ?? 0) + (lead.renda_informal ?? 0)
  const fasesOrdenadas = fases
  const idxFaseAtual = fasesOrdenadas.findIndex(f => f.id === lead.fase_id)

  const tarefasVencidas  = tarefas.filter(t => !t.concluida && t.data_prazo && isPast(parseISO(t.data_prazo + 'T23:59:59'))).length
  const tarefasPendentes = tarefas.filter(t => !t.concluida && !(t.data_prazo && isPast(parseISO(t.data_prazo + 'T23:59:59')))).length
  const tarefasConcluidas = tarefas.filter(t => t.concluida).length
  const tarefasTotal = tarefas.length

  const tarefaKpi = (() => {
    if (tarefasTotal === 0) return {
      icone: <CalendarClock className="h-4 w-4" />,
      label: 'Tarefas',
      valor: '—',
      sub: 'Nenhuma tarefa criada',
      cor: 'gray' as const,
    }
    if (tarefasVencidas > 0) return {
      icone: <AlertCircle className="h-4 w-4" />,
      label: 'Tarefas',
      valor: String(tarefasVencidas),
      sub: `Vencida${tarefasVencidas !== 1 ? 's' : ''} · ${tarefasPendentes} pendente${tarefasPendentes !== 1 ? 's' : ''}`,
      cor: 'red' as const,
    }
    if (tarefasPendentes > 0) return {
      icone: <Clock className="h-4 w-4" />,
      label: 'Tarefas',
      valor: String(tarefasPendentes),
      sub: `A fazer${tarefasConcluidas > 0 ? ` · ${tarefasConcluidas} concluída${tarefasConcluidas !== 1 ? 's' : ''}` : ''}`,
      cor: 'amber' as const,
    }
    return {
      icone: <CheckCircle2 className="h-4 w-4" />,
      label: 'Tarefas',
      valor: String(tarefasConcluidas),
      sub: `Todas concluídas`,
      cor: 'green' as const,
    }
  })()

  return (
    <div className="space-y-6">

      {/* ── Stats compactos: 4 colunas ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MiniStat
          icone={<Calendar className="h-3.5 w-3.5" />}
          label="Dias como Lead"
          valor={diasComoLead === 0 ? 'Hoje' : `${diasComoLead}d`}
          cor="blue"
        />
        <MiniStat
          icone={<MessageSquare className="h-3.5 w-3.5" />}
          label="Interações"
          valor={notas.length}
          cor="green"
        />
        <MiniStat
          icone={tarefaKpi.icone}
          label="Tarefas"
          valor={tarefasTotal === 0 ? '—' : tarefasTotal}
          cor={tarefaKpi.cor}
          onClick={() => onMudarAba?.('tarefas')}
        />
        <MiniStat
          icone={<Clock className="h-3.5 w-3.5" />}
          label="Pendências"
          valor={pendencias.length === 0 ? '—' : pendencias.length}
          cor={pendencias.length > 0 ? 'amber' : 'gray'}
          onClick={pendencias.length > 0 ? () => onMudarAba?.('solicitacoes') : undefined}
        />
      </div>

      {/* ── Métricas financeiras: 2 colunas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard
          icone={<TrendingUp className="h-4 w-4" />}
          label="Valor Pretendido"
          valor={fmtMoeda(lead.valor_pretendido)}
          sub={lead.produto_interesse ? PRODUTO_LABELS[lead.produto_interesse] ?? lead.produto_interesse : 'Produto não informado'}
          cor="gold"
        />
        <KpiCard
          icone={<Banknote className="h-4 w-4" />}
          label="Renda Total"
          valor={rendaTotal > 0 ? fmtMoeda(rendaTotal) : '—'}
          sub={rendaTotal > 0 ? `Formal: ${fmtMoeda(lead.renda_formal)} + Informal: ${fmtMoeda(lead.renda_informal)}` : 'Não informado'}
          cor="gray"
        />
      </div>

      {/* ── Pipeline de Fases ── */}
      {fases.length > 0 && (
        <div className="border border-gray-300 rounded-xl p-4 bg-white shadow">
          <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-3">Progresso no Pipeline</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {fasesOrdenadas.map((fase, idx) => {
              const isAtual = fase.id === lead.fase_id
              const isPast  = idx < idxFaseAtual
              return (
                <div key={fase.id} className="flex items-center gap-1 shrink-0">
                  <div
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                      isAtual
                        ? 'text-white shadow-sm'
                        : isPast
                          ? 'bg-gray-100 text-gray-400'
                          : 'bg-gray-50 text-gray-300'
                    )}
                    style={isAtual ? { backgroundColor: fase.cor ?? 'var(--fonti-primary)' } : undefined}
                  >
                    {fase.nome}
                  </div>
                  {idx < fasesOrdenadas.length - 1 && (
                    <ArrowRight className={cn('h-3 w-3 shrink-0', isPast ? 'text-gray-300' : 'text-gray-200')} />
                  )}
                </div>
              )
            })}
          </div>
          {idxFaseAtual >= 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{idxFaseAtual + 1} de {fasesOrdenadas.length} fases</span>
                <span>{Math.round(((idxFaseAtual) / Math.max(fasesOrdenadas.length - 1, 1)) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(((idxFaseAtual) / Math.max(fasesOrdenadas.length - 1, 1)) * 100)}%`,
                    backgroundColor: lead.fase?.cor ?? 'var(--fonti-primary)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dados Pessoais (se preenchidos) ── */}
      {(lead.profissao || lead.estado_civil || lead.data_nascimento) && (
        <div className="border border-gray-300 rounded-xl p-4 bg-white shadow">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-gray-400" />
            <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Perfil do Cliente</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {lead.profissao && <Campo label="Profissão" valor={lead.profissao} />}
            {lead.estado_civil && (
              <Campo label="Estado Civil" valor={ESTADO_CIVIL_LABELS[lead.estado_civil] ?? lead.estado_civil} />
            )}
            {lead.data_nascimento && (
              <Campo label="Data de Nascimento" valor={
                fmtData(lead.data_nascimento)
              } />
            )}
            {lead.regime_casamento && <Campo label="Regime" valor={REGIME_LABELS[lead.regime_casamento] ?? lead.regime_casamento} />}
          </div>

          {lead.conjuge_nome && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 mb-2">Cônjuge</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <Campo label="Nome" valor={lead.conjuge_nome} />
                {lead.conjuge_cpf && <Campo label="CPF" valor={lead.conjuge_cpf} />}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Últimas Notas ── */}
      {notas.length > 0 && (
        <div className="border border-gray-300 rounded-xl p-4 bg-white shadow">
          <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-3">
            Últimas Interações
          </p>
          <div className="space-y-2.5">
            {notas.slice(0, 3).map((nota) => (
              <NotaExpandivel key={nota.id} nota={nota} />
            ))}
            {notas.length > 3 && (
              <p className="text-xs text-gray-400 text-center pt-1">
                +{notas.length - 3} notas — veja em <span className="text-fonti-primary font-medium">Notas</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Estado vazio — sem dados extras */}
      {!lead.profissao && !lead.estado_civil && !lead.data_nascimento && notas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-gray-400">Perfil incompleto.</p>
          <p className="text-xs text-gray-300 mt-1">
            Clique em <span className="text-fonti-primary font-medium">Editar</span> para complementar os dados do cliente.
          </p>
        </div>
      )}
    </div>
  )
}

function MiniStat({
  icone, label, valor, cor, onClick,
}: {
  icone: React.ReactNode
  label: string
  valor: string | number
  cor: 'blue' | 'green' | 'gold' | 'gray' | 'red' | 'amber'
  onClick?: () => void
}) {
  const cores = {
    blue:  'bg-blue-50   text-blue-600',
    green: 'bg-green-50  text-green-600',
    gold:  'bg-fonti-surface-warm text-fonti-accent',
    gray:  'bg-gray-50   text-gray-500',
    red:   'bg-red-50    text-red-600',
    amber: 'bg-amber-50  text-amber-500',
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'border border-gray-300 rounded-xl p-3 flex items-center gap-2.5 w-full text-left bg-white shadow',
        onClick && 'hover:border-amber-300 hover:bg-amber-50/30 transition-colors cursor-pointer'
      )}
    >
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cores[cor])}>
        {icone}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-medium leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-fonti-primary leading-none">{valor}</p>
      </div>
    </Tag>
  )
}

function KpiCard({
  icone, label, valor, sub, cor,
}: {
  icone: React.ReactNode
  label: string
  valor: string
  sub: string
  cor: 'blue' | 'green' | 'gold' | 'gray' | 'red' | 'amber'
}) {
  const cores = {
    blue:  'bg-blue-50   text-blue-600',
    green: 'bg-green-50  text-green-600',
    gold:  'bg-fonti-surface-warm text-fonti-accent',
    gray:  'bg-gray-50   text-gray-500',
    red:   'bg-red-50    text-red-600',
    amber: 'bg-amber-50  text-amber-600',
  }
  const borderCores = {
    blue:  'border-gray-100',
    green: 'border-gray-100',
    gold:  'border-gray-100',
    gray:  'border-gray-100',
    red:   'border-red-200',
    amber: 'border-amber-200',
  }
  return (
    <div className={cn('border rounded-xl p-3.5 space-y-2 bg-white shadow', borderCores[cor])}>
      <div className="flex items-center gap-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cores[cor])}>
          {icone}
        </div>
        <p className="text-xs text-gray-400 font-medium leading-tight">{label}</p>
      </div>
      <p className="text-lg font-bold text-fonti-primary leading-none">{valor}</p>
      <p className="text-xs text-gray-400 leading-tight">{sub}</p>
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800">{valor}</p>
    </div>
  )
}

function NotaExpandivel({ nota }: { nota: { id: string; descricao: string | null; created_at: string; usuario?: { nome: string } | null } }) {
  const [expandida, setExpandida] = useState(false)
  const texto = nota.descricao ?? ''
  const LIMITE = 120
  const longa = texto.length > LIMITE

  return (
    <div className="bg-fonti-surface-warm rounded-lg px-3 py-2.5 border border-fonti-accent-hover">
      <p className="text-sm text-gray-700 leading-snug whitespace-pre-wrap">
        {expandida || !longa ? texto : texto.slice(0, LIMITE) + '…'}
      </p>
      {longa && (
        <button
          onClick={() => setExpandida(v => !v)}
          className="text-xs text-fonti-primary font-medium mt-1 hover:underline"
        >
          {expandida ? 'ver menos' : 'ver mais'}
        </button>
      )}
      <p className="text-xs text-gray-400 mt-1">
        {nota.usuario?.nome} ·{' '}
        {formatDistanceToNow(new Date(nota.created_at), { addSuffix: true, locale: ptBR })}
      </p>
    </div>
  )
}
