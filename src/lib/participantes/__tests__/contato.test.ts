import { describe, it, expect } from 'vitest'
import { telefonePrincipalAtivo } from '../contato'

describe('telefonePrincipalAtivo', () => {
  it('principal ativo; senão o 1º ativo; inativo nunca; vazio → null', () => {
    expect(telefonePrincipalAtivo([
      { telefone: '1', principal: false, ativo: true },
      { telefone: '2', principal: true, ativo: true },
    ])).toBe('2')
    expect(telefonePrincipalAtivo([
      { telefone: '9', principal: true, ativo: false },
      { telefone: '3', principal: false, ativo: true },
    ])).toBe('3')
    expect(telefonePrincipalAtivo([{ telefone: '9', principal: true, ativo: false }])).toBeNull()
    expect(telefonePrincipalAtivo([{ telefone: '  ', principal: true, ativo: true }])).toBeNull()
    expect(telefonePrincipalAtivo(null)).toBeNull()
  })
})
