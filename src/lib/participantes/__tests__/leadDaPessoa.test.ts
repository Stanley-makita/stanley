import { describe, it, expect, vi } from 'vitest'
import { criarFakeDb } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { leadMaisRecenteDaPessoa } from '../leadDaPessoa'

// Stub mínimo cujo from('leads') devolve um erro na query — o fakeDb compartilhado não
// tem como simular erro do Supabase, então este stub cobre só esse caminho.
function criarDbComErroEmLeads() {
  const chainErro: Record<string, unknown> = {}
  const encadeia = () => chainErro
  Object.assign(chainErro, {
    select: encadeia, eq: encadeia, is: encadeia, order: encadeia, limit: encadeia,
    maybeSingle: () => Promise.resolve({ data: null, error: { message: 'x' } }),
  })
  return { from: () => chainErro }
}

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
  it('erro na query de leads: loga e resolve null (não lança)', async () => {
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = criarDbComErroEmLeads()
    await expect(leadMaisRecenteDaPessoa(db as never, 'e1', 'heitor')).resolves.toBeNull()
    expect(erroSpy).toHaveBeenCalled()
    erroSpy.mockRestore()
  })
})
