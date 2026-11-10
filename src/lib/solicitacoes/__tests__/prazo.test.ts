import { describe, it, expect } from 'vitest'
import { prazoSugeridoParaInput, prazoInputParaIso } from '../prazo'

const agora = new Date(2026, 10, 10, 17, 20) // 10/11/2026 17:20 (hora local)

describe('prazoSugeridoParaInput', () => {
  it('Simulação = 4h, arredondado para a próxima hora cheia', () => {
    expect(prazoSugeridoParaInput('simulacao', agora)).toBe('2026-11-10T22:00')
  })
  it('Engenharia = 72h', () => {
    expect(prazoSugeridoParaInput('engenharia', agora)).toBe('2026-11-13T18:00')
  })
  it('hora já cheia não pula mais uma hora', () => {
    expect(prazoSugeridoParaInput('simulacao', new Date(2026, 10, 10, 17, 0))).toBe('2026-11-10T21:00')
  })
})

describe('prazoInputParaIso', () => {
  it('converte a hora local para ISO', () => {
    expect(prazoInputParaIso('2026-11-12T18:30', agora)).toBe(new Date(2026, 10, 12, 18, 30).toISOString())
  })
  it('vazio, lixo e ano no meio da digitação → null', () => {
    expect(prazoInputParaIso('', agora)).toBeNull()
    expect(prazoInputParaIso('abc', agora)).toBeNull()
    expect(prazoInputParaIso('0002-11-10T10:00', agora)).toBeNull()
    expect(prazoInputParaIso('2099-11-10T10:00', agora)).toBeNull()
  })
})
