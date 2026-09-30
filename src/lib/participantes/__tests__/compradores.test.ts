import { describe, it, expect } from 'vitest'
import { montarCompradores, montarVendedores } from '../compradores'
import type { ParticipanteCarregado } from '../tipos'

const pessoa = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nome: id.toUpperCase(), cpf: null, renda_formal: null, renda_informal: null,
  pessoa_telefones: [{ telefone: '5544999990000', principal: true, ativo: true }], ...extra,
})
const rel = (a: string, b: string) => ({ id: `r-${a}-${b}`, pessoa_a_id: a, pessoa_b_id: b, tipo: 'casamento' as const, regime_bens: 'comunhao_parcial', data_inicio: '1990-05-01' })

const heitor: ParticipanteCarregado = { participacao_id: 'p1', papel: 'titular', compoe_renda: true, ordem: 1, pessoa: pessoa('heitor'), conjuge: null }
const afranio: ParticipanteCarregado = {
  participacao_id: 'p2', papel: 'coparticipante', compoe_renda: true, ordem: 2,
  pessoa: pessoa('afranio', { estado_civil: 'casado' }),
  conjuge: { pessoa: pessoa('maria', { cpf: '52998224725', profissao: 'Professora', renda_formal: 2000 }), relacionamento: rel('afranio', 'maria') },
}
const maria: ParticipanteCarregado = {
  participacao_id: 'p3', papel: 'conjuge_anuente', compoe_renda: false, ordem: 3,
  pessoa: pessoa('maria', { estado_civil: 'casado' }), conjuge: { pessoa: pessoa('afranio'), relacionamento: rel('afranio', 'maria') },
}
const vendedor: ParticipanteCarregado = {
  participacao_id: 'p4', papel: 'vendedor', compoe_renda: false, ordem: 1,
  pessoa: pessoa('vend', { conta_bancaria_banco: '001', conta_bancaria_agencia: '1234', conta_bancaria_numero: '999' }),
  conjuge: { pessoa: pessoa('vendesposa', { cpf: '11144477735' }), relacionamento: rel('vend', 'vendesposa') },
}

describe('montarCompradores', () => {
  it('só lado da compra, titular principal e primeiro', () => {
    const r = montarCompradores([afranio, vendedor, maria, heitor])
    expect(r.map(c => c.id)).toEqual(['heitor', 'afranio', 'maria'])
    expect(r.map(c => c.principal)).toEqual([true, false, false])
  })
  it('cônjuge vem do Relacionamento: nome, cpf, regime e data do casal', () => {
    const [, a] = montarCompradores([heitor, afranio])
    expect(a.conjuge_nome).toBe('MARIA')
    expect(a.conjuge_cpf).toBe('52998224725')
    expect(a.conjuge_profissao).toBe('Professora')
    expect(a.conjuge_renda_formal).toBe(2000)
    expect(a.regime_casamento).toBe('comunhao_parcial')
    expect(a.data_casamento).toBe('1990-05-01')
  })
  it('sem relacionamento, campos de cônjuge ficam nulos', () => {
    const [h] = montarCompradores([heitor])
    expect(h.conjuge_nome).toBeNull()
    expect(h.regime_casamento).toBeNull()
  })
  it('telefone principal ativo', () => {
    expect(montarCompradores([heitor])[0].telefone).toBe('5544999990000')
  })
})

describe('montarVendedores', () => {
  it('só vendedores, com conta da Pessoa e cônjuge do Relacionamento', () => {
    const r = montarVendedores([heitor, vendedor])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'vend', banco: '001', agencia: '1234', conta: '999', conjuge_nome: 'VENDESPOSA', conjuge_cpf: '11144477735' })
  })
})
