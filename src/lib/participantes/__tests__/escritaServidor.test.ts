import { describe, it, expect, beforeEach } from 'vitest'
import { criarFakeDb, type Row } from '@/lib/documentos/__tests__/helpers/fakeDb'
import {
  pessoaPorCpfOuNova, incluirParticipanteLead, removerParticipanteLead, incluirVendedorLead, removerVendedorLead,
  definirConjugeTitularLead,
} from '../escritaServidor'

let tabelas: Record<string, Row[]>
let operadores: string[]
// Banco falso + UNIQUE (lead_id, pessoa_id) das tabelas reais (migrations 210 e 276) no insert.
function sb() {
  const db = criarFakeDb(tabelas)
  const from = (t: string) => {
    const q = db.from(t) as Record<string, unknown>
    if (t === 'lead_coparticipantes' || t === 'lead_vendedores') {
      const inserir = q.insert as (r: Row) => unknown
      q.insert = (r: Row) => (tabelas[t] ?? []).some(x => x.lead_id === r.lead_id && x.pessoa_id === r.pessoa_id)
        ? Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
        : inserir(r)
    }
    return q
  }
  return { from, rpc: async (_n: string, a: { p_pessoa_id: string }) => ({ data: operadores.includes(a.p_pessoa_id), error: null }) } as never
}

beforeEach(() => {
  operadores = []
  tabelas = {
    leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: null }],
    pessoas: [
      { id: 'heitor', empresa_id: 'e1', nome: 'Heitor', cpf: null, deleted_at: null },
      { id: 'maria', empresa_id: 'e1', nome: 'Maria', cpf: '11144477735', deleted_at: null },
      { id: 'op', empresa_id: 'e1', nome: 'Comercial', cpf: '39053344705', deleted_at: null },
    ],
    lead_coparticipantes: [],
    lead_vendedores: [],
  }
})

describe('pessoaPorCpfOuNova', () => {
  it('CPF já cadastrado: reaproveita', async () => {
    expect(await pessoaPorCpfOuNova(sb(), 'e1', 'Maria S', '111.444.777-35')).toEqual({ id: 'maria' })
    expect(tabelas.pessoas).toHaveLength(3)
  })
  it('CPF de Pessoa de operador: recusa (422)', async () => {
    operadores = ['op']
    expect(await pessoaPorCpfOuNova(sb(), 'e1', 'X', '39053344705')).toMatchObject({ status: 422 })
  })
  it('sem CPF: cria só com o nome', async () => {
    const r = await pessoaPorCpfOuNova(sb(), 'e1', 'Carlos', undefined)
    expect('id' in r && tabelas.pessoas.find(p => p.id === r.id)?.nome).toBe('Carlos')
  })
})

describe('incluir/remover participante do lead', () => {
  it('inclui coparticipante e é idempotente', async () => {
    expect(await incluirParticipanteLead(sb(), 'e1', 'l1', 'maria')).toEqual({ ok: true })
    expect(await incluirParticipanteLead(sb(), 'e1', 'l1', 'maria')).toEqual({ ok: true })
    expect(tabelas.lead_coparticipantes).toHaveLength(1)
  })
  it('recusa Pessoa de operador e o próprio titular', async () => {
    operadores = ['op']
    expect(await incluirParticipanteLead(sb(), 'e1', 'l1', 'op')).toMatchObject({ status: 422 })
    expect(await incluirParticipanteLead(sb(), 'e1', 'l1', 'heitor')).toMatchObject({ status: 422 })
    expect(tabelas.lead_coparticipantes).toHaveLength(0)
  })
  it('remove só quem está na lista; nada a remover = 404', async () => {
    await incluirParticipanteLead(sb(), 'e1', 'l1', 'maria')
    expect(await removerParticipanteLead(sb(), 'e1', 'l1', 'maria')).toEqual({ ok: true })
    expect(await removerParticipanteLead(sb(), 'e1', 'l1', 'maria')).toMatchObject({ status: 404 })
  })
})

describe('vendedores do lead', () => {
  it('inclui (recusando operador) e remove pelo vínculo', async () => {
    operadores = ['op']
    expect(await incluirVendedorLead(sb(), 'e1', 'l1', 'op')).toMatchObject({ status: 422 })
    expect(await incluirVendedorLead(sb(), 'e1', 'l1', 'maria')).toEqual({ ok: true })
    const vinc = tabelas.lead_vendedores[0]
    expect(vinc).toMatchObject({ lead_id: 'l1', pessoa_id: 'maria', empresa_id: 'e1' })
    expect(await removerVendedorLead(sb(), 'e1', 'l1', vinc.id as string)).toEqual({ ok: true })
    expect(tabelas.lead_vendedores).toHaveLength(0)
  })
})

describe('cônjuge do titular do lead', () => {
  it('liga os dois lados e o ponteiro do lead; desvincular limpa os três (a sync não religa)', async () => {
    expect(await definirConjugeTitularLead(sb(), 'e1', 'l1', 'maria')).toEqual({ ok: true })
    expect(tabelas.leads[0].conjuge_pessoa_id).toBe('maria')
    expect(tabelas.pessoas.find(p => p.id === 'heitor')?.conjuge_pessoa_id).toBe('maria')
    expect(tabelas.pessoas.find(p => p.id === 'maria')?.conjuge_pessoa_id).toBe('heitor')
    expect(await definirConjugeTitularLead(sb(), 'e1', 'l1', null)).toEqual({ ok: true })
    expect(tabelas.leads[0].conjuge_pessoa_id).toBeNull()
    expect(tabelas.pessoas.find(p => p.id === 'heitor')?.conjuge_pessoa_id).toBeNull()
    expect(tabelas.pessoas.find(p => p.id === 'maria')?.conjuge_pessoa_id).toBeNull()
  })
  it('recusa Pessoa de operador como cônjuge', async () => {
    operadores = ['op']
    expect(await definirConjugeTitularLead(sb(), 'e1', 'l1', 'op')).toMatchObject({ status: 422 })
  })
})
