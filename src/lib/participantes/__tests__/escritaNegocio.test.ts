import { describe, it, expect, beforeEach } from 'vitest'
import { criarFakeDb, type Row } from '@/lib/documentos/__tests__/helpers/fakeDb'
import {
  camposPermitidos, incluirLinhaNegocio, editarLinhaNegocio, removerLinhaNegocio, participantesIniciaisDoNegocio,
} from '../escritaNegocio'

let tabelas: Record<string, Row[]>
let operadores: string[]
let rpcs: string[]
// Banco falso + UNIQUE (processo_id|lead_id, pessoa_id) de participacoes no insert. A sincronização
// (pv2_sincronizar_processo) não é simulada: os testes conferem as participações incluídas de propósito.
function sb() {
  const db = criarFakeDb(tabelas)
  const from = (t: string) => {
    const q = db.from(t) as Record<string, unknown>
    if (t === 'participacoes') {
      const inserir = q.insert as (r: Row) => unknown
      q.insert = (r: Row) => (tabelas[t] ?? []).some(x => x.pessoa_id === r.pessoa_id
        && ((r.processo_id && x.processo_id === r.processo_id) || (r.lead_id && x.lead_id === r.lead_id)))
        ? Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
        : inserir(r)
    }
    return q
  }
  return {
    from,
    rpc: async (n: string, a: { p_pessoa_id?: string }) => {
      rpcs.push(n)
      return { data: n === 'pessoa_e_de_operador' ? operadores.includes(a.p_pessoa_id as string) : null, error: null }
    },
  } as never
}

const pessoa = (id: string, nome: string, extra: Row = {}) => ({ id, empresa_id: 'e1', nome, cpf: null, deleted_at: null, ...extra })
const doProcesso = () => (tabelas.participacoes ?? []).filter(p => p.processo_id === 'p1')
const papelDe = (pessoaId: string) => doProcesso().find(p => p.pessoa_id === pessoaId)?.papel

beforeEach(() => {
  operadores = []
  rpcs = []
  tabelas = {
    pessoas: [
      pessoa('heitor', 'Heitor', { cpf: '11144477735' }),
      pessoa('op', 'Comercial', { cpf: '39053344705' }),
    ],
    participacoes: [],
    pessoa_telefones: [],
    usuarios: [],
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
  it('reaproveita a Pessoa pelo CPF e a inclui de propósito; dados vazios da Pessoa são preenchidos', async () => {
    const r = await incluirLinhaNegocio(sb(), 'e1', 'p1', 'compradores', { nome: 'Heitor', cpf: '111.444.777-35', email: 'h@x.com', renda_mensal: 5000 })
    expect(r).toMatchObject({ ok: true, pessoa_id: 'heitor' })
    expect(doProcesso()).toEqual([expect.objectContaining({ pessoa_id: 'heitor', papel: 'coparticipante', explicita: true })])
    expect(tabelas.pessoas[0]).toMatchObject({ email: 'h@x.com', renda_formal: 5000 })
    expect(rpcs).toContain('pv2_sincronizar_processo')
  })
  it('sem CPF cadastrado: cria a Pessoa (toda linha tem Pessoa)', async () => {
    const r = await incluirLinhaNegocio(sb(), 'e1', 'p1', 'vendedores', { nome: 'Ilídio', banco: '001' })
    const nova = tabelas.pessoas.find(p => p.nome === 'Ilídio')!
    expect(r).toMatchObject({ ok: true, pessoa_id: nova.id })
    expect(nova).toMatchObject({ conta_bancaria_banco: '001' })
    expect(papelDe(nova.id as string)).toBe('vendedor')
  })
  it('principal: vira titular e o titular anterior fica como coparticipante', async () => {
    tabelas.pessoas.push(pessoa('maria', 'Maria'))
    tabelas.participacoes.push({ id: 'pm', empresa_id: 'e1', processo_id: 'p1', pessoa_id: 'maria', papel: 'titular', explicita: true })
    await incluirLinhaNegocio(sb(), 'e1', 'p1', 'compradores', { nome: 'Heitor', pessoa_id: 'heitor', principal: true })
    expect(papelDe('heitor')).toBe('titular')
    expect(papelDe('maria')).toBe('coparticipante')
  })
  it('CPF ou pessoa_id de operador: recusa e nada é gravado', async () => {
    operadores = ['op']
    expect(await incluirLinhaNegocio(sb(), 'e1', 'p1', 'vendedores', { nome: 'X', cpf: '39053344705' })).toMatchObject({ status: 422 })
    expect(await incluirLinhaNegocio(sb(), 'e1', 'p1', 'vendedores', { nome: 'X', pessoa_id: 'op' })).toMatchObject({ status: 422 })
    expect(doProcesso()).toHaveLength(0)
  })
  it('sem nome: recusa', async () => {
    expect(await incluirLinhaNegocio(sb(), 'e1', 'p1', 'compradores', { nome: '  ' })).toMatchObject({ status: 422 })
  })
  it('vendedor casado: cônjuge vira Pessoa própria; "proprietário" também vende', async () => {
    await incluirLinhaNegocio(sb(), 'e1', 'p1', 'vendedores', {
      nome: 'Heitor', pessoa_id: 'heitor', estado_civil: 'casado', conjuge_nome: 'Joana', conjuge_papel: 'proprietario',
    })
    const joana = tabelas.pessoas.find(p => p.nome === 'Joana')!
    expect(tabelas.pessoas.find(p => p.id === 'heitor')).toMatchObject({ conjuge_pessoa_id: joana.id })
    expect(papelDe(joana.id as string)).toBe('vendedor')
  })
})

describe('editar/remover linha (id = participação)', () => {
  beforeEach(() => {
    tabelas.pessoas[0].renda_informal = 1000
    tabelas.participacoes.push({ id: 'c1', empresa_id: 'e1', processo_id: 'p1', pessoa_id: 'heitor', papel: 'coparticipante', explicita: true })
  })
  it('renda total: mantém o informal da Pessoa e o formal completa', async () => {
    expect(await editarLinhaNegocio(sb(), 'e1', 'p1', 'compradores', 'c1', { renda_mensal: 6000 })).toEqual({ ok: true, pessoa_id: 'heitor' })
    expect(tabelas.pessoas[0]).toMatchObject({ renda_formal: 5000, renda_informal: 1000 })
  })
  it('marcar principal promove a titular', async () => {
    await editarLinhaNegocio(sb(), 'e1', 'p1', 'compradores', 'c1', { principal: true })
    expect(papelDe('heitor')).toBe('titular')
  })
  it('linha de outro negócio: 404', async () => {
    expect(await editarLinhaNegocio(sb(), 'e1', 'p2', 'compradores', 'c1', { nome: 'X' })).toMatchObject({ status: 404 })
    expect(await removerLinhaNegocio(sb(), 'e1', 'p2', 'compradores', 'c1')).toMatchObject({ status: 404 })
    expect(doProcesso()).toHaveLength(1)
  })
  it('remove', async () => {
    expect(await removerLinhaNegocio(sb(), 'e1', 'p1', 'compradores', 'c1')).toEqual({ ok: true })
    expect(doProcesso()).toHaveLength(0)
  })
  it('quem está só por casamento (derivado) não sai pela aba', async () => {
    tabelas.participacoes.push({ id: 'cj', empresa_id: 'e1', processo_id: 'p1', pessoa_id: 'x', papel: 'conjuge_anuente', explicita: false })
    expect(await removerLinhaNegocio(sb(), 'e1', 'p1', 'compradores', 'cj')).toMatchObject({ status: 422 })
  })
})

describe('participantesIniciaisDoNegocio', () => {
  const part = (pessoa_id: string, papel: string, p: Row = {}) => ({
    lead_id: 'l1', empresa_id: 'e1', pessoa_id, papel, pessoa: { deleted_at: null, ...p },
  })
  const titular = { pessoa_id: 'heitor', nome: 'Heitor', cpf: '11144477735', email: null, telefone: null }

  it('Heitor + Afrânio + Maria: titular, demais compradores e vendedor do lead, todos incluídos de propósito', async () => {
    tabelas.participacoes.push(
      part('heitor', 'titular'), part('afranio', 'coparticipante'), part('maria', 'conjuge_anuente'), part('vend', 'vendedor'),
    )
    expect(await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', { leadId: 'l1', titular, vendedores: null })).toEqual({ ok: true })
    expect(doProcesso().map(p => [p.pessoa_id, p.papel, p.explicita])).toEqual([
      ['heitor', 'titular', true], ['afranio', 'coparticipante', true], ['maria', 'coparticipante', true], ['vend', 'vendedor', true],
    ])
    expect(rpcs).toContain('pv2_sincronizar_processo')
  })

  it('vendedores escolhidos no modal têm prioridade sobre os do lead', async () => {
    tabelas.participacoes.push(part('vend', 'vendedor'))
    await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', {
      leadId: 'l1', titular, vendedores: [{ pessoa_id: 'outro', nome: 'Outro', cpf: null }],
    })
    expect(doProcesso().filter(p => p.papel === 'vendedor').map(p => p.pessoa_id)).toEqual(['outro'])
  })

  it('sem vendedor no lead: campos soltos vendedor_* viram Pessoa (com o telefone)', async () => {
    Object.assign(tabelas.leads[0], { vendedor_nome: 'Fulano', vendedor_telefone: '44999990000' })
    await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', { leadId: 'l1', titular, vendedores: [] })
    const fulano = tabelas.pessoas.find(p => p.nome === 'Fulano')!
    expect(papelDe(fulano.id as string)).toBe('vendedor')
    expect(tabelas.pessoa_telefones).toEqual([expect.objectContaining({ pessoa_id: fulano.id, telefone: '44999990000' })])
  })

  it('nunca repete Pessoa nem usa Pessoa de operador ou excluída', async () => {
    operadores = ['op']
    tabelas.participacoes.push(
      part('heitor', 'coparticipante'), part('op', 'coparticipante'), part('excluida', 'coparticipante', { deleted_at: '2026-09-01' }),
    )
    await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', { leadId: 'l1', titular, vendedores: null })
    expect(doProcesso().map(p => p.pessoa_id)).toEqual(['heitor'])
  })

  it('titular de operador: não entra', async () => {
    operadores = ['op']
    await participantesIniciaisDoNegocio(sb(), 'e1', 'p1', { leadId: null, titular: { ...titular, pessoa_id: 'op' }, vendedores: null })
    expect(doProcesso()).toHaveLength(0)
  })
})
