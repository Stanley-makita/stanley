/**
 * Decisão (2026-10-02): modalidade com nome CURTO e igual em todas as telas — Captação mostrava
 * "PMCMV - Minha Casa Minha Vida" e Negócios o código cru ("PMCMV", "Pro_Cotista").
 */
import { describe, it, expect } from 'vitest'
import { rotuloModalidade, MODALIDADE_LABELS } from '../processos'

describe('rotuloModalidade', () => {
  it('nomes curtos', () => {
    expect(rotuloModalidade('PMCMV')).toBe('PMCMV')
    expect(rotuloModalidade('Pro_Cotista')).toBe('Pró-Cotista')
    expect(rotuloModalidade('Consorcio')).toBe('Consórcio')
  })
  it('aceita o código em minúsculas (RPCs de relatório)', () => {
    expect(rotuloModalidade('pro_cotista')).toBe('Pró-Cotista')
  })
  it('vazio e desconhecido', () => {
    expect(rotuloModalidade(null)).toBe('')
    expect(rotuloModalidade('Outra')).toBe('Outra')
  })
  it('nenhum rótulo leva o nome completo do programa', () => {
    for (const r of Object.values(MODALIDADE_LABELS)) expect(r).not.toMatch(/Minha Casa|FGTS/)
  })
})
