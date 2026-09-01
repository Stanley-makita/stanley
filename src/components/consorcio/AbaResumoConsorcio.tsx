'use client'

import { type Processo } from '@/types/processos'
import { useProcessoCotas } from '@/hooks/processos/useProcessoCotas'
import { BlocoResponsaveis } from '@/components/processos/BlocoResponsaveis'
import { ListaCotas } from '@/components/consorcio/ListaCotas'
import { Building2, Calendar, Wallet, Clock, MessageSquareText } from 'lucide-react'
import { differenceInDays } from 'date-fns'

function fmtMoeda(v: number | null | undefined) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

interface Props {
  processo: Processo
  onIrParaCompradores?: () => void
}

export function AbaResumoConsorcio({ processo }: Props) {
  const { data: cotas = [] } = useProcessoCotas(processo.id)

  const cotasValidas = cotas.filter((c) => c.status_cota === 'ativo' || c.status_cota === 'contemplado')
  const contratadoEmCotas = cotasValidas.reduce((soma, c) => soma + (c.valor_carta ?? 0), 0)

  const diasEmAndamento = processo.data_inicio
    ? differenceInDays(new Date(), new Date(processo.data_inicio))
    : 0

  // Prazo de referência: se todas as cotas válidas tiverem o mesmo prazo,
  // mostra o valor; se divergirem, mostra o intervalo ("Prazos variados").
  // Sem nenhuma cota ainda, cai pro prazo de referência geral do Negócio
  // (prazo_meses / prazo_grupo_meses, editáveis em "Dados da Carta").
  function textoPrazo(valores: (number | null)[], referencia: number | null): string {
    const preenchidos = valores.filter((v): v is number => v != null)
    if (preenchidos.length === 0) return referencia != null ? `${referencia} meses` : '—'
    const min = Math.min(...preenchidos)
    const max = Math.max(...preenchidos)
    return min === max ? `${min} meses` : `${min} a ${max} meses`
  }

  const textoPrazoCota = textoPrazo(cotasValidas.map((c) => c.prazo_cota_meses), processo.prazo_meses ?? null)
  const textoPrazoGrupo = textoPrazo(cotasValidas.map((c) => c.prazo_grupo_meses), processo.prazo_grupo_meses ?? null)

  return (
    <div className="space-y-5">
      {/* Cards de referência */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4 text-fonti-primary" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Crédito pretendido</p>
              <p className="text-sm font-bold text-fonti-primary">{fmtMoeda(processo.credito_desejado)}</p>
            </div>
          </div>
          {/* Contratado em cotas — calculado a partir das cotas ativas/contempladas,
              NUNCA o mesmo número do crédito pretendido (meta vs realidade). */}
          <p className="mt-2 text-[11px] text-gray-400">
            Contratado em cotas: <span className="font-medium text-gray-600">{fmtMoeda(contratadoEmCotas)}</span>
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4 text-fonti-primary" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Dias em Andamento</p>
            <p className="text-sm font-bold text-fonti-primary">{diasEmAndamento} dias</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-fonti-primary" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Bem de Referência</p>
            <p className="text-sm font-bold text-fonti-primary">
              {processo.bem_referencia_descricao || '—'}
              {processo.parcela_reduzida_percentual != null && ` · Parcela Reduzida ${processo.parcela_reduzida_percentual}%`}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4 text-fonti-primary" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Prazo da cota / do grupo</p>
            <p className="text-sm font-bold text-fonti-primary">{textoPrazoCota} · {textoPrazoGrupo}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
            <MessageSquareText className="h-4 w-4 text-fonti-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Justificativa da Carta</p>
            <p className="text-sm font-bold text-fonti-primary line-clamp-2" title={processo.justificativa_carta ?? undefined}>
              {processo.justificativa_carta || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Lista de Cotas — centro operacional da tela */}
      <ListaCotas processoId={processo.id} />

      <BlocoResponsaveis processo={processo} />
    </div>
  )
}
