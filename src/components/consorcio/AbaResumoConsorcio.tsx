'use client'

import { type Processo } from '@/types/processos'
import { BlocoResponsaveis } from '@/components/processos/BlocoResponsaveis'
import { User, Phone, Mail, DollarSign } from 'lucide-react'

function fmtMoeda(v: number | null | undefined) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-[#253B29]">{valor || '—'}</p>
    </div>
  )
}

interface Props {
  processo: Processo
  onIrParaCompradores?: () => void
}

export function AbaResumoConsorcio({ processo, onIrParaCompradores }: Props) {
  const compradorPrincipal =
    processo.compradores?.find((c) => c.principal) ?? processo.compradores?.[0] ?? null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Bloco Cliente ── */}
      <div className="border border-gray-100 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cliente</h4>

        {compradorPrincipal ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#253B29]/10 flex items-center justify-center shrink-0">
                <span className="text-[#253B29] text-sm font-bold">
                  {compradorPrincipal.nome.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#253B29]">{compradorPrincipal.nome}</p>
                {compradorPrincipal.cpf && (
                  <p className="text-xs text-gray-400">{compradorPrincipal.cpf}</p>
                )}
              </div>
            </div>

            {(compradorPrincipal as any).email && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {(compradorPrincipal as any).email}
              </div>
            )}
            {(compradorPrincipal as any).telefone && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {(compradorPrincipal as any).telefone}
              </div>
            )}
            {(compradorPrincipal as any).renda_mensal && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                Renda: {fmtMoeda((compradorPrincipal as any).renda_mensal)}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-300 italic">Nenhum cliente cadastrado</p>
        )}

        {onIrParaCompradores && (
          <button
            type="button"
            onClick={onIrParaCompradores}
            className="text-xs text-[#253B29] underline underline-offset-2 hover:opacity-70 transition-opacity"
          >
            Ver / editar compradores →
          </button>
        )}
      </div>

      {/* ── Bloco Objetivo ── */}
      <div className="border border-gray-100 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Objetivo</h4>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Crédito desejado"  valor={fmtMoeda(processo.credito_desejado)} />
          <Campo label="Carta sugerida"    valor={fmtMoeda(processo.carta_sugerida)} />
        </div>
        {processo.justificativa_carta && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Justificativa</p>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2 leading-relaxed">
              {processo.justificativa_carta}
            </p>
          </div>
        )}
      </div>

      {/* ── Bloco Operação + Responsáveis ── */}
      <div className="space-y-4">
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Operação</h4>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Administradora"  valor={processo.administradora} />
            <Campo label="Grupo"           valor={processo.grupo_consorcio} />
            <Campo label="Cota"            valor={processo.cota_consorcio} />
            <Campo label="Valor da carta"  valor={fmtMoeda(processo.valor_carta)} />
            <Campo label="Parcela"         valor={fmtMoeda(processo.parcela_consorcio)} />
            <Campo label="Prazo"           valor={processo.prazo_meses ? `${processo.prazo_meses} meses` : null} />
          </div>
        </div>

        <BlocoResponsaveis processo={processo} />
      </div>
    </div>
  )
}
