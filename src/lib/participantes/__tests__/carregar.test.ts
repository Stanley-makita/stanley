import { describe, it, expect } from 'vitest'
import { criarFakeDb } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { carregarParticipantes } from '../carregar'

describe('carregarParticipantes', () => {
  it('carrega pessoas, resolve cônjuge (inclusive de fora da proposta) e ordena titular primeiro', async () => {
    const db = criarFakeDb({
      participacoes: [
        { id: 'pa2', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'afranio', papel: 'coparticipante', compoe_renda: true, ordem: 2 },
        { id: 'pa1', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'heitor', papel: 'titular', compoe_renda: true, ordem: 1 },
        { id: 'pa9', empresa_id: 'e1', lead_id: 'outro', pessoa_id: 'x', papel: 'titular', compoe_renda: true, ordem: 1 },
      ],
      pessoa_relacionamentos: [
        { id: 'r1', pessoa_a_id: 'afranio', pessoa_b_id: 'maria', tipo: 'casamento', regime_bens: null, data_inicio: null, data_fim: null },
        { id: 'r0', pessoa_a_id: 'heitor', pessoa_b_id: 'ex', tipo: 'casamento', regime_bens: null, data_inicio: null, data_fim: '2020-01-01' },
      ],
      pessoas: [
        { id: 'heitor', nome: 'Heitor', deleted_at: null },
        { id: 'afranio', nome: 'Afrânio', deleted_at: null },
        { id: 'maria', nome: 'Maria', deleted_at: null },
        { id: 'ex', nome: 'Ex', deleted_at: null },
      ],
    })
    const r = await carregarParticipantes(db as never, { tipo: 'lead', id: 'l1' }, 'e1')
    expect(r.map(p => p.pessoa.id)).toEqual(['heitor', 'afranio'])
    expect(r[0].conjuge).toBeNull() // relacionamento encerrado não conta
    expect(r[1].conjuge?.pessoa.nome).toBe('Maria')
  })
  it('lista vazia sem participações', async () => {
    const db = criarFakeDb({ participacoes: [] })
    expect(await carregarParticipantes(db as never, { tipo: 'processo', id: 'p1' }, 'e1')).toEqual([])
  })
})
