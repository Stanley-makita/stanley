import { describe, it, expect } from 'vitest'
import { rendaComposta, rendaTotalComEdicaoConjuge } from '../renda'

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

describe('rendaTotalComEdicaoConjuge', () => {
  it('sem edição em andamento (null) usa o total do servidor', () => {
    const ps = [p('heitor', 'titular', true, 5000, 0), p('maria', 'conjuge_anuente', true, 3000, 0)]
    expect(rendaTotalComEdicaoConjuge(ps, null)).toBe(8000)
  })

  it('editando cônjuge existente: compoe_renda vira true quando o valor digitado é > 0', () => {
    // servidor ainda não persistiu (compoe_renda false, renda antiga 0) — usuário está digitando
    const ps = [p('heitor', 'titular', true, 5000, 0), p('maria', 'conjuge_anuente', false, 0, 0)]
    expect(rendaTotalComEdicaoConjuge(ps, { formal: 3000, informal: 500 })).toBe(5000 + 3000 + 500)
  })

  it('editando cônjuge existente para 0: cônjuge fica excluído mesmo se antes compunha renda', () => {
    const ps = [p('heitor', 'titular', true, 5000, 0), p('maria', 'conjuge_anuente', true, 3000, 0)]
    expect(rendaTotalComEdicaoConjuge(ps, { formal: 0, informal: 0 })).toBe(5000)
  })

  it('sem participante cônjuge ainda cadastrado: soma o valor digitado direto', () => {
    const ps = [p('heitor', 'titular', true, 5000, 0)]
    expect(rendaTotalComEdicaoConjuge(ps, { formal: 3000, informal: 500 })).toBe(5000 + 3000 + 500)
  })
})
