'use client'

import { useState } from 'react'
import { Calculator, Home, Landmark, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLead } from '@/hooks/leads/useLeads'
import { SimuladorCustas } from '@/components/simulador/SimuladorCustas'
import { SimuladorFinanciamento } from '@/components/simuladorFinanciamento/SimuladorFinanciamento'
import { SimuladorCgi } from '@/components/simuladorCgi/SimuladorCgi'
import { useSalvarSimulacaoCentral } from '@/hooks/simulacoes/useSalvarSimulacaoCentral'
import { useSalvarCgiCentral } from '@/hooks/simulacoes/useSalvarCgiCentral'
import { HistoricoSimulacoesLead } from './HistoricoSimulacoesLead'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import type { ResultadoCgiCompleto } from '@/lib/simuladorCgi/tipos'

type SubAba = 'custas' | 'financiamento' | 'cgi' | 'historico'

function fmtMoedaStr(valor: number): string {
  const centavos = Math.round(valor * 100)
  const n = centavos / 100
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props { leadId: string }

export function AbaSimulador({ leadId }: Props) {
  const { data: lead } = useLead(leadId)
  const [subAba, setSubAba] = useState<SubAba>('custas')
  const salvarFinanc = useSalvarSimulacaoCentral()
  const salvarCgi = useSalvarCgiCentral()
  const [cgiResultado, setCgiResultado] = useState<ResultadoCgiCompleto | null>(null)

  const rendaTotal = (lead?.renda_formal ?? 0) + (lead?.renda_informal ?? 0)
  const initialFinanc = {
    valorImovel:    lead?.valor_imovel  ? fmtMoedaStr(lead.valor_imovel)  : undefined,
    valorEntrada:   lead?.entrada       ? fmtMoedaStr(lead.entrada)       : undefined,
    dataNascimento: lead?.data_nascimento ?? undefined,
    rendaMensal:    rendaTotal > 0      ? fmtMoedaStr(rendaTotal)         : undefined,
  }

  async function handleSalvarFinanc(resultado: ResultadoCompleto) {
    await salvarFinanc.mutateAsync({ resultado, leadId })
    setSubAba('historico')
  }

  async function handleSalvarCgi() {
    if (!cgiResultado) return
    await salvarCgi.mutateAsync({ resultado: cgiResultado, leadId })
    setSubAba('historico')
  }

  const tabs: { id: SubAba; label: string; Icon: React.ElementType }[] = [
    { id: 'custas',        label: 'Custas',        Icon: Calculator },
    { id: 'financiamento', label: 'Financiamento', Icon: Home },
    { id: 'cgi',           label: 'CGI',           Icon: Landmark },
    { id: 'historico',     label: 'Histórico',     Icon: Clock },
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 shrink-0 bg-white">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubAba(id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              subAba === id
                ? 'border-fonti-primary text-fonti-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {subAba === 'custas' && (
          <SimuladorCustas
            leadId={leadId}
            valorCVInicial={lead?.valor_imovel ?? 0}
            valorFinanciadoInicial={lead?.valor_pretendido ?? 0}
            clienteNome={lead?.nome}
            modoAvulso
            onSalvo={() => setSubAba('historico')}
          />
        )}

        {subAba === 'financiamento' && (
          <div className="h-full overflow-y-auto">
            <SimuladorFinanciamento
              nomeCliente={lead?.nome}
              cpfCliente={lead?.cpf ?? undefined}
              leadId={leadId}
              initialValues={initialFinanc}
              onSalvar={handleSalvarFinanc}
              salvando={salvarFinanc.isPending}
            />
          </div>
        )}

        {subAba === 'cgi' && (
          <div className="h-full flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto min-h-0">
              <SimuladorCgi
                clienteNome={lead?.nome}
                clienteCpf={lead?.cpf ?? undefined}
                leadId={leadId}
                onResultadoChange={setCgiResultado}
              />
            </div>
            <div className="flex items-center justify-end px-4 py-2 border-t border-gray-100 bg-white shrink-0">
              <button
                type="button"
                onClick={handleSalvarCgi}
                disabled={!cgiResultado || salvarCgi.isPending}
                className="h-7 px-3 text-xs rounded-lg bg-fonti-primary hover:bg-fonti-primary-hover text-white disabled:opacity-50 transition-colors"
              >
                {salvarCgi.isPending ? 'Salvando...' : 'Salvar no histórico'}
              </button>
            </div>
          </div>
        )}

        {subAba === 'historico' && (
          <div className="h-full overflow-y-auto">
            <HistoricoSimulacoesLead leadId={leadId} />
          </div>
        )}
      </div>
    </div>
  )
}
