import { describe, it, expect } from 'vitest'
import { erroDataEmissao, hojeLocalIso } from '../dataEmissao'

const hoje = new Date(2026, 10, 11) // 11/11/2026 local

describe('erroDataEmissao', () => {
  it('aceita hoje e data futura próxima (contrato emitido com data de 15/11)', () => {
    expect(erroDataEmissao('2026-11-11', hoje)).toBeNull()
    expect(erroDataEmissao('2026-11-15', hoje)).toBeNull()
  })
  it('aceita data passada recente', () => {
    expect(erroDataEmissao('2026-10-30', hoje)).toBeNull()
  })
  it('obrigatória', () => {
    expect(erroDataEmissao('', hoje)).toMatch(/Informe/)
  })
  it('recusa ano incompleto/implausível (digitação no input de data)', () => {
    expect(erroDataEmissao('0002-11-15', hoje)).toMatch(/inválida/)
    expect(erroDataEmissao('2027-11-15', hoje)).toMatch(/inválida/)
  })
  it('recusa formato errado', () => {
    expect(erroDataEmissao('15/11/2026', hoje)).toMatch(/inválida/)
  })
})

describe('hojeLocalIso', () => {
  it('AAAA-MM-DD no fuso local', () => {
    expect(hojeLocalIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
