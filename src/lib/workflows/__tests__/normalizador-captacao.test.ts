import { describe, it, expect } from 'vitest'
import { classificarIntencaoOperacao } from '../normalizador-captacao'

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
