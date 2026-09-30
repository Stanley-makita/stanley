import { describe, it, expect } from 'vitest'
import { rotuloParticipante } from '../rotulos'

const todos = [
  { pessoaId: 'h', nome: 'Heitor Almeida', papel: 'titular' as const },
  { pessoaId: 'a', nome: 'Afrânio Souza', papel: 'coparticipante' as const },
  { pessoaId: 'm', nome: 'Maria Souza', papel: 'coparticipante' as const },
  { pessoaId: 'c', nome: 'Carla', papel: 'conjuge_anuente' as const },
  { pessoaId: 'z', nome: 'Zé', papel: 'conjuge_anuente' as const },
]
const rels = [
  { pessoa_a_id: 'a', pessoa_b_id: 'm' },
  { pessoa_a_id: 'c', pessoa_b_id: 'h' },
]

describe('rotuloParticipante', () => {
  it('titular = Principal', () => {
    expect(rotuloParticipante(todos[0], todos, rels)).toBe('Principal')
  })
  it('coparticipante casado com outro participante = Cônjuge de <1º nome>', () => {
    expect(rotuloParticipante(todos[2], todos, rels)).toBe('Cônjuge de Afrânio')
  })
  it('cônjuge anuente casado com o titular = Cônjuge de <titular>', () => {
    expect(rotuloParticipante(todos[3], todos, rels)).toBe('Cônjuge de Heitor')
  })
  it('do casal, só quem vem depois na proposta vira "Cônjuge de"; o primeiro mantém o papel', () => {
    expect(rotuloParticipante(todos[1], todos, rels)).toBe('Coparticipante')
  })
  it('coparticipante sem casamento na proposta = Coparticipante', () => {
    expect(rotuloParticipante({ pessoaId: 'x', nome: 'X', papel: 'coparticipante' }, todos, rels)).toBe('Coparticipante')
  })
  it('cônjuge anuente sem par na proposta = Cônjuge', () => {
    expect(rotuloParticipante(todos[4], todos, rels)).toBe('Cônjuge')
  })
  it('o próprio titular casado com participante continua Principal', () => {
    expect(rotuloParticipante(todos[0], todos, [{ pessoa_a_id: 'h', pessoa_b_id: 'c' }])).toBe('Principal')
  })
})
