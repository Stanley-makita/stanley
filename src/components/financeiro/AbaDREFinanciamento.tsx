'use client'

import { calcularPeriodo, type TipoPeriodo } from '@/components/relatorios/SeletorPeriodo'
import { DREPeriodoCards, type ResumoPeriodoDRE } from '@/components/financeiro/DREPeriodoCards'
import { useFinanciamentoPrevisto, useFinanciamentoRealizado } from '@/hooks/financeiro/useFinanciamentoDRE'

const PERIODOS_DRE: { tipo: TipoPeriodo; label: string }[] = [
  { tipo: 'mes',       label: 'Mês Vigente' },
  { tipo: 'trimestre', label: 'Trimestre Vigente' },
  { tipo: 'semestre',  label: 'Semestre Vigente' },
  { tipo: 'ano',       label: 'Ano Vigente' },
]

// Compara só a parte AAAA-MM-DD (datas do banco vêm como DATE puro) —
// inclusive nas duas pontas do período.
function dentroPeriodo(data: string | null | undefined, inicio: string, fim: string): boolean {
  if (!data) return false
  const dataOnly = data.slice(0, 10)
  return dataOnly >= inicio && dataOnly <= fim
}

export function AbaDREFinanciamento() {
  // Todos os 4 períodos cabem dentro do ano vigente — busca só esse
  // intervalo (não o histórico inteiro) e agrega os 4 baldes no client.
  const { dataInicio: anoInicio, dataFim: anoFim } = calcularPeriodo('ano')

  const { data: previsto, isLoading: carregandoPrevisto } = useFinanciamentoPrevisto(anoInicio, anoFim)
  const { data: realizado, isLoading: carregandoRealizado } = useFinanciamentoRealizado(anoInicio, anoFim)
  const isLoading = carregandoPrevisto || carregandoRealizado

  const resumos: ResumoPeriodoDRE[] = PERIODOS_DRE.map(({ tipo, label }) => {
    const { dataInicio, dataFim } = calcularPeriodo(tipo)

    const doPeriodo = (previsto ?? []).filter(p => dentroPeriodo(p.data_emissao, dataInicio, dataFim))
    const receitaPrevista = doPeriodo.reduce((s, p) => s + (p.comissao_empresa_calculada ?? 0), 0)
    const despesaPrevista = doPeriodo.reduce((s, p) => s + (p.comissao_comercial_calculada ?? 0), 0)

    const receitaRealizada = (realizado ?? [])
      .filter(r => r.tipo === 'receita' && dentroPeriodo(r.data, dataInicio, dataFim))
      .reduce((s, r) => s + r.valor, 0)

    const despesaRealizada = (realizado ?? [])
      .filter(r => r.tipo === 'despesa' && dentroPeriodo(r.data, dataInicio, dataFim))
      .reduce((s, r) => s + r.valor, 0)

    return { label, dataInicio, dataFim, receitaPrevista, receitaRealizada, despesaPrevista, despesaRealizada }
  })

  return (
    <DREPeriodoCards
      resumos={resumos}
      isLoading={isLoading}
      legenda={<>Comissão de Financiamento (inclui CGI) acumulada por período — <strong>Receita</strong> é a comissão total recebida do banco, <strong>Despesa</strong> é a comissão paga ao comercial. <strong>Previsto</strong> soma pela emissão (regime de competência), <strong>Realizado</strong> soma pelo que já foi efetivamente recebido/pago (regime de caixa) — só existe depois que o Fechamento do mês é aprovado.</>}
    />
  )
}
