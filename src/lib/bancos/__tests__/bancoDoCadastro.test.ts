/** Regressão (2026-10-03): Captação mostrava "Caixa Econômica Federal" e a conversão não achava o "Itau". */
import { describe, it, expect } from 'vitest'
import { bancoDoCadastro, nomeBancoExibicao } from '../bancoDoCadastro'

const CADASTRO = [
  { id: '1', nome: 'Caixa' }, { id: '2', nome: 'Itau' }, { id: '3', nome: 'Banco do Brasil' }, { id: '4', nome: 'Cashme' },
]

describe('bancoDoCadastro', () => {
  it('casa texto antigo com o cadastro, sem maiúscula/acento', () => {
    expect(bancoDoCadastro('Caixa Econômica Federal', CADASTRO)?.id).toBe('1')
    expect(bancoDoCadastro('Itaú', CADASTRO)?.id).toBe('2')
    expect(bancoDoCadastro('banco do brasil', CADASTRO)?.id).toBe('3')
  })
  it('sem correspondência ou vazio → null', () => {
    expect(bancoDoCadastro('BTG Pactual', CADASTRO)).toBeNull()
    expect(bancoDoCadastro('', CADASTRO)).toBeNull()
  })
  it('exibição: nome do cadastro, senão o texto gravado', () => {
    expect(nomeBancoExibicao('Caixa Econômica Federal', CADASTRO)).toBe('Caixa')
    expect(nomeBancoExibicao('BTG Pactual', CADASTRO)).toBe('BTG Pactual')
    expect(nomeBancoExibicao(null, CADASTRO)).toBe('')
  })
})
