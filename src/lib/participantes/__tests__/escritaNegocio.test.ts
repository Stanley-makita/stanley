import { describe, it, expect, beforeEach } from 'vitest'
import { criarFakeDb, type Row } from '@/lib/documentos/__tests__/helpers/fakeDb'
import {
  camposPermitidos, incluirLinhaNegocio, editarLinhaNegocio, removerLinhaNegocio, participantesIniciaisDoNegocio,
} from '../escritaNegocio'

let tabelas: Record<string, Row[]>
let operadores: string[]
// Banco falso + filtro `.or('cpf.eq.X,cpf.eq.Y')` (o fakeDb ignora `or`).
function sb() {
  const db = criarFakeDb(tabelas)
  const from = (t: string) => {
    const q = db.from(t) as Record<string, unknown>
    q.or = (expr: string) => (q.in as (c: string, vs: unknown[]) => unknown)('cpf', expr.split(',').map(x => x.replace(/^cpf\.eq\./, '')))
    return q
  }
  return { from, rpc: async (_n: string, a: { p_pessoa_id: string }) => ({ data: operadores.includes(a.p_pessoa_id), error: null }) } as never
}

const pessoa = (id: string, nome: string, extra: Row = {}) => ({ id, empresa_id: 'e1', nome, cpf: null, deleted_at: null, ...extra })

beforeEach(() => {
  operadores = []
  tabelas = {
    pessoas: [
      pessoa('heitor', 'Heitor', { cpf: '11144477735' }),
      pessoa('op', 'Comercial', { cpf: '39053344705' }),
    ],
    processo_compradores: [],
    processo_vendedores: [],
    participacoes: [],
    leads: [{ id: 'l1', empresa_id: 'e1', vendedor_nome: null, vendedor_cpf: null, vendedor_telefone: null, vendedor_pessoa_id: null }],
  }
})

describe('camposPermitidos', () => {
  it('descarta campos que não são da linha (embed pessoa, ids, datas)', () => {
    expect(camposPermitidos('compradores', { nome: 'A', pessoa: {}, processo_id: 'x', created_at: 'y', renda_mensal: 1 }))
      .toEqual({ nome: 'A', renda_mensal: 1 })
    expect(camposPermitidos('vendedores', { banco: '1', renda_mensal: 5 })).toEqual({ banco: '1' })
  })
})

describe('incluirLinhaNegocio', () => {
  it('vincula a Pessoa pelo CPF', async () => {
    const r = await incluirLinhaNegocio(sb(), 'e1', 'p1', 'compradores', { nome: 'Heitor', cpf: '111.444.777-35' })
    expect(r).toMatchObject({ ok: true, pessoa_id: 'heitor' })
    expect(tabelas.processo_compradores[0]).toMatchObject({ processo_id: 'p1', empresa_id: 'e1', pessoa_id: 'heitor' })
  })
  it('CPF de operador: inclui sem vincular a Pessoa', async () => {
    operadores = ['op']
    const r = await incluirLinhaNegocio(sb(), 'e1', 'p1', 'vendedores', { nome: 'X', cpf: '39053344705' })
    expect(r).toMatchObject({ ok: true, pessoa_id: null })
  })
  it('pessoa_id de operador: recusa', async () => {
    operadores = ['op']
    expect(await incluirLinhaNegocio(sb(), 'e1', 'p1', 'vendedores', { nome: 'X', pessoa_id: 'op' })).toMatchObject({ status: 422 })
    expect(tabelas.processo_vendedores).toHaveLength(0)
  })
  it('sem nome: recusa', async () => {
    expect(await incluirLinhaNegocio(sb(), 'e1', 'p1', 'compradores', { nome: '  ' })).toMatchObject({ status: 422 })
  })
})

describe('editar/remover linha', () => {
  beforeEach(() => {
    tabelas.processo_compradores.push({ id: 'c1', processo_id: 'p1', empresa_id: 'e1', pessoa_id: null, nome: 'H', cpf: null })
  })
  it('edita e vincula pelo CPF novo; não troca pessoa_id por edição', async () => {
    const r = await editarLinhaNegocio(sb(), 'e1', 'p1', 'compradores', 'c1', { nome: 'Heitor', cpf: '11144477735', pessoa_id: 'outra' })
    expect(r).toEqual({ ok: true, pessoa_id: 'heitor' })
    expect(tabelas.processo_compradores[0]).toMatchObject({ nome: 'Heitor', pessoa_id: 'heitor' })
  })
  it('linha de outro negócio: 404', async () => {
    expect(await editarLinhaNegocio(sb(), 'e1', 'p2', 'compradores', 'c1', { nome: 'X' })).toMatchObject({ status: 404 })
    expect(await removerLinhaNegocio(sb(), 'e1', 'p2', 'compradores', 'c1')).toMatchObject({ status: 404 })
    expect(tabelas.processo_compradores).toHaveLength(1)
  })
  it('remove', async () => {
    expect(await removerLinhaNegocio(sb(), 'e1', 'p1', 'compradores', 'c1')).toEqual({ ok: true })
    expect(tabelas.processo_compradores).toHaveLength(0)
  })
})

describe('participantesIniciaisDoNegocio', () => {
  const part = (pessoa_id: string, papel: string, p: Row) => ({
    lead_id: 'l1', empresa_id: 'e1', pessoa_id, papel, pessoa: { cpf: null, renda_formal: null, renda_informal: null, deleted_at: null, ...p },
  })
  const titular = { pessoa_id: 'heitor', nome: 'Heitor', cpf: '11144477735', email: null, telefone: null }

  it('Heitor + Afrânio + Maria: titular principal, demais compradores com renda, vendedor do lead', async () => {
    tabelas.participacoes.push(
      part('heitor', 'titular', { nome: 'Heitor' }),
      part('afranio', 'coparticipante', { nome: 'Afrânio', renda_formal: 3000, renda_informal: 500 }),
      part('maria', 'conjuge_anuente', { nome: 'Maria' }),
      part('vend', 'vendedor', { nome: 'Ilídio', cpf: '52998224725' }),
    )
    expect(await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', { leadId: 'l1', titular, vendedores: null })).toEqual({ ok: true })
    expect(tabelas.processo_compradores.map(c => [c.pessoa_id, c.principal, c.renda_mensal ?? null])).toEqual([
      ['heitor', true, null], ['afranio', false, 3500], ['maria', false, null],
    ])
    expect(tabelas.processo_vendedores).toEqual([expect.objectContaining({ pessoa_id: 'vend', nome: 'Ilídio', processo_id: 'p1' })])
  })

  it('vendedores escolhidos no modal têm prioridade sobre os do lead', async () => {
    tabelas.participacoes.push(part('vend', 'vendedor', { nome: 'Ilídio' }))
    await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', {
      leadId: 'l1', titular, vendedores: [{ pessoa_id: 'outro', nome: 'Outro', cpf: null }],
    })
    expect(tabelas.processo_vendedores.map(v => v.pessoa_id)).toEqual(['outro'])
  })

  it('sem vendedor no lead: campos soltos vendedor_* (comportamento anterior)', async () => {
    Object.assign(tabelas.leads[0], { vendedor_nome: 'Fulano', vendedor_telefone: '44999990000' })
    await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', { leadId: 'l1', titular, vendedores: [] })
    expect(tabelas.processo_vendedores).toEqual([expect.objectContaining({ nome: 'Fulano', telefone: '44999990000', pessoa_id: null })])
  })

  it('nunca repete Pessoa nem usa Pessoa de operador', async () => {
    operadores = ['op']
    tabelas.participacoes.push(
      part('heitor', 'coparticipante', { nome: 'Heitor' }),
      part('op', 'coparticipante', { nome: 'Comercial' }),
      part('excluida', 'coparticipante', { nome: 'X', deleted_at: '2026-09-01' }),
    )
    await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', { leadId: 'l1', titular, vendedores: null })
    expect(tabelas.processo_compradores.map(c => c.pessoa_id)).toEqual(['heitor'])
  })

  it('titular de operador: entra sem vincular a Pessoa', async () => {
    operadores = ['op']
    await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', {
      leadId: null, titular: { ...titular, pessoa_id: 'op' }, vendedores: null,
    })
    expect(tabelas.processo_compradores).toEqual([expect.objectContaining({ pessoa_id: null, principal: true })])
  })
})
