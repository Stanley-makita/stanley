import { describe, it, expect } from 'vitest'
import { diasCompletos, decidirAvisoParado, INTERVALO_LEMBRETE_DIAS } from '../avisoParado'

const agora = new Date('2026-11-20T12:00:00Z')
const diasAtras = (n: number) => new Date(agora.getTime() - n * 86_400_000).toISOString()

describe('diasCompletos', () => {
  it('conta dias inteiros', () => {
    expect(diasCompletos(diasAtras(5), agora)).toBe(5)
    expect(diasCompletos(new Date(agora.getTime() - 5.9 * 86_400_000).toISOString(), agora)).toBe(5)
  })
})

describe('decidirAvisoParado', () => {
  const base = { limiteDias: 5, faseAtualId: 'f1', agora }

  it('dentro do prazo: não avisa (5 dias com limite 5 = ainda não passou)', () => {
    expect(decidirAvisoParado({ ...base, entrouEm: diasAtras(5), ultimoAviso: null })).toBeNull()
  })
  it('passou do prazo e nunca avisou: primeiro aviso', () => {
    expect(decidirAvisoParado({ ...base, entrouEm: diasAtras(6), ultimoAviso: null })).toBe('primeiro')
  })
  it('já avisou nesta fase há menos de 5 dias: não repete', () => {
    expect(decidirAvisoParado({ ...base, entrouEm: diasAtras(9), ultimoAviso: { faseId: 'f1', avisadoEm: diasAtras(3) } })).toBeNull()
  })
  it(`já avisou nesta fase há ${INTERVALO_LEMBRETE_DIAS} dias: lembrete`, () => {
    expect(decidirAvisoParado({ ...base, entrouEm: diasAtras(11), ultimoAviso: { faseId: 'f1', avisadoEm: diasAtras(5) } })).toBe('lembrete')
  })
  it('aviso anterior era de outra fase: primeiro aviso desta fase', () => {
    expect(decidirAvisoParado({ ...base, entrouEm: diasAtras(6), ultimoAviso: { faseId: 'f0', avisadoEm: diasAtras(1) } })).toBe('primeiro')
  })
  it('voltou para a mesma fase depois do último aviso: conta como entrada nova', () => {
    expect(decidirAvisoParado({ ...base, entrouEm: diasAtras(6), ultimoAviso: { faseId: 'f1', avisadoEm: diasAtras(8) } })).toBe('primeiro')
  })
  it('fase sem regra (limite nulo): nunca avisa', () => {
    expect(decidirAvisoParado({ ...base, limiteDias: null, entrouEm: diasAtras(60), ultimoAviso: null })).toBeNull()
  })
})
