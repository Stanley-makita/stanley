'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMinhasSolicitacoes, type SolicitacaoPainel } from '@/hooks/solicitacoes/useMinhasSolicitacoes'
import { PRIORIDADE_CORES, STATUS_CORES, STATUS_LABELS, TIPO_LABELS } from '@/types/solicitacoes-operacionais'

// Onde a solicitação está ligada — o painel mostra tudo, independente do módulo em que o
// negócio está, então cada linha diz de onde vem e leva pro lugar certo.
function origemDaSolicitacao(s: SolicitacaoPainel): { rotulo: string; nome: string } | null {
  if (s.processo_id) {
    const numero = s.processo?.numero_processo ?? 'Negócio'
    return { rotulo: 'Negócio', nome: s.processo?.nome_imovel ? `${numero} · ${s.processo.nome_imovel}` : numero }
  }
  if (s.lead_id) return { rotulo: 'Lead', nome: s.lead?.nome ?? '—' }
  return null
}

interface Props {
  // Visão Equipe (só gestores): todas as solicitações da empresa, sem abas.
  todasDaEmpresa?: boolean
  // Captação abre o lead na própria tela; sem isso, navega pela rota.
  onAbrirLead?: (leadId: string) => void
}

type Aba = 'paraMim' | 'quePedi'

export function SolicitacoesPainel({ todasDaEmpresa = false, onAbrirLead }: Props) {
  const router = useRouter()
  const { isLoading, todas, paraMim, quePedi } = useMinhasSolicitacoes(todasDaEmpresa)
  const [aba, setAba] = useState<Aba>('paraMim')

  const itens = todasDaEmpresa ? todas : aba === 'paraMim' ? paraMim : quePedi

  function abrir(s: SolicitacaoPainel) {
    if (s.processo_id) {
      router.push(`/processos/${s.processo_id}?aba=solicitacoes`)
    } else if (s.lead_id) {
      if (onAbrirLead) onAbrirLead(s.lead_id)
      else router.push(`/leads?solicitacao=${s.lead_id}`)
    }
  }

  const vazio = todasDaEmpresa
    ? 'Nenhuma solicitação aberta'
    : aba === 'paraMim'
      ? 'Nenhuma solicitação para você'
      : 'Você não tem solicitações aguardando outras pessoas'

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <Send className="h-4 w-4 text-fonti-primary shrink-0" />
        <span className="text-sm font-semibold text-fonti-primary">
          {todasDaEmpresa ? 'Solicitações da equipe' : 'Solicitações'}
        </span>

        {!todasDaEmpresa && (
          <div className="ml-2 flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([
              ['paraMim', 'Para mim', paraMim.length],
              ['quePedi', 'Que pedi', quePedi.length],
            ] as const).map(([chave, rotulo, qtd]) => (
              <button
                key={chave}
                onClick={() => setAba(chave)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  aba === chave ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {rotulo} <span className="text-gray-400">({qtd})</span>
              </button>
            ))}
          </div>
        )}

        {todasDaEmpresa && <span className="text-xs text-gray-400 ml-0.5">({todas.length})</span>}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : itens.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-gray-400 text-sm">{vazio}</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[460px] overflow-y-auto pr-0.5">
          {itens.map((s) => {
            const origem = origemDaSolicitacao(s)
            const prazo = s.sla_at ? parseISO(s.sla_at) : null
            const slaVencido = !!prazo && prazo < new Date()
            const slaHoje = !!prazo && isToday(prazo)
            const clicavel = !!(s.processo_id || s.lead_id)
            return (
              <button
                key={s.id}
                onClick={() => abrir(s)}
                disabled={!clicavel}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                  slaVencido ? 'bg-red-50 border-l-4 border-red-400 hover:bg-red-100'
                    : slaHoje ? 'bg-amber-50 border-l-4 border-amber-400 hover:bg-amber-100'
                      : 'bg-gray-50 hover:bg-gray-100',
                  !clicavel && 'cursor-default',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 whitespace-nowrap">
                      {TIPO_LABELS[s.tipo] ?? s.tipo}
                    </span>
                    {origem && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 whitespace-nowrap">
                        {origem.rotulo}
                      </span>
                    )}
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap', STATUS_CORES[s.status])}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate mt-1">{origem?.nome ?? s.titulo}</p>
                  <p className="text-xs text-gray-500 truncate">{s.titulo}</p>
                  {(s.solicitante?.nome || s.responsavel?.nome) && (
                    <p className="text-[11px] text-gray-400 truncate">
                      {s.solicitante?.nome && <>Pedido por <span className="text-gray-500 font-medium">{s.solicitante.nome}</span></>}
                      {s.solicitante?.nome && s.responsavel?.nome && ' · '}
                      {s.responsavel?.nome && <>Para <span className="text-gray-500 font-medium">{s.responsavel.nome}</span></>}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap', PRIORIDADE_CORES[s.prioridade])}>
                    {s.prioridade}
                  </span>
                  {prazo && (
                    <span className={cn(
                      'text-[11px] whitespace-nowrap',
                      slaVencido ? 'text-red-500 font-medium' : slaHoje ? 'text-amber-600 font-medium' : 'text-gray-400',
                    )}>
                      {slaVencido ? 'Atrasada · ' : slaHoje ? 'Vence hoje · ' : 'SLA '}
                      {format(prazo, "d 'de' MMM", { locale: ptBR })}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
