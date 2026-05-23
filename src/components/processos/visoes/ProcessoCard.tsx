'use client'

import { useRouter } from 'next/navigation'
import { type Processo } from '@/types/processos'
import { ProcessoStatusBadge } from '../ProcessoStatusBadge'
import { ChanceBadge } from '../ChanceBadge'
import { useSolicitacoesAbertasPorProcesso } from '@/hooks/solicitacoes/useSolicitacoesAbertasPorProcesso'
import { Building2, User, Calendar, Clock } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface Props { processo: Processo }

export function ProcessoCard({ processo }: Props) {
  const router = useRouter()
  const { data: pendencias = [] } = useSolicitacoesAbertasPorProcesso(processo.id)

  const formatarMoeda = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-[#C2AA6A] transition-all"
      onClick={() => router.push(`/processos/${processo.id}`)}
    >
      {/* Header do card */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ProcessoStatusBadge status={processo.status_processo} />
          <span className="text-xs text-gray-400">{processo.numero_processo}</span>
        </div>
        <ChanceBadge chance={processo.chance_emissao} />
      </div>

      {/* Nome do imóvel */}
      <div className="flex items-start gap-2 mb-3">
        <Building2 className="h-4 w-4 text-[#253B29] mt-0.5 shrink-0" />
        <p className="text-sm font-semibold text-[#253B29] leading-snug line-clamp-2">
          {processo.nome_imovel}
        </p>
      </div>

      {/* Valor + Data */}
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="font-bold text-[#253B29]">
          {processo.valor_financiado ? formatarMoeda(processo.valor_financiado) : '—'}
        </span>
        {processo.data_inicio && (
          <div className="flex items-center gap-1 text-gray-400 text-xs">
            <Calendar className="h-3 w-3" />
            {new Date(processo.data_inicio).toLocaleDateString('pt-BR')}
          </div>
        )}
      </div>

      {/* Fase + progresso */}
      {processo.fase_atual && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">{processo.fase_atual.nome}</span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: '30%', backgroundColor: processo.fase_atual.cor ?? '#253B29' }}
            />
          </div>
        </div>
      )}

      {/* Banco + Responsável + Pendências */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {processo.banco && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
              <span className="text-xs text-gray-500">{processo.banco.nome}</span>
            </div>
          )}
          {pendencias.length > 0 && (
            <div className="flex items-center gap-0.5 text-amber-600">
              <Clock className="h-3 w-3" />
              <span className="text-xs font-medium">{pendencias.length}</span>
            </div>
          )}
        </div>
        {processo.operacional && (
          <div className="flex items-center gap-1">
            <User className="h-3 w-3 text-gray-300" />
            <span className="text-xs text-gray-400">{processo.operacional.nome.split(' ')[0]}</span>
          </div>
        )}
      </div>
    </div>
  )
}