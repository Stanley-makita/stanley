/**
 * Caixa Comercial (SBPE) — calibração de taxa e tarifa de administração.
 *
 * Caso-âncora real: simulador oficial CAIXA (16/09/2026), imóvel comercial
 * R$500.000,00 em Maringá-PR, sem correntista/relacionamento, nascimento
 * 25/10/1978, renda R$20.000, FGTS <3 anos, SAC 240 meses, entrada R$150.000
 * (exatamente 70% de LTV). PDF completo com as 240 parcelas anexado pelo
 * usuário — usado pra achar 2 bugs reais:
 *
 * 1. `simularBanco`/`simularCaixaDuplo` (engine.ts) aplicavam a taxa
 *    RESIDENCIAL (11,49% a.a.) na simulação comercial — só LTV/prazo eram
 *    trocados, a taxa não. Real: 13,50% a.a. efetivo ("Juros efetivos" no
 *    PDF oficial, mesma convenção que `taxaAnualBase` usa em todo o motor).
 * 2. Tarifa de administração (CAIXA_TA_MENSAL, R$25/mês) também era herdada
 *    do residencial — o PDF oficial mostra "Taxa de administração: R$0,00"
 *    em toda a tabela de 240 parcelas pro comercial.
 *
 * Última parcela bate EXATAMENTE com o oficial (R$1.473,80) depois do fix —
 * a 1ª parcela fica a ~R$5,57 (0,1%) do oficial, atribuível à tabela de MIP
 * por idade (CAIXA_MIP_RATES), que NÃO foi recalibrada aqui: um único ponto
 * novo de dado não é suficiente pra sobrescrever uma tabela já confirmada
 * com 10/10 faixas em outros casos-âncora (ver comentário de
 * CAIXA_MIP_RATES em constantes.ts) — a diferença observada nesse PDF foi
 * pequena e inconsistente em direção entre as duas faixas de idade
 * cobertas por ele, típica de ruído de arredondamento, não de uma tabela
 * de MIP comercial genuinamente diferente da residencial.
 */

import { describe, it, expect } from 'vitest'
import { simularTodosBancos } from '../engine'
import type { InputFinanciamento } from '../tipos'

const INPUT_OFICIAL: InputFinanciamento = {
  valorImovel:     500_000,
  valorEntrada:    150_000,
  dataNascimento:  '1978-10-25',
  rendaMensal:     20_000,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       ['caixa'],
  tipoImovel:      'novo',
  finalidade:      'comercial',
  tipoOperacao:    'comercial',
  usaFgts:         false,
}

describe('Caixa Comercial (SBPE) — calibração com simulador oficial', () => {
  it('taxa efetiva é 13,50% a.a., não a residencial (11,49%)', () => {
    const [sac] = simularTodosBancos(INPUT_OFICIAL).filter((r) => r.resultadoId === 'caixa-sbpe-sac')
    expect(sac.taxaAnual).toBeCloseTo(0.135, 4)
  })

  it('LTV 70% (limite exato) e prazo 240 meses batem com o oficial', () => {
    const [sac] = simularTodosBancos(INPUT_OFICIAL).filter((r) => r.resultadoId === 'caixa-sbpe-sac')
    expect(sac.elegivel).toBe(true)
    expect(sac.parcelas).toBe(240)
    expect(sac.valorFinanciado).toBe(350_000)
  })

  it('1ª e última parcela batem com o oficial dentro de R$10 (última exata)', () => {
    const [sac] = simularTodosBancos(INPUT_OFICIAL).filter((r) => r.resultadoId === 'caixa-sbpe-sac')
    expect(Math.abs(sac.primeiraParcela - 5_334.27)).toBeLessThan(10)
    expect(Math.abs(sac.ultimaParcela - 1_473.80)).toBeLessThan(0.5)
  })

  it('não cobra tarifa de administração (diferente do residencial, que cobra R$25/mês)', () => {
    // Sem tarifa: totalPago = valorFinanciado + totalJuros + totalSeguros, sem sobra de R$25×240=R$6.000.
    const [sac] = simularTodosBancos(INPUT_OFICIAL).filter((r) => r.resultadoId === 'caixa-sbpe-sac')
    const semTarifa = sac.valorFinanciado + sac.totalJuros + sac.totalSeguros
    expect(Math.abs(sac.totalPago - semTarifa)).toBeLessThan(1)
  })

  it('residencial (finalidade default) continua com a taxa de 11,49%, não a comercial', () => {
    const [sac] = simularTodosBancos({ ...INPUT_OFICIAL, finalidade: 'residencial', tipoOperacao: 'aquisicao', valorEntrada: 100_000 })
      .filter((r) => r.resultadoId === 'caixa-sbpe-sac')
    expect(sac.taxaAnual).toBeCloseTo(0.1149, 4)
  })
})
