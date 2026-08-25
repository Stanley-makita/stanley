/**
 * Sentinela contra regressão: o novo Simulador Preliminar de CGI / Home Equity
 * (src/lib/simuladorCgi/) é um módulo isolado que não deve alterar em nada o Daycoval
 * já calibrado do financiamento imobiliário — produto diferente, parâmetros diferentes
 * (ver docs/calibracao-simuladores/ e a análise que motivou o isolamento).
 */

import { describe, it, expect } from 'vitest'
import { BANCOS_CONFIG } from '@/lib/simuladorFinanciamento/constantes'

describe('Daycoval do financiamento imobiliário — intacto após a entrega de CGI isolado', () => {
  it('taxa e prazo do Daycoval (financiamento imobiliário) permanecem os originais', () => {
    expect(BANCOS_CONFIG.daycoval.taxaAnualBase).toBe(0.1394)
    expect(BANCOS_CONFIG.daycoval.prazoMaximoMeses).toBe(360)
    expect(BANCOS_CONFIG.daycoval.maxLtv).toBe(0.60)
    expect(BANCOS_CONFIG.daycoval.maxValorImovel).toBe(1_000_000)
  })
})
