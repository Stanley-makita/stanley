/**
 * Amortização por banco — cobre o bug relatado: pedir "Itaú-sac, Santander-sac,
 * Bradesco-sac, Caixa sac e price" na mesma simulação estava colapsando tudo para um
 * único `tipoAmortizacao` global (PRICE, por causa da menção a "price" só da Caixa),
 * derrubando Santander/Bradesco (que não suportam PRICE) com o motivo enganoso
 * "Não oferece financiamento na modalidade PRICE".
 */
import { describe, it, expect } from 'vitest'
import { simularTodosBancos } from '../engine'
import type { InputFinanciamento } from '../tipos'

const BASE_INPUT: InputFinanciamento = {
  valorImovel:     900_000,
  valorEntrada:    350_000,
  dataNascimento:  '1990-06-15',
  rendaMensal:     20_000,
  tipoAmortizacao: 'PRICE', // valor global "vencedor" — o bug real do relato
  correntista:     false,
  bancosIds:       ['itau', 'santander', 'bradesco', 'caixa'],
  tipoImovel:      'usado',
  finalidade:      'residencial',
}

describe('amortização por banco (simularTodosBancos)', () => {
  it('sem amortizacaoPorBanco: o campo global se aplica a todos os bancos (comportamento antigo)', () => {
    const resultados = simularTodosBancos(BASE_INPUT)
    const santander = resultados.find((r) => r.bancoId === 'santander')
    expect(santander?.elegivel).toBe(false)
    expect(santander?.motivoInelegivel).toBe('Não oferece financiamento na modalidade PRICE')
  })

  it('com amortizacaoPorBanco: cada banco é avaliado na amortização que foi pedida para ele', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      amortizacaoPorBanco: { itau: 'SAC', santander: 'SAC', bradesco: 'SAC' },
    }
    const resultados = simularTodosBancos(input)

    const itau = resultados.find((r) => r.bancoId === 'itau')
    const santander = resultados.find((r) => r.bancoId === 'santander')
    const bradesco = resultados.find((r) => r.bancoId === 'bradesco')

    expect(itau?.tipoAmortizacao).toBe('SAC')
    expect(santander?.tipoAmortizacao).toBe('SAC')
    expect(bradesco?.tipoAmortizacao).toBe('SAC')
    expect(santander?.motivoInelegivel).not.toBe('Não oferece financiamento na modalidade PRICE')
    expect(bradesco?.motivoInelegivel).not.toBe('Não oferece financiamento na modalidade PRICE')

    // Caixa continua gerando os dois cenários (SAC+PRICE), independente do mapa
    const caixaResultados = resultados.filter((r) => r.bancoId === 'caixa')
    const amortizacoesCaixa = new Set(caixaResultados.map((r) => r.tipoAmortizacao))
    expect(amortizacoesCaixa.has('SAC')).toBe(true)
    expect(amortizacoesCaixa.has('PRICE')).toBe(true)
  })
})
