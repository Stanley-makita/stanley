import { describe, expect, it } from 'vitest'
import { getCamposContatoPendentes, temContatoObrigatorioParaCredito } from '../leadContactValidation'

describe('lead contact validation', () => {
  it('bloqueia quando telefone e email estão ausentes', () => {
    expect(getCamposContatoPendentes({ telefone: null, email: '' })).toEqual(['telefone', 'email'])
    expect(temContatoObrigatorioParaCredito({ telefone: null, email: '' })).toBe(false)
  })

  it('libera quando ambos os campos são válidos', () => {
    expect(getCamposContatoPendentes({ telefone: '(44) 99999-9999', email: 'cliente@email.com' })).toEqual([])
    expect(temContatoObrigatorioParaCredito({ telefone: '(44) 99999-9999', email: 'cliente@email.com' })).toBe(true)
  })

  it('bloqueia quando apenas email está preenchido', () => {
    expect(getCamposContatoPendentes({ telefone: null, email: 'cliente@email.com' })).toEqual(['telefone'])
    expect(temContatoObrigatorioParaCredito({ telefone: null, email: 'cliente@email.com' })).toBe(false)
  })

  it('bloqueia quando apenas telefone está preenchido', () => {
    expect(getCamposContatoPendentes({ telefone: '5544999990000', email: null })).toEqual(['email'])
    expect(temContatoObrigatorioParaCredito({ telefone: '5544999990000', email: null })).toBe(false)
  })

  it('rejeita telefone com todos os dígitos iguais (zeros)', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '00000000000', email: 'x@y.com' })).toBe(false)
  })

  it('rejeita telefone com todos os dígitos iguais (uns)', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '11111111111', email: 'x@y.com' })).toBe(false)
  })

  it('rejeita telefone com dígitos repetidos mesmo com formatação', () => {
    // (99) 99999-9999 → dígitos: 9999999999 → tudo 9
    expect(temContatoObrigatorioParaCredito({ telefone: '(99) 99999-9999', email: 'x@y.com' })).toBe(false)
  })

  it('rejeita telefone com menos de 10 dígitos', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '123456789', email: 'x@y.com' })).toBe(false)
  })

  it('aceita telefone válido no formato internacional', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '5544999990000', email: 'x@y.com' })).toBe(true)
  })

  it('aceita telefone válido com formatação', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '+55 (44) 9 9999-0000', email: 'x@y.com' })).toBe(true)
  })
})
