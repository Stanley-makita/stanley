import { describe, it, expect } from 'vitest'
import { nomeAutorMensagem } from '../autorMensagem'

const s = { solicitante: { id: 'a', nome: 'Andresa' }, responsavel: { id: 'f', nome: 'Fabricia Souza' } }

describe('nomeAutorMensagem', () => {
  it('responsável e solicitante pelo nome', () => {
    expect(nomeAutorMensagem({ autor_id: 'f' }, s)).toBe('Fabricia Souza')
    expect(nomeAutorMensagem({ autor_id: 'a' }, s, 'a')).toBe('Andresa (você)')
  })

  it('terceiro aparece com o próprio nome, no lugar do responsável', () => {
    expect(nomeAutorMensagem({ autor_id: 'm', autor: { id: 'm', nome: 'Marcio' } }, s)).toBe('Marcio (no lugar de Fabricia)')
  })
})
