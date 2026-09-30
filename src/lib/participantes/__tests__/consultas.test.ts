import { describe, it, expect } from 'vitest'
import { criarFakeDb } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { pessoasDaProposta, titularDaProposta, processosDaPessoa } from '../consultas'
import { PAPEIS_COMPRA, PAPEIS_VENDA } from '../tipos'

const base = () => criarFakeDb({
  participacoes: [
    { empresa_id: 'e1', processo_id: 'pr1', lead_id: null, pessoa_id: 'h', papel: 'titular' },
    { empresa_id: 'e1', processo_id: 'pr1', lead_id: null, pessoa_id: 'm', papel: 'conjuge_anuente' },
    { empresa_id: 'e1', processo_id: 'pr1', lead_id: null, pessoa_id: 'v', papel: 'vendedor' },
    { empresa_id: 'e1', processo_id: null, lead_id: 'l1', pessoa_id: 'h', papel: 'titular' },
    { empresa_id: 'e1', processo_id: 'pr2', lead_id: null, pessoa_id: 'h', papel: 'vendedor' },
    { empresa_id: 'e1', processo_id: 'pr3', lead_id: null, pessoa_id: 'x', papel: 'titular' },
  ],
  pessoas: [
    { id: 'h', nome: 'Heitor', cpf: '52998224725', email: 'heitor@x.com', deleted_at: null },
    { id: 'm', nome: 'Maria', cpf: null, deleted_at: null },
    { id: 'v', nome: 'Vera', cpf: null, deleted_at: null },
    { id: 'x', nome: 'Excluída', cpf: null, deleted_at: '2026-09-01' },
  ],
})

// Stub mínimo que devolve erro do Supabase (fakeDb não simula erro).
const comErro = { from: () => { const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'in', 'is', 'not', 'abortSignal']) c[m] = () => c
  c.maybeSingle = () => Promise.resolve({ data: null, error: { message: 'boom' } })
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(res)
  return c } }

describe('pessoasDaProposta', () => {
  it('filtra pela proposta e pelos papéis', async () => {
    const db = base()
    expect(await pessoasDaProposta(db as never, { tipo: 'processo', id: 'pr1' }, PAPEIS_COMPRA)).toEqual(['h', 'm'])
    expect(await pessoasDaProposta(db as never, { tipo: 'processo', id: 'pr1' }, PAPEIS_VENDA)).toEqual(['v'])
    expect(await pessoasDaProposta(db as never, { tipo: 'lead', id: 'l1' }, PAPEIS_VENDA)).toEqual([])
  })
  it('erro do banco vira exceção (nunca lista vazia silenciosa)', async () => {
    await expect(pessoasDaProposta(comErro as never, { tipo: 'processo', id: 'pr1' }, PAPEIS_COMPRA)).rejects.toThrow('participacoes: boom')
  })
})

describe('titularDaProposta', () => {
  it('Pessoa do titular', async () => {
    expect(await titularDaProposta(base() as never, { tipo: 'processo', id: 'pr1' }))
      .toEqual({ pessoa_id: 'h', nome: 'Heitor', cpf: '52998224725', email: 'heitor@x.com' })
  })
  it('titular excluído (soft delete) → null', async () => {
    expect(await titularDaProposta(base() as never, { tipo: 'processo', id: 'pr3' })).toBeNull()
  })
  it('sem titular → null', async () => {
    expect(await titularDaProposta(base() as never, { tipo: 'processo', id: 'nao-existe' })).toBeNull()
  })
  it('erro do banco vira exceção', async () => {
    await expect(titularDaProposta(comErro as never, { tipo: 'processo', id: 'pr1' })).rejects.toThrow('participacoes: boom')
  })
})

describe('processosDaPessoa', () => {
  it('só processos (nunca lead) e só os papéis pedidos', async () => {
    const db = base()
    expect(await processosDaPessoa(db as never, 'e1', 'h', PAPEIS_COMPRA)).toEqual(['pr1'])
    expect(await processosDaPessoa(db as never, 'e1', 'h', PAPEIS_VENDA)).toEqual(['pr2'])
    expect(await processosDaPessoa(db as never, 'e2', 'h', PAPEIS_COMPRA)).toEqual([])
  })
})
