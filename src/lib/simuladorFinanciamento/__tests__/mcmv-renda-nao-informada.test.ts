/**
 * Renda não informada não pode "qualificar" o cliente para a faixa MCMV mais subsidiada.
 * `rendaMensal` fica em 0 internamente quando o cliente simplesmente não informou renda —
 * como o filtro de faixa MCMV é `rendaMensal <= f.rendaMax`, renda=0 sempre "cabe" na
 * Faixa 1 (taxa 4% a.a.), mesmo sem nenhum dado real de renda. Isso vale tanto para
 * `simularBanco('caixa', ...)` quanto para `simularCaixaDuplo` (via `simularTodosBancos`).
 */
import { describe, it, expect } from 'vitest'
import { simularBanco, simularTodosBancos } from '../engine'
import type { InputFinanciamento } from '../tipos'

// Imóvel dentro do teto MCMV Faixa 1 (270k) — só não vira Pró-Cotista porque usaFgts=false.
const BASE_INPUT: InputFinanciamento = {
  valorImovel:     250_000,
  valorEntrada:    50_000,
  dataNascimento:  '1990-06-15',
  rendaMensal:     0,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       ['caixa'],
  tipoImovel:      'usado',
  finalidade:      'residencial',
  usaFgts:         false,
}

describe('Caixa — MCMV não qualifica com renda não informada', () => {
  it('simularBanco: renda não informada não vira MCMV Faixa 1', () => {
    const semRenda = simularBanco('caixa', { ...BASE_INPUT, rendaInformada: false })
    expect(semRenda.programa).not.toMatch(/MCMV/)

    // Controle: a mesma renda=0, mas informada como real, ainda deve qualificar MCMV
    // (comportamento antigo preservado de propósito — fora do escopo deste bug).
    const comRendaZeroReal = simularBanco('caixa', { ...BASE_INPUT, rendaInformada: true })
    expect(comRendaZeroReal.programa).toMatch(/MCMV Faixa 1/)
  })

  it('simularTodosBancos/simularCaixaDuplo: renda não informada não gera resultado MCMV', () => {
    const resultados = simularTodosBancos({ ...BASE_INPUT, rendaInformada: false })
    const temMcmv = resultados.some((r) => r.bancoId === 'caixa' && r.programa.includes('MCMV'))
    expect(temMcmv).toBe(false)
  })
})
