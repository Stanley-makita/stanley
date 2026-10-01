import { describe, it, expect, beforeEach } from 'vitest'
import { criarFakeDb, type Row } from '@/lib/documentos/__tests__/helpers/fakeDb'
import {
  pessoaPorCpfOuNova, incluirParticipanteLead, removerParticipanteLead, incluirVendedorLead, removerVendedorLead,
  definirConjugeTitularLead, casarComNovoConjuge,
} from '../escritaServidor'

let tabelas: Record<string, Row[]>
let operadores: string[]
// Banco falso + UNIQUE (lead_id, pessoa_id) de participacoes (migration 324) no insert. A sincronização
// (rpc pv2_sincronizar_lead) não é simulada: os testes conferem as participações incluídas de propósito.
function sb() {
  const db = criarFakeDb(tabelas)
  const from = (t: string) => {
    const q = db.from(t) as Record<string, unknown>
    if (t === 'participacoes') {
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
    participacoes: [],
    pessoa_telefones: [],
    usuarios: [{ id: 'u1', empresa_id: 'e1', ativo: true, telefone_whatsapp: '5544999990000', telefone: null }],
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
    expect(tabelas.participacoes).toEqual([expect.objectContaining({ lead_id: 'l1', pessoa_id: 'maria', papel: 'coparticipante', explicita: true })])
  })
  it('recusa Pessoa de operador e o próprio titular', async () => {
    operadores = ['op']
    expect(await incluirParticipanteLead(sb(), 'e1', 'l1', 'op')).toMatchObject({ status: 422 })
    expect(await incluirParticipanteLead(sb(), 'e1', 'l1', 'heitor')).toMatchObject({ status: 422 })
    expect(tabelas.participacoes).toHaveLength(0)
  })
  it('cônjuge derivado (já participa) só ganha a marca de incluído de propósito', async () => {
    tabelas.participacoes.push({ id: 'pa1', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'maria', papel: 'conjuge_anuente', explicita: false })
    expect(await incluirParticipanteLead(sb(), 'e1', 'l1', 'maria')).toEqual({ ok: true })
    expect(tabelas.participacoes).toEqual([expect.objectContaining({ id: 'pa1', papel: 'conjuge_anuente', explicita: true })])
  })
  it('vendedora não entra também na compra', async () => {
    await incluirVendedorLead(sb(), 'e1', 'l1', 'maria')
    expect(await incluirParticipanteLead(sb(), 'e1', 'l1', 'maria')).toMatchObject({ status: 422 })
  })
  it('remove só quem foi incluído de propósito; nada a remover = 404', async () => {
    tabelas.participacoes.push({ id: 'pa2', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'heitor', papel: 'titular', explicita: true })
    expect(await removerParticipanteLead(sb(), 'e1', 'l1', 'heitor')).toMatchObject({ status: 404 })
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
    const vinc = tabelas.participacoes[0]
    expect(vinc).toMatchObject({ lead_id: 'l1', pessoa_id: 'maria', empresa_id: 'e1', papel: 'vendedor', explicita: true })
    expect(await removerVendedorLead(sb(), 'e1', 'l1', vinc.id as string)).toEqual({ ok: true })
    expect(tabelas.participacoes).toHaveLength(0)
  })
  it('remover o vendedor do ponteiro antigo limpa leads.vendedor_pessoa_id (senão a sincronização devolve)', async () => {
    tabelas.leads[0].vendedor_pessoa_id = 'maria'
    tabelas.participacoes.push({ id: 'pv', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'maria', papel: 'vendedor', explicita: true })
    expect(await removerVendedorLead(sb(), 'e1', 'l1', 'pv')).toEqual({ ok: true })
    expect(tabelas.leads[0].vendedor_pessoa_id).toBeNull()
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

describe('casarComNovoConjuge', () => {
  const casamento = { estadoCivil: 'casado', regime: 'comunhao_parcial', data: '1990-05-12' }
  it('cria o cônjuge com os dados digitados e registra o casamento nos dois lados', async () => {
    const r = await casarComNovoConjuge(sb(), 'e1', 'heitor',
      { nome: 'Joana', data_nascimento: '1992-01-02', profissao: 'Professora', telefone: '44988887777', renda_formal: 3000 }, casamento)
    expect('ok' in r).toBe(true)
    const joana = tabelas.pessoas.find(p => p.nome === 'Joana')!
    expect(joana).toMatchObject({ data_nascimento: '1992-01-02', profissao: 'Professora', renda_formal: 3000, conjuge_pessoa_id: 'heitor' })
    expect(tabelas.pessoas.find(p => p.id === 'heitor')).toMatchObject({ conjuge_pessoa_id: joana.id, regime_casamento: 'comunhao_parcial' })
    expect(tabelas.pessoa_telefones).toEqual([expect.objectContaining({ pessoa_id: joana.id, telefone: '44988887777' })])
  })
  it('CPF já cadastrado: reaproveita e NUNCA sobrescreve dado existente', async () => {
    tabelas.pessoas.find(p => p.id === 'maria')!.profissao = 'Advogada'
    const r = await casarComNovoConjuge(sb(), 'e1', 'heitor', { nome: 'Maria X', cpf: '11144477735', profissao: 'Outra' }, casamento)
    expect(r).toMatchObject({ ok: true, conjugeId: 'maria' })
    expect(tabelas.pessoas.find(p => p.id === 'maria')!.profissao).toBe('Advogada')
  })
  it('telefone de usuário da equipe não vai para o cônjuge', async () => {
    await casarComNovoConjuge(sb(), 'e1', 'heitor', { nome: 'Joana', telefone: '(44) 99999-0000' }, casamento)
    expect(tabelas.pessoa_telefones).toHaveLength(0)
  })
})
