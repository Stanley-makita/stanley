import { describe, it, expect } from 'vitest'
import { fmtTaxaAnual } from '../_helpers'

describe('fmtTaxaAnual — taxa do negócio no e-mail de confirmação', () => {
  it('formata a taxa anual em pt-BR', () => {
    expect(fmtTaxaAnual(12.49)).toBe('12,49% a.a.')
    expect(fmtTaxaAnual(12)).toBe('12,00% a.a.')
    expect(fmtTaxaAnual('11.29')).toBe('11,29% a.a.') // numeric do PostgREST pode vir como string
  })

  it('sem taxa → null (template mostra "—")', () => {
    expect(fmtTaxaAnual(null)).toBeNull()
    expect(fmtTaxaAnual(undefined)).toBeNull()
    expect(fmtTaxaAnual('')).toBeNull()
    expect(fmtTaxaAnual(0)).toBeNull()
  })
})
