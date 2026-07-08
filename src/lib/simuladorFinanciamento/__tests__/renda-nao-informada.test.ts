/**
 * Renda não informada != renda = 0. Antes desta correção, `rendaMensal: 0` (usado como
 * valor interno quando o cliente simplesmente não informou renda) fazia calcularAnalise
 * dividir por zero (`Comprometimento de Renda: Infinity%`), zerar `maxFinanciavel` e
 * empurrar o fator enganoso "Renda insuficiente para a parcela (> 30%)" mesmo sem
 * nenhum dado real de renda.
 */
import { describe, it, expect } from 'vitest'
import { simularTodosBancos, calcularAnalise } from '../engine'
import type { InputFinanciamento } from '../tipos'

const BASE_INPUT: InputFinanciamento = {
  valorImovel:     900_000,
  valorEntrada:    350_000,
  dataNascimento:  '1980-06-15',
  rendaMensal:     0,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       ['caixa'],
  tipoImovel:      'usado',
  finalidade:      'residencial',
}

describe('calcularAnalise — renda não informada', () => {
  it('rendaInformada=false: não gera Infinity%, maxFinanciavel null, nem o fator de renda insuficiente', () => {
    const input: InputFinanciamento = { ...BASE_INPUT, rendaInformada: false }
    const bancos = simularTodosBancos(input)
    const analise = calcularAnalise(input, bancos)

    expect(analise.comprometimentoRenda).toBeNull()
    expect(analise.maxFinanciavel).toBeNull()
    expect(Number.isFinite(analise.score)).toBe(true)
    expect(analise.fatores.some((f) => f.descricao.includes('Renda insuficiente'))).toBe(false)
    expect(analise.fatores.some((f) => f.descricao.includes('Renda não informada'))).toBe(true)
  })

  it('rendaInformada=true (ou omitido) com renda genuinamente zero: mantém o comportamento antigo', () => {
    const bancos = simularTodosBancos(BASE_INPUT)
    const analise = calcularAnalise(BASE_INPUT, bancos)

    // Caso de borda fora do escopo deste bug (cliente realmente com renda zero, não
    // "não informada") — comportamento antigo preservado de propósito.
    expect(analise.comprometimentoRenda).not.toBeNull()
    expect(analise.fatores.some((f) => f.descricao.includes('Renda insuficiente'))).toBe(true)
  })
})
