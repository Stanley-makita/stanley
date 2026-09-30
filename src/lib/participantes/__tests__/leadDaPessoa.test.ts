import { describe, it, expect, vi } from 'vitest'
import { criarFakeDb } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { leadMaisRecenteDaPessoa } from '../leadDaPessoa'

type Chamada = { tabela: string; metodo: string; args: unknown[] }

// Stub que grava cada chamada da cadeia e devolve, por tabela, a resposta da vez (fila).
// O fakeDb compartilhado ignora order() e não simula erro do Supabase — este stub cobre isso.
function criarDbRoteiro(respostas: Record<string, Array<{ data: unknown; error: { message: string } | null }>>) {
  const chamadas: Chamada[] = []
  const from = (tabela: string) => {
    const resposta = () => respostas[tabela]?.shift() ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}
    for (const metodo of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) {
      chain[metodo] = (...args: unknown[]) => { chamadas.push({ tabela, metodo, args }); return chain }
    }
    chain.maybeSingle = () => Promise.resolve(resposta())
    chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(res, rej)
    return chain
  }
  return { from, chamadas }
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
  it('participação em lead excluído (soft delete) não conta; cai no lead ativo', async () => {
    const db = criarFakeDb({
      leads: [
        { id: 'l-del', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: '2026-09-01' },
        { id: 'l-ok', empresa_id: 'e1', pessoa_id: 'joana', deleted_at: null },
      ],
      participacoes: [
        { empresa_id: 'e1', lead_id: 'l-del', pessoa_id: 'afranio', papel: 'conjuge_anuente' },
        { empresa_id: 'e1', lead_id: 'l-ok', pessoa_id: 'afranio', papel: 'coparticipante' },
      ],
    })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'afranio')).toBe('l-ok')
  })
  it('só participação em lead excluído: null', async () => {
    const db = criarFakeDb({
      leads: [{ id: 'l-del', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: '2026-09-01' }],
      participacoes: [{ empresa_id: 'e1', lead_id: 'l-del', pessoa_id: 'afranio', papel: 'coparticipante' }],
    })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'afranio')).toBeNull()
  })
  it('vendedor não conta como lead dele', async () => {
    const db = criarFakeDb({ leads: [], participacoes: [{ empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'v', papel: 'vendedor' }] })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'v')).toBeNull()
  })
  it('participação: ordena pelos leads (created_at desc) filtrando os ids candidatos', async () => {
    const db = criarDbRoteiro({
      leads: [{ data: null, error: null }, { data: { id: 'l-novo' }, error: null }],
      participacoes: [{ data: [{ lead_id: 'l-velho' }, { lead_id: 'l-novo' }, { lead_id: 'l-velho' }], error: null }],
    })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'afranio')).toBe('l-novo')
    const doLead = db.chamadas.filter(c => c.tabela === 'leads')
    expect(doLead).toContainEqual({ tabela: 'leads', metodo: 'in', args: ['id', ['l-velho', 'l-novo']] })
    expect(doLead).toContainEqual({ tabela: 'leads', metodo: 'is', args: ['deleted_at', null] })
    expect(doLead.filter(c => c.metodo === 'order')).toEqual([
      { tabela: 'leads', metodo: 'order', args: ['created_at', { ascending: false }] },
      { tabela: 'leads', metodo: 'order', args: ['created_at', { ascending: false }] },
    ])
    // a participação não é mais ordenada pela própria data
    expect(db.chamadas.some(c => c.tabela === 'participacoes' && c.metodo === 'order')).toBe(false)
  })
  it('erro na query de leads (titular): loga e resolve null (não lança)', async () => {
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = criarDbRoteiro({ leads: [{ data: null, error: { message: 'x' } }] })
    await expect(leadMaisRecenteDaPessoa(db as never, 'e1', 'heitor')).resolves.toBeNull()
    expect(erroSpy).toHaveBeenCalled()
    erroSpy.mockRestore()
  })
  it('erro na query de participacoes: loga e resolve null', async () => {
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = criarDbRoteiro({
      leads: [{ data: null, error: null }],
      participacoes: [{ data: null, error: { message: 'y' } }],
    })
    await expect(leadMaisRecenteDaPessoa(db as never, 'e1', 'afranio')).resolves.toBeNull()
    expect(erroSpy).toHaveBeenCalled()
    erroSpy.mockRestore()
  })
  it('erro na query de leads por ids candidatos: loga e resolve null', async () => {
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = criarDbRoteiro({
      leads: [{ data: null, error: null }, { data: null, error: { message: 'z' } }],
      participacoes: [{ data: [{ lead_id: 'l1' }], error: null }],
    })
    await expect(leadMaisRecenteDaPessoa(db as never, 'e1', 'afranio')).resolves.toBeNull()
    expect(erroSpy).toHaveBeenCalled()
    erroSpy.mockRestore()
  })
})
