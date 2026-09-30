import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, erros: {} as Record<string, string> }))
vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return {
    supabaseAdmin: {
      from: (t: string) => {
        if (estado.erros[t]) {
          // tabela com erro do Supabase: toda a cadeia resolve { data: null, error }
          const resp = { data: null, error: { message: estado.erros[t] } }
          const chain: Record<string, unknown> = {}
          for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) chain[m] = () => chain
          chain.single = () => Promise.resolve(resp)
          chain.maybeSingle = () => Promise.resolve(resp)
          chain.then = (res: (v: unknown) => unknown) => Promise.resolve(resp).then(res)
          return chain
        }
        return criarFakeDb(estado.tabelas).from(t)
      },
    },
  }
})

beforeEach(() => {
  estado.erros = {}
  estado.tabelas = {
    processos: [{ id: 'p1', empresa_id: 'e1', numero_processo: '1', modalidade: 'sbpe', imovel_id: null }],
    participacoes: [
      { id: 'a', empresa_id: 'e1', processo_id: 'p1', pessoa_id: 'heitor', papel: 'titular', compoe_renda: true, ordem: 1 },
      { id: 'b', empresa_id: 'e1', processo_id: 'p1', pessoa_id: 'vend', papel: 'vendedor', compoe_renda: false, ordem: 1 },
    ],
    pessoa_relacionamentos: [],
    pessoas: [
      { id: 'heitor', nome: 'Heitor', email: 'heitor@pessoa', deleted_at: null,
        pessoa_telefones: [{ telefone: '44911111111', principal: true, ativo: true }] },
      { id: 'vend', nome: 'Vendedor', email: null, estado_civil: 'solteiro', deleted_at: null,
        conta_bancaria_banco: 'Itaú', conta_bancaria_agencia: '0001', conta_bancaria_numero: '999' },
    ],
    processo_compradores: [
      { processo_id: 'p1', pessoa_id: 'heitor', email: 'heitor@antigo', telefone: null },
    ],
    processo_vendedores: [
      { processo_id: 'p1', pessoa_id: 'vend', email: 'vend@antigo', telefone: '44922222222', estado_civil: 'casado',
        banco: 'Caixa', agencia: null, conta: '123', conjuge_nome: 'Ana', conjuge_cpf: '' },
    ],
    pessoa_fgts_contas: [],
  }
})

describe('buscarDadosFormulario (processo)', () => {
  it('campos não-nulos das linhas antigas vencem os da Pessoa; nulos/vazios não apagam', async () => {
    const { buscarDadosFormulario } = await import('../dados')
    const d = await buscarDadosFormulario('p1')

    expect(d.compradores).toHaveLength(1)
    expect(d.compradores[0].email).toBe('heitor@antigo')          // antigo vence
    expect(d.compradores[0].telefone).toBe('44911111111')          // antigo nulo → Pessoa

    expect(d.vendedores).toHaveLength(1)
    const v = d.vendedores[0]
    expect(v.banco).toBe('Caixa')         // antigo vence
    expect(v.agencia).toBe('0001')        // antigo nulo → Pessoa
    expect(v.conta).toBe('123')
    expect(v.email).toBe('vend@antigo')
    expect(v.telefone).toBe('44922222222')
    expect(v.estado_civil).toBe('casado')
    expect(v.conjuge_nome).toBe('Ana')
    expect(v.conjuge_cpf).toBeNull()      // '' não sobrescreve
  })

  it('linha antiga de outra Pessoa não vaza', async () => {
    estado.tabelas.processo_vendedores = [{ processo_id: 'p1', pessoa_id: 'outra', banco: 'BB', email: 'x@x' }]
    const { buscarDadosFormulario } = await import('../dados')
    const d = await buscarDadosFormulario('p1')
    expect(d.vendedores[0].banco).toBe('Itaú')
    expect(d.vendedores[0].email).toBeNull()
  })

  it('erro em processo_vendedores lança', async () => {
    estado.erros.processo_vendedores = 'falhou vend'
    const { buscarDadosFormulario } = await import('../dados')
    await expect(buscarDadosFormulario('p1')).rejects.toMatchObject({ message: 'falhou vend' })
  })

  it('erro em processo_compradores lança', async () => {
    estado.erros.processo_compradores = 'falhou comp'
    const { buscarDadosFormulario } = await import('../dados')
    await expect(buscarDadosFormulario('p1')).rejects.toMatchObject({ message: 'falhou comp' })
  })

  it('erro em pessoa_fgts_contas lança (antes era engolido)', async () => {
    estado.erros.pessoa_fgts_contas = 'falhou fgts'
    const { buscarDadosFormulario } = await import('../dados')
    await expect(buscarDadosFormulario('p1')).rejects.toMatchObject({ message: 'falhou fgts' })
  })
})
