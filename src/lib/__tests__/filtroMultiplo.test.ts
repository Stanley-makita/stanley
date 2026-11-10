import { describe, it, expect } from 'vitest'
import {
  valorPassaNoFiltro, passaEmTodosOsFiltros, normalizarSelecao, rotuloDoFiltro, alternarItem,
} from '../filtroMultiplo'

describe('filtroMultiplo', () => {
  it('sem seleção não filtra', () => {
    expect(valorPassaNoFiltro('Bruno', undefined)).toBe(true)
    expect(valorPassaNoFiltro('Bruno', [])).toBe(true)
  })

  it('dentro da coluna aceita qualquer valor marcado', () => {
    expect(valorPassaNoFiltro('Bruno', ['Andresa', 'Bruno'])).toBe(true)
    expect(valorPassaNoFiltro('Luciana', ['Andresa', 'Bruno'])).toBe(false)
  })

  it('entre colunas todas precisam bater', () => {
    const linha: Record<string, string> = { Comercial: 'Bruno', Status: 'Pendente' }
    const valor = (c: string) => linha[c] ?? null
    expect(passaEmTodosOsFiltros({ Comercial: ['Andresa', 'Bruno'], Status: ['Pendente', 'Em Análise'] }, valor)).toBe(true)
    expect(passaEmTodosOsFiltros({ Comercial: ['Andresa', 'Bruno'], Status: ['Aprovado'] }, valor)).toBe(false)
    expect(passaEmTodosOsFiltros({ Comercial: [], Desconhecida: ['x'] }, valor)).toBe(true)
  })

  it('marcar todas as opções vira sem filtro', () => {
    expect(normalizarSelecao(['B', 'A'], ['A', 'B'])).toEqual([])
    expect(normalizarSelecao(['A', 'A'], ['A', 'B'])).toEqual(['A'])
  })

  it('rótulo mostra o valor único ou a contagem', () => {
    expect(rotuloDoFiltro('Comercial', [])).toBe('Comercial')
    expect(rotuloDoFiltro('Comercial', ['Bruno'])).toBe('Bruno')
    expect(rotuloDoFiltro('Comercial', ['Bruno', 'Andresa', 'Lelio'])).toBe('Comercial (3)')
  })

  it('alternarItem liga e desliga', () => {
    expect(alternarItem(['a'], 'b')).toEqual(['a', 'b'])
    expect(alternarItem(['a', 'b'], 'a')).toEqual(['b'])
  })
})
