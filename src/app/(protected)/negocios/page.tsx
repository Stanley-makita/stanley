'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Home, CircleDollarSign, FileText, MapPin, AlertCircle, Clock } from 'lucide-react'
import { useNegociosDashboard } from '@/hooks/negocios/useNegociosDashboard'
import { TarefaDetalheModal } from '@/components/tarefas/TarefaDetalheModal'
import { cn } from '@/lib/utils'
import type { PrioridadeSolicitacao } from '@/types/solicitacoes-operacionais'
import type { PrioridadeTarefa, TarefaAgenda } from '@/types/agenda'

const PRIORIDADE_TAREFA_COR: Record<PrioridadeTarefa, string> = {
  urgente: 'bg-red-200 text-red-800',
  alta:  'bg-red-100 text-red-700',
  media: 'bg-yellow-100 text-yellow-700',
  baixa: 'bg-gray-100 text-gray-500',
}

const PRIORIDADE_SOL_COR: Record<PrioridadeSolicitacao, string> = {
  urgente: 'bg-red-100 text-red-700',
  alta:    'bg-orange-100 text-orange-700',
  normal:  'bg-blue-100 text-blue-700',
  baixa:   'bg-gray-100 text-gray-500',
}

const TIPO_SOL_LABEL: Record<string, string> = {
  simulacao:          'Simulação',
  analise_credito:    'Análise de crédito',
  reanalise:          'Reanálise',
  engenharia:         'Engenharia',
  custas:             'Custas',
  documentos:         'Documentos',
  formalizacao:       'Formalização',
  registro:           'Registro',
  pendencia:          'Pendência',
  atendimento_cliente:'Atend. cliente',
  outros:             'Outros',
}

interface ModuloCardProps {
  titulo: string
  href: string
  icon: React.ElementType
  linhaA: { label: string; valor: number }
  linhaB: { label: string; valor: number }
  isLoading?: boolean
}

function ModuloCard({ titulo, href, icon: Icon, linhaA, linhaB, isLoading }: ModuloCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 bg-white rounded-xl border border-gray-200 p-5 hover:border-[#253B29]/40 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#E7E0C4] flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-[#253B29]" />
        </div>
        <span className="font-semibold text-[#253B29] text-sm">{titulo}</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-4 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{linhaA.label}</span>
            <span className="text-sm font-bold text-[#253B29]">{linhaA.valor}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{linhaB.label}</span>
            <span className="text-sm font-bold text-gray-600">{linhaB.valor}</span>
          </div>
        </div>
      )}
    </Link>
  )
}

export default function NegociosDashboardPage() {
  const router = useRouter()
  const { contagens, tarefasHoje, solicitacoes } = useNegociosDashboard()
  const c = contagens.data
  const [tarefaAberta, setTarefaAberta] = useState<{ id: string; fonte: 'processo' | 'lead' } | null>(null)

  function navegarParaSolicitacao(s: { processo_id?: string | null; lead_id?: string | null }) {
    if (s.processo_id) {
      router.push(`/processos/${s.processo_id}?aba=solicitacoes`)
    } else if (s.lead_id) {
      router.push(`/leads?solicitacao=${s.lead_id}`)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#253B29]">Negócios</h1>
        <p className="text-sm text-gray-500 mt-0.5">Visão geral dos módulos e da sua agenda</p>
      </div>

      {/* Linha 1 — 4 cards de módulos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ModuloCard
          titulo="Financiamentos"
          href="/negocios/financiamento"
          icon={Home}
          linhaA={{ label: 'Certeza', valor: c?.financiamento.certeza ?? 0 }}
          linhaB={{ label: 'Incerteza', valor: c?.financiamento.incerteza ?? 0 }}
          isLoading={contagens.isLoading}
        />
        <ModuloCard
          titulo="Consórcios"
          href="/negocios/consorcio"
          icon={CircleDollarSign}
          linhaA={{ label: 'Contratados', valor: c?.consorcio.contratados ?? 0 }}
          linhaB={{ label: 'Negociando', valor: c?.consorcio.negociando ?? 0 }}
          isLoading={contagens.isLoading}
        />
        <ModuloCard
          titulo="Contratos"
          href="/negocios/contrato"
          icon={FileText}
          linhaA={{ label: 'Minuta Pronta', valor: c?.contrato.minutaPronta ?? 0 }}
          linhaB={{ label: 'Elaborando', valor: c?.contrato.elaborando ?? 0 }}
          isLoading={contagens.isLoading}
        />
        <ModuloCard
          titulo="Registros"
          href="/negocios/registro"
          icon={MapPin}
          linhaA={{ label: 'Protocolados', valor: c?.registro.protocolados ?? 0 }}
          linhaB={{ label: 'Preparando', valor: c?.registro.preparando ?? 0 }}
          isLoading={contagens.isLoading}
        />
      </div>

      {/* Linha 2 — Tarefas do dia + Solicitações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Suas tarefas do dia */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-[#253B29]" />
            <h2 className="font-semibold text-[#253B29] text-sm">Suas próximas tarefas</h2>
            {!tarefasHoje.isLoading && (
              <span className="ml-auto text-xs text-gray-400">
                {tarefasHoje.data?.length ?? 0} pendente{(tarefasHoje.data?.length ?? 0) !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {tarefasHoje.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : tarefasHoje.data?.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              Nenhuma tarefa pendente 🎉
            </div>
          ) : (
            <div className="space-y-2">
              {tarefasHoje.data?.map((t) => (
                <button
                  key={t.tarefa_id}
                  onClick={() => setTarefaAberta({ id: t.tarefa_id, fonte: t.fonte })}
                  className="w-full flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.tarefa_titulo}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {t.processo_numero !== 'Lead' ? `#${t.processo_numero} · ` : ''}{t.processo_nome_imovel || 'Sem responsável'}
                    </p>
                  </div>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', PRIORIDADE_TAREFA_COR[t.tarefa_prioridade])}>
                    {t.tarefa_prioridade}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Solicitações a você */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-[#253B29]" />
            <h2 className="font-semibold text-[#253B29] text-sm">Solicitações a você</h2>
            {!solicitacoes.isLoading && (
              <span className="ml-auto text-xs text-gray-400">
                {solicitacoes.data?.length ?? 0} aberta{(solicitacoes.data?.length ?? 0) !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {solicitacoes.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : solicitacoes.data?.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              Nenhuma solicitação aberta 👍
            </div>
          ) : (
            <div className="space-y-2">
              {solicitacoes.data?.map((s) => {
                const slaVencendo = s.sla_at ? isToday(parseISO(s.sla_at)) : false
                const slaVencido  = s.sla_at ? parseISO(s.sla_at) < new Date() : false
                return (
                  <div key={s.id} onClick={() => navegarParaSolicitacao(s)} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-[#E7E0C4]/60 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.titulo}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {TIPO_SOL_LABEL[s.tipo] ?? s.tipo}
                        {s.sla_at && (
                          <span className={cn('ml-2', slaVencido ? 'text-red-500 font-medium' : slaVencendo ? 'text-orange-500 font-medium' : '')}>
                            · SLA {format(parseISO(s.sla_at), "d 'de' MMM", { locale: ptBR })}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', PRIORIDADE_SOL_COR[s.prioridade])}>
                      {s.prioridade}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {tarefaAberta && (
        <TarefaDetalheModal
          tarefaId={tarefaAberta.id}
          fonte={tarefaAberta.fonte}
          onFechar={() => setTarefaAberta(null)}
        />
      )}
    </div>
  )
}
