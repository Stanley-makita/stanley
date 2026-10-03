/**
 * Regressão (2026-10-03): Negócios › Consórcio › Tabela mostrava "Valor do Crédito" e "Administradora"
 * em branco — liam valor_financiado/banco do negócio, mas no consórcio o dado mora nas cotas.
 */
import { describe, it, expect } from 'vitest'
import { creditoConsorcio, administradorasConsorcio } from '../consorcioCotas'

const cota = (valor: number, adm = 'Itaú', status = 'ativo') => ({ valor_carta: valor, administradora_nome: adm, status_cota: status })

describe('consórcio pelas cotas', () => {
  it('crédito = soma das cartas válidas (ativa/contemplada), sem canceladas/substituídas', () => {
    expect(creditoConsorcio({ cotas: [cota(420000), cota(420000, 'Itaú', 'contemplado'), cota(100000, 'Itaú', 'cancelado'), cota(5, 'Itaú', 'substituido')] }))
      .toBe(840000)
  })
  it('sem cota válida → carta de Dados da Carta, depois crédito desejado', () => {
    expect(creditoConsorcio({ cotas: [], credito_desejado: 500000 })).toBe(500000)
    expect(creditoConsorcio({ cotas: [], valor_carta: 1680000, credito_desejado: 500000 })).toBe(1680000)
    expect(creditoConsorcio({ cotas: [cota(1, 'Itaú', 'cancelado')] })).toBeNull()
  })
  it('administradoras distintas das cotas válidas; sem cota → campo do negócio', () => {
    expect(administradorasConsorcio({ cotas: [cota(1), cota(1), cota(1, 'Porto')] })).toBe('Itaú, Porto')
    expect(administradorasConsorcio({ cotas: [], administradora: 'Itaú' })).toBe('Itaú')
    expect(administradorasConsorcio({})).toBe('')
  })
})
