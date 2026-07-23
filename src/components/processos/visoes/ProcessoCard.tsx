'use client'

import { useRouter } from 'next/navigation'
import { type Processo, type ModalidadeProcesso } from '@/types/processos'
import { ProcessoStatusBadge } from '../ProcessoStatusBadge'
import { ChanceBadge } from '../ChanceBadge'
import { useSolicitacoesAbertasPorProcesso } from '@/hooks/solicitacoes/useSolicitacoesAbertasPorProcesso'
import { EntityCard } from '@/components/ui/entity-card'
import { Building2, User, Calendar, Clock } from 'lucide-react'
import { fmtData } from '@/lib/utils'

interface Props { processo: Processo }

const MODALIDADE_CONFIG: Record<ModalidadeProcesso, { label: string; className: string }> = {
  SFI:         { label: 'SFI',         className: 'bg-blue-100 text-blue-700' },
  SBPE:        { label: 'SBPE',        className: 'bg-blue-100 text-blue-700' },
  PMCMV:       { label: 'PMCMV',       className: 'bg-blue-100 text-blue-700' },
  Pro_Cotista: { label: 'Pro Cotista', className: 'bg-blue-100 text-blue-700' },
  CGI:         { label: 'CGI',         className: 'bg-purple-100 text-purple-700' },
  Contrato:    { label: 'Contrato',    className: 'bg-gray-100 text-gray-600' },
  Consorcio:   { label: 'Consórcio',   className: 'bg-orange-100 text-orange-700' },
  Registro:    { label: 'Registro',    className: 'bg-teal-100 text-teal-700' },
}

export function ProcessoCard({ processo }: Props) {
  const router = useRouter()
  const { data: pendencias = [] } = useSolicitacoesAbertasPorProcesso(processo.id)

  const formatarMoeda = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

  const compradorPrincipal =
    processo.compradores?.find((c) => c.principal)?.nome ??
    processo.compradores?.[0]?.nome ??
    null

  const modalidadeCfg = MODALIDADE_CONFIG[processo.modalidade]

  return (
    <EntityCard
      interactive
      onClick={() => {
        const rota = processo.modalidade === 'Consorcio'
          ? `/negocios/consorcio/${processo.id}`
          : `/processos/${processo.id}`
        router.push(rota)
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ProcessoStatusBadge status={processo.status_processo} />
          {modalidadeCfg && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${modalidadeCfg.className}`}>
              {modalidadeCfg.label}
            </span>
          )}
          <span className="text-xs text-gray-400">{processo.numero_processo}</span>
          {processo.numero_proposta && (
            <span className="text-xs text-gray-400" title="Nº da Proposta">· Prop. {processo.numero_proposta}</span>
          )}
        </div>
        <ChanceBadge chance={processo.chance_emissao} />
      </div>

      {/* Cliente (principal) */}
      <div className="flex items-start gap-2 mb-1">
        <User className="h-4 w-4 text-fonti-primary mt-0.5 shrink-0" />
        <p className="text-sm font-semibold text-fonti-primary leading-snug line-clamp-1">
          {compradorPrincipal ?? processo.nome_imovel}
        </p>
      </div>

      {/* Nome do imóvel (secundário) */}
      {compradorPrincipal && processo.nome_imovel && (
        <div className="flex items-start gap-2 mb-3 pl-6">
          <Building2 className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-400 leading-snug line-clamp-1">{processo.nome_imovel}</p>
        </div>
      )}
      {!compradorPrincipal && <div className="mb-3" />}

      {/* Valor + Data */}
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="font-bold text-fonti-primary">
          {processo.valor_financiado ? formatarMoeda(processo.valor_financiado) : '—'}
        </span>
        {processo.data_inicio && (
          <div className="flex items-center gap-1 text-gray-400 text-xs">
            <Calendar className="h-3 w-3" />
            {fmtData(processo.data_inicio)}
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
              style={{ width: '30%', backgroundColor: processo.fase_atual.cor ?? 'var(--fonti-primary)' }}
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
    </EntityCard>
  )
}
