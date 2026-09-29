import { describe, it, expect } from 'vitest'
import { criarFakeDb } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { leadMaisRecenteDaPessoa } from '../leadDaPessoa'

describe('leadMaisRecenteDaPessoa', () => {
  it('titular: lead onde é pessoa_id', async () => {
    const db = criarFakeDb({ leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: null }], participacoes: [] })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'heitor')).toBe('l1')
  })
  it('coparticipante: lead via participação', async () => {
    const db = criarFakeDb({
      leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: null }],
      participacoes: [{ empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'afranio', papel: 'coparticipante' }],
    })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'afranio')).toBe('l1')
  })
  it('vendedor não conta como lead dele', async () => {
    const db = criarFakeDb({ leads: [], participacoes: [{ empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'v', papel: 'vendedor' }] })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'v')).toBeNull()
  })
})
