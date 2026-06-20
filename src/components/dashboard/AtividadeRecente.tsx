'use client'

import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { UserPlus, RefreshCw, GitBranch, UserCheck } from 'lucide-react'
import { useAtividadeRecente } from '@/hooks/dashboard/useDashboard'
import { type AtividadeItem } from '@/types/dashboard'

const ICONES: Record<AtividadeItem['tipo'], React.ElementType> = {
  lead_criado:           UserPlus,
  processo_atualizado:   RefreshCw,
  usuario_convidado:     UserCheck,
  fase_mudanca:          GitBranch,
}

const CORES: Record<AtividadeItem['tipo'], string> = {
  lead_criado:           'bg-blue-100 text-blue-600',
  processo_atualizado:   'bg-fonti-accent-hover text-fonti-primary',
  usuario_convidado:     'bg-green-100 text-green-600',
  fase_mudanca:          'bg-purple-100 text-purple-600',
}

export function AtividadeRecente() {
  const { data: atividades, isLoading } = useAtividadeRecente()

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-fonti-primary mb-4">Atividade recente</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {atividades?.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">Nenhuma atividade recente</p>
          )}
          {atividades?.map((item) => {
            const Icone = ICONES[item.tipo] ?? RefreshCw
            const cor = CORES[item.tipo] ?? 'bg-gray-100 text-gray-500'
            return (
              <div key={item.id} className="flex gap-3 items-start">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cor}`}>
                  <Icone className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fonti-primary leading-snug">{item.descricao}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.usuario} ·{' '}
                    {formatDistanceToNow(new Date(item.criadoEm), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}