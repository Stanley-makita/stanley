import { describe, it, expect } from 'vitest'
import { rendaComposta } from '../renda'

const p = (id: string, papel: string, compoe: boolean, formal: number | null, informal: number | null) =>
  ({ papel: papel as never, compoe_renda: compoe, pessoa: { id, nome: id, renda_formal: formal, renda_informal: informal } })

describe('rendaComposta', () => {
  it('soma só quem compõe renda, no lado da compra', () => {
    const r = rendaComposta([
      p('heitor', 'titular', true, 5000, 1000),
      p('afranio', 'coparticipante', true, 8000, null),
      p('maria', 'conjuge_anuente', false, 3000, null),
      p('vend', 'vendedor', true, 99999, null),
    ])
    expect(r).toMatchObject({ formal: 13000, informal: 1000, total: 14000 })
    expect(r.participantes.map(x => x.pessoa_id)).toEqual(['heitor', 'afranio', 'maria'])
  })
  it('valores em texto do PostgREST (numeric) viram número', () => {
    expect(rendaComposta([p('a', 'titular', true, '1500.50' as never, null)]).total).toBe(1500.5)
  })
})
