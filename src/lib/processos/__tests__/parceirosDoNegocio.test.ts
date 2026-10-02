/**
 * Regressão (2026-10-02, #proc-076): parceiro incluído no card "Parceiro Comercial" do negócio
 * (processo_parceiros) não aparecia na tabela de Negócios, que só lia processos.parceiro_id
 * (campo antigo, preenchido só na conversão a partir do "indicado por" do lead).
 */
import { describe, it, expect } from 'vitest'
import { nomesParceirosDoNegocio } from '../parceirosDoNegocio'

describe('nomesParceirosDoNegocio', () => {
  it('mostra o parceiro da lista do negócio mesmo sem parceiro_id', () => {
    expect(nomesParceirosDoNegocio({ parceiro: null, parceiros_vinculados: [{ parceiro: { id: 'a', nome: 'Lelio Ordine' } }] }))
      .toBe('Lelio Ordine')
  })

  it('junta o campo antigo e a lista, sem repetir', () => {
    expect(nomesParceirosDoNegocio({
      parceiro: { id: 'a', nome: 'Lelio Ordine' },
      parceiros_vinculados: [{ parceiro: { id: 'a', nome: 'Lelio Ordine' } }, { parceiro: { id: 'b', nome: 'Ana' } }],
    })).toBe('Lelio Ordine, Ana')
  })

  it('sem parceiro nenhum → vazio', () => {
    expect(nomesParceirosDoNegocio({})).toBe('')
    expect(nomesParceirosDoNegocio({ parceiro: null, parceiros_vinculados: [{ parceiro: null }] })).toBe('')
  })
})
