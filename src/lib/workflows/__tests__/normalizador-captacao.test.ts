import { describe, it, expect } from 'vitest'
import { classificarIntencaoOperacao, normalizarDadosCaptacao } from '../normalizador-captacao'
import type { DadosCaptacaoRaw } from '../parser-captacao'

function rawBase(overrides: Partial<DadosCaptacaoRaw>): DadosCaptacaoRaw {
  return {
    nome: null, cpf: null, telefone: null, data_nascimento: null,
    cidade_imovel: null, tipo_imovel: null,
    valor_imovel: null, valor_entrada: null, valor_financiado: null,
    percentual_financiado: null, percentual_entrada: null,
    renda_formal: null, renda_informal: null,
    bancos_raw: [], solicitar_simulacao: false,
    prazo_meses: null, prazo_maximo: false, prazos_detectados: null,
    modo_calculo: null, produto: null, fgts_valor: null,
    relacionamento_bancario: null, tipo_amortizacao_raw: null,
    amortizacao_por_banco_raw: null, todos_bancos: false,
    valor_terreno: null, valor_obra: null,
    ...overrides,
  } as DadosCaptacaoRaw
}

describe('classificarIntencaoOperacao', () => {
  it('não confunde "terreno" citado na composição da entrada com compra de lote', () => {
    const texto = '1.200.000,00 casa usada Maringá, Entrada 350.000 (100 mil FGTS mais 250 mil terreno)'
    const resultado = classificarIntencaoOperacao(texto)
    expect(resultado.tipoOperacao).toBe('aquisicao')
    expect(resultado.finalidade).toBe('residencial')
    expect(resultado.pedirEsclarecimento).toBe(false)
  })

  it('continua classificando como lote_urbanizado quando o objeto é mesmo um terreno', () => {
    const texto = 'quero financiar um terreno de 300 mil em Maringá'
    const resultado = classificarIntencaoOperacao(texto)
    expect(resultado.tipoOperacao).toBe('lote_urbanizado')
  })

  it('continua classificando como construcao_terreno_proprio quando o cliente já tem o terreno e quer construir', () => {
    const texto = 'tenho um terreno e quero construir uma casa'
    const resultado = classificarIntencaoOperacao(texto)
    expect(resultado.tipoOperacao).toBe('construcao_terreno_proprio')
  })

  it('continua classificando como terreno_mais_construcao quando o cliente quer comprar o terreno e construir', () => {
    const texto = 'quero comprar terreno e construir'
    const resultado = classificarIntencaoOperacao(texto)
    expect(resultado.tipoOperacao).toBe('terreno_mais_construcao')
  })

  it('classifica como aquisicao residencial quando não há nenhuma menção a terreno/lote', () => {
    const texto = '900 mil casa usada, entrada 350 mil, prazo máximo'
    const resultado = classificarIntencaoOperacao(texto)
    expect(resultado.tipoOperacao).toBe('aquisicao')
  })
})

describe('normalizarDadosCaptacao — tipo_amortizacao_ambas', () => {
  it('"sac e price" sem banco associado vira tipo_amortizacao_ambas=true (não descarta o SAC)', () => {
    const raw = rawBase({
      tipo_amortizacao_raw: 'sac e price',
      amortizacao_por_banco_raw: null,
      bancos_raw: ['Bradesco', 'Santander'],
    })
    const resultado = normalizarDadosCaptacao(raw)
    expect(resultado.tipo_amortizacao_ambas).toBe(true)
    expect(resultado.tipo_amortizacao).toBe('SAC')
    expect(resultado.bancos_ids).toEqual(['bradesco', 'santander'])
  })

  it('amortização amarrada a um banco específico não ativa tipo_amortizacao_ambas', () => {
    const raw = rawBase({
      tipo_amortizacao_raw: null,
      amortizacao_por_banco_raw: [
        { banco: 'Caixa', amortizacao: 'SAC' },
        { banco: 'Caixa', amortizacao: 'PRICE' },
      ],
      bancos_raw: ['Caixa'],
    })
    const resultado = normalizarDadosCaptacao(raw)
    expect(resultado.tipo_amortizacao_ambas).toBe(false)
    expect(resultado.amortizacao_por_banco.caixa).toBe('PRICE')
  })

  it('só PRICE mencionado continua funcionando como antes (sem ambas)', () => {
    const raw = rawBase({ tipo_amortizacao_raw: 'PRICE', bancos_raw: ['Bradesco'] })
    const resultado = normalizarDadosCaptacao(raw)
    expect(resultado.tipo_amortizacao_ambas).toBe(false)
    expect(resultado.tipo_amortizacao).toBe('PRICE')
  })
})
