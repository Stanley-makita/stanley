import { describe, expect, it } from 'vitest'
import { getCamposContatoPendentes, temContatoObrigatorioParaCredito } from '../leadContactValidation'

describe('lead contact validation', () => {
  it('reports missing phone and email when contact data is incomplete', () => {
    const pendentes = getCamposContatoPendentes({ telefone: null, email: '' })

    expect(pendentes).toEqual(['telefone', 'email'])
    expect(temContatoObrigatorioParaCredito({ telefone: null, email: '' })).toBe(false)
  })

  it('allows credit access when both fields are filled', () => {
    const pendentes = getCamposContatoPendentes({ telefone: '(44) 99999-9999', email: 'cliente@email.com' })

    expect(pendentes).toEqual([])
    expect(temContatoObrigatorioParaCredito({ telefone: '(44) 99999-9999', email: 'cliente@email.com' })).toBe(true)
  })
})
