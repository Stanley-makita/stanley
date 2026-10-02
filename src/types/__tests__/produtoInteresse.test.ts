/**
 * Decisão (2026-10-02): produto curto ("Financiamento") em todas as telas, e leads.produto_interesse
 * sempre com o CÓDIGO — o bot (site e *fonti) gravava o texto do parser ("Financiamento Imobiliário").
 */
import { describe, it, expect } from 'vitest'
import { codigoProdutoInteresse, rotuloProdutoInteresse } from '../leads'

describe('produto do lead', () => {
  it('texto livre do bot vira código', () => {
    expect(codigoProdutoInteresse('Financiamento Imobiliário')).toBe('financiamento')
    expect(codigoProdutoInteresse('Consórcio')).toBe('consorcio')
    expect(codigoProdutoInteresse('CGI')).toBe('cgi')
    expect(codigoProdutoInteresse('null')).toBeNull()
    expect(codigoProdutoInteresse(undefined)).toBeNull()
  })
  it('exibição curta, inclusive de valor antigo por extenso', () => {
    expect(rotuloProdutoInteresse('financiamento')).toBe('Financiamento')
    expect(rotuloProdutoInteresse('Financiamento Imobiliário')).toBe('Financiamento')
    expect(rotuloProdutoInteresse(null)).toBe('')
  })
})
