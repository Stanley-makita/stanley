import { describe, it, expect } from 'vitest'
import { deveAvancarParaProtocolado } from '../registroAutoAvanco'

describe('deveAvancarParaProtocolado', () => {
  it('avança quando status novo é protocolado, mudou e a fase atual é Preparação', () => {
    expect(deveAvancarParaProtocolado(null, 'protocolado', 'Preparação')).toBe(true)
    expect(deveAvancarParaProtocolado('em_transito', 'protocolado', 'preparacao')).toBe(true)
  })

  it('não avança se o status novo não é protocolado', () => {
    expect(deveAvancarParaProtocolado('protocolado', 'em_transito', 'Preparação')).toBe(false)
    expect(deveAvancarParaProtocolado(null, 'registrado', 'Preparação')).toBe(false)
  })

  it('não avança se o status já era protocolado (sem mudança)', () => {
    expect(deveAvancarParaProtocolado('protocolado', 'protocolado', 'Preparação')).toBe(false)
  })

  it('não avança se a fase atual não é Preparação (não retrocede Diligência/Pronto)', () => {
    expect(deveAvancarParaProtocolado(null, 'protocolado', 'Diligência')).toBe(false)
    expect(deveAvancarParaProtocolado(null, 'protocolado', 'Pronto')).toBe(false)
    expect(deveAvancarParaProtocolado(null, 'protocolado', 'Protocolado')).toBe(false)
    expect(deveAvancarParaProtocolado(null, 'protocolado', null)).toBe(false)
  })
})
