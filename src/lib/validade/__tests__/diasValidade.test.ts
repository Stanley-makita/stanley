import { describe, it, expect } from 'vitest'
import { dataPorDias, diasEntre, erroDiasValidade, MAX_DIAS_VALIDADE_CREDITO } from '../diasValidade'

describe('diasValidade', () => {
  it('calcula a data a partir da base (ex.: aprovação 20/08 + 60 dias)', () => {
    expect(dataPorDias('2026-08-20', 60)).toBe('2026-10-19')
    expect(dataPorDias('2026-08-20', 180)).toBe('2027-02-16')
  })

  it('calcula os dias entre a base e a data escolhida no calendário', () => {
    expect(diasEntre('2026-08-20', '2026-10-19')).toBe(60)
    expect(diasEntre('2026-08-20', '2026-08-19')).toBe(-1)
  })

  it('ida e volta batem mesmo atravessando virada de ano', () => {
    expect(diasEntre('2026-12-15', dataPorDias('2026-12-15', 45))).toBe(45)
  })

  it('valida mínimo e máximo', () => {
    expect(erroDiasValidade(null, MAX_DIAS_VALIDADE_CREDITO)).toBeNull()
    expect(erroDiasValidade(90, MAX_DIAS_VALIDADE_CREDITO)).toBeNull()
    expect(erroDiasValidade(180, MAX_DIAS_VALIDADE_CREDITO)).toBeNull()
    expect(erroDiasValidade(181, MAX_DIAS_VALIDADE_CREDITO)).toBe('Máximo de 180 dias.')
    expect(erroDiasValidade(0)).not.toBeNull()
    expect(erroDiasValidade(400)).toBeNull()
  })
})
