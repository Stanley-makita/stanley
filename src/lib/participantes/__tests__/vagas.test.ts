import { describe, it, expect } from 'vitest'
import { avisoVagasCompradores } from '../vagas'

describe('avisoVagasCompradores', () => {
  it('null quando cabe', () => {
    expect(avisoVagasCompradores('BB — Comprador', 3, [{ nome: 'A' }, { nome: 'B' }])).toBeNull()
  })
  it('lista quem ficou de fora', () => {
    expect(avisoVagasCompradores('Bradesco — Autorização', 2, [{ nome: 'Heitor' }, { nome: 'Afrânio' }, { nome: 'Maria' }]))
      .toBe('Bradesco — Autorização: o formulário tem 2 comprador(es) e a proposta tem 3. Ficou de fora: Maria — gere uma 2ª via para ele(s).')
  })
})
