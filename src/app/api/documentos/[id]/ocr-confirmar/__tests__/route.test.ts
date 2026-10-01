import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({
  tabelas: {} as Record<string, Row[]>,
  visiveis: ['heitor', 'afranio', 'maria-existente'] as string[],
  operador: [] as string[],
  podeEditarLead: true,
}))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return {
    supabaseAdmin: {
      from: (t: string) => criarFakeDb(estado.tabelas).from(t),
      rpc: async (_nome: string, args: { p_pessoa_id: string }) => ({ data: estado.operador.includes(args.p_pessoa_id), error: null }),
    },
  }
})
vi.mock('@/lib/auth/resolverPermissaoServidor', () => ({ podeServidor: vi.fn(async () => estado.podeEditarLead) }))
vi.mock('@/lib/pessoa', () => ({ resolverPessoaConjuge: vi.fn(async () => 'conjuge-antigo') }))
vi.mock('@/lib/documentos/vinculosServidor', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return {
    autenticarRota: async () => ({ usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial', nome: 'Ana' }, token: 't' }),
    // Cliente do usuário: só enxerga as Pessoas em `visiveis` (RLS de carteira) e os leads.
    clienteDoUsuario: () => criarFakeDb({
      pessoas: estado.tabelas.pessoas.filter(p => estado.visiveis.includes(p.id as string)),
      leads: estado.tabelas.leads,
    }),
  }
})

beforeEach(() => {
  estado.visiveis = ['heitor', 'afranio', 'maria-existente']
  estado.operador = []
  estado.podeEditarLead = true
  estado.tabelas = {
    documentos: [{ id: 'd1', empresa_id: 'e1', pessoa_id: 'heitor', status_ocr: 'concluido', ocr_status: 'concluido' }],
    extracoes_ocr: [{ documento_id: 'd1', vigente: true, dados: {}, dados_validados: null }],
    pessoas: [
      { id: 'heitor', empresa_id: 'e1', nome: 'Heitor', cpf: null, deleted_at: null },
      { id: 'afranio', empresa_id: 'e1', nome: 'Afrânio', cpf: null, deleted_at: null },
      { id: 'maria-existente', empresa_id: 'e1', nome: 'Maria Souza', cpf: '11144477735', deleted_at: null },
      { id: 'operador', empresa_id: 'e1', nome: 'Comercial', cpf: '39053344705', deleted_at: null },
    ],
    leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: null }],
    participacoes: [],
    pessoa_documentos_identificacao: [],
  }
})

const req = (body: unknown) => new NextRequest('http://localhost/api/documentos/d1/ocr-confirmar', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body),
})
const ctx = { params: { id: 'd1' } }
const pessoa = (id: string) => estado.tabelas.pessoas.find(p => p.id === id)!
const doc = () => estado.tabelas.documentos[0]

describe('POST /api/documentos/[id]/ocr-confirmar — de quem é o documento', () => {
  it('participante escolhido: dados vão para ele e o documento passa a ser dele', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({ campos: { nome: 'Afrânio Souza', data_nascimento: '1964-08-02' }, tipo_confirmado: 'rg', pessoa_alvo_id: 'afranio' }), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ alvo_pessoa_id: 'afranio', alvo_nome: 'Afrânio Souza' })
    expect(pessoa('afranio')).toMatchObject({ nome: 'Afrânio Souza', data_nascimento: '1964-08-02' })
    expect(pessoa('heitor').nome).toBe('Heitor')
    expect(doc().pessoa_id).toBe('afranio')
  })

  it('participante não visível ao usuário: 404 e nada gravado', async () => {
    estado.visiveis = ['heitor']
    const { POST } = await import('../route')
    const res = await POST(req({ campos: { nome: 'X' }, pessoa_alvo_id: 'afranio' }), ctx)
    expect(res.status).toBe(404)
    expect(pessoa('afranio').nome).toBe('Afrânio')
    expect(doc().pessoa_id).toBe('heitor')
  })

  it('novo participante com CPF já cadastrado: reaproveita a Pessoa (não duplica) e inclui no lead', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({
      campos: { nome: 'Maria Souza', cpf: '111.444.777-35' }, tipo_confirmado: 'rg',
      novo_participante: { nome: 'Maria Souza', cpf: '111.444.777-35' }, lead_id: 'l1',
    }), ctx)
    expect(res.status).toBe(200)
    expect(estado.tabelas.pessoas).toHaveLength(4)
    expect(estado.tabelas.participacoes).toEqual([expect.objectContaining({ lead_id: 'l1', pessoa_id: 'maria-existente', explicita: true })])
    expect(doc().pessoa_id).toBe('maria-existente')
  })

  it('caso real: nome parecido com quem já está na proposta (sem CPF) → 409 pergunta; confirmar_novo cria', async () => {
    estado.tabelas.pessoas.push({ id: 'andre', empresa_id: 'e1', nome: 'ANDRE LUIZ DE OLIVEIRA COPULLA', cpf: null, deleted_at: null })
    estado.tabelas.participacoes.push({ id: 'pa-andre', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'andre', papel: 'titular', explicita: false,
      pessoa: { id: 'andre', nome: 'ANDRE LUIZ DE OLIVEIRA COPULLA', cpf: null, deleted_at: null } })
    const { POST } = await import('../route')
    const corpo = { campos: { nome: 'ANDRÉ LUIZ DE OLIVEIRA COPPULA', cpf: '064.898.399-46' }, tipo_confirmado: 'rg',
      novo_participante: { nome: 'ANDRÉ LUIZ DE OLIVEIRA COPPULA', cpf: '064.898.399-46' }, lead_id: 'l1' }
    const total = estado.tabelas.pessoas.length
    const r1 = await POST(req(corpo), ctx)
    expect(r1.status).toBe(409)
    expect(await r1.json()).toMatchObject({ parecido: { pessoa_id: 'andre', nome: 'ANDRE LUIZ DE OLIVEIRA COPULLA' } })
    expect(estado.tabelas.pessoas).toHaveLength(total) // nada criado
    const r2 = await POST(req({ ...corpo, confirmar_novo: true }), ctx)
    expect(r2.status).toBe(200)
    expect(estado.tabelas.pessoas).toHaveLength(total + 1)
  })

  it('novo participante sem cadastro: cria a Pessoa e inclui no lead', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({
      campos: { nome: 'Carlos Pereira' }, novo_participante: { nome: 'Carlos Pereira' }, lead_id: 'l1',
    }), ctx)
    expect(res.status).toBe(200)
    const novo = estado.tabelas.pessoas.find(p => p.nome === 'Carlos Pereira')
    expect(novo).toBeTruthy()
    expect(estado.tabelas.participacoes[0]).toMatchObject({ lead_id: 'l1', pessoa_id: novo!.id })
    expect(doc().pessoa_id).toBe(novo!.id)
  })

  it('novo participante cujo CPF é de Pessoa de operador: 422 e nada gravado', async () => {
    estado.operador = ['operador']
    const { POST } = await import('../route')
    const res = await POST(req({
      campos: { nome: 'Comercial' }, novo_participante: { nome: 'Comercial', cpf: '390.533.447-05' }, lead_id: 'l1',
    }), ctx)
    expect(res.status).toBe(422)
    expect(estado.tabelas.participacoes).toHaveLength(0)
    expect(doc().pessoa_id).toBe('heitor')
  })

  it('novo participante sem permissão de editar o lead: 403', async () => {
    estado.podeEditarLead = false
    const { POST } = await import('../route')
    const res = await POST(req({ campos: { nome: 'Carlos' }, novo_participante: { nome: 'Carlos' }, lead_id: 'l1' }), ctx)
    expect(res.status).toBe(403)
    expect(estado.tabelas.participacoes).toHaveLength(0)
  })

  it('certidão de casamento: registra o casamento dos dois lados com data e regime (universal → total)', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({
      campos: { estado_civil: 'casado', regime_casamento: 'comunhao_universal', data_casamento: '1990-05-12' },
      tipo_confirmado: 'certidao_casamento', pessoa_alvo_id: 'afranio', casamento: { conjuge_pessoa_id: 'maria-existente' },
    }), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ casamento: 'registrado' })
    expect(pessoa('afranio')).toMatchObject({ conjuge_pessoa_id: 'maria-existente', regime_casamento: 'comunhao_total', data_casamento: '1990-05-12', estado_civil: 'casado' })
    expect(pessoa('maria-existente')).toMatchObject({ conjuge_pessoa_id: 'afranio', regime_casamento: 'comunhao_total' })
  })

  it('certidão com cônjuge novo: reaproveita pelo CPF ou cria, e liga o casamento', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({
      campos: { estado_civil: 'casado' }, tipo_confirmado: 'certidao_casamento', pessoa_alvo_id: 'afranio',
      casamento: { novo: { nome: 'Joana Lima' } },
    }), ctx)
    expect(res.status).toBe(200)
    const joana = estado.tabelas.pessoas.find(p => p.nome === 'Joana Lima')!
    expect(joana.conjuge_pessoa_id).toBe('afranio')
    expect(pessoa('afranio').conjuge_pessoa_id).toBe(joana.id)
  })

  it('certidão cujo cônjuge já é casado com outra pessoa: dados salvos, casamento pendente de confirmação', async () => {
    estado.tabelas.pessoas.push({ id: 'z', empresa_id: 'e1', nome: 'Zé', conjuge_pessoa_id: 'maria-existente', deleted_at: null })
    pessoa('maria-existente').conjuge_pessoa_id = 'z'
    const { POST } = await import('../route')
    const res = await POST(req({
      campos: { data_casamento: '1990-05-12' }, tipo_confirmado: 'certidao_casamento', pessoa_alvo_id: 'afranio',
      casamento: { conjuge_pessoa_id: 'maria-existente' },
    }), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ casamento: 'confirmar', casamento_encerra: expect.arrayContaining([expect.objectContaining({ id: 'z' })]) })
    expect(pessoa('afranio').conjuge_pessoa_id ?? null).toBeNull()
  })

  it('sem escolha: grava no dono atual e o documento não muda de dono (comportamento antigo)', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({ campos: { nome: 'Heitor Almeida' } }), ctx)
    expect(res.status).toBe(200)
    expect(pessoa('heitor').nome).toBe('Heitor Almeida')
    expect(doc().pessoa_id).toBe('heitor')
  })
})
