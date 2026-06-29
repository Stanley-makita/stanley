import { describe, expect, it } from 'vitest'
import { getCamposContatoPendentes, temContatoObrigatorioParaCredito } from '../leadContactValidation'

const TELEFONE_VALIDO = '5544998765432'
const EMAIL_VALIDO = 'cliente@email.com'
const NASCIMENTO_VALIDO = '1990-05-15'

describe('lead contact validation', () => {
  it('bloqueia quando todos os campos estão ausentes', () => {
    const p = getCamposContatoPendentes({ telefone: null, email: '', data_nascimento: null })
    expect(p).toContain('telefone')
    expect(p).toContain('email')
    expect(p).toContain('data_nascimento')
    expect(temContatoObrigatorioParaCredito({ telefone: null, email: '', data_nascimento: null })).toBe(false)
  })

  it('libera quando todos os três campos são válidos', () => {
    const p = getCamposContatoPendentes({ telefone: TELEFONE_VALIDO, email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })
    expect(p).toEqual([])
    expect(temContatoObrigatorioParaCredito({ telefone: TELEFONE_VALIDO, email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(true)
  })

  // ── Telefone ─────────────────────────────────────────────────

  it('bloqueia quando apenas telefone está ausente', () => {
    expect(getCamposContatoPendentes({ telefone: null, email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toEqual(['telefone'])
  })

  it('rejeita telefone com menos de 10 dígitos', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '233333', email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(false)
  })

  it('rejeita telefone com todos os dígitos iguais — zeros', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '00000000000', email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(false)
  })

  it('rejeita telefone com todos os dígitos iguais — uns', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '11111111111', email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(false)
  })

  it('rejeita telefone com todos os dígitos iguais — dois', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '22222222222', email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(false)
  })

  it('rejeita telefone com apenas 2 dígitos distintos — 22222333333', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '22222333333', email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(false)
  })

  it('rejeita telefone com apenas 1 dígito distinto com formatação', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '(99) 99999-9999', email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(false)
  })

  it('aceita telefone válido no formato internacional', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: TELEFONE_VALIDO, email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(true)
  })

  it('aceita telefone válido com formatação', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: '+55 (44) 9 9876-5432', email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })).toBe(true)
  })

  // ── Email ────────────────────────────────────────────────────

  it('bloqueia quando apenas email está ausente', () => {
    expect(getCamposContatoPendentes({ telefone: TELEFONE_VALIDO, email: null, data_nascimento: NASCIMENTO_VALIDO })).toEqual(['email'])
  })

  it('rejeita email sem @', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: TELEFONE_VALIDO, email: 'clientesemarroba', data_nascimento: NASCIMENTO_VALIDO })).toBe(false)
  })

  it('aceita email com @', () => {
    expect(temContatoObrigatorioParaCredito({ telefone: TELEFONE_VALIDO, email: 'x@y.com', data_nascimento: NASCIMENTO_VALIDO })).toBe(true)
  })

  // ── Data de nascimento ───────────────────────────────────────

  it('bloqueia quando data de nascimento está ausente', () => {
    expect(getCamposContatoPendentes({ telefone: TELEFONE_VALIDO, email: EMAIL_VALIDO, data_nascimento: null })).toEqual(['data_nascimento'])
    expect(temContatoObrigatorioParaCredito({ telefone: TELEFONE_VALIDO, email: EMAIL_VALIDO, data_nascimento: null })).toBe(false)
  })

  it('bloqueia quando apenas email e nascimento estão preenchidos', () => {
    const p = getCamposContatoPendentes({ telefone: null, email: EMAIL_VALIDO, data_nascimento: NASCIMENTO_VALIDO })
    expect(p).toEqual(['telefone'])
  })

  it('bloqueia quando apenas telefone e nascimento estão preenchidos', () => {
    const p = getCamposContatoPendentes({ telefone: TELEFONE_VALIDO, email: null, data_nascimento: NASCIMENTO_VALIDO })
    expect(p).toEqual(['email'])
  })
})
