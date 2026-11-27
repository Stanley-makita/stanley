import { describe, it, expect, vi } from 'vitest'
import { calcularAlteracoes, registrarAlteracoesPessoa } from '../alteracoes'
import { eRegistroAntigo, formatarValorAlteracao, resumoCampos } from '../alteracoesExibicao'

describe('calcularAlteracoes', () => {
  it('salvar sem mudar nada não gera alteração', () => {
    const anterior = { nome: 'Arieno', email: null, renda_formal: 5000, cep: '87000000' }
    const novo = { nome: 'Arieno ', email: '', renda_formal: 5000, cep: '87000000' }
    expect(calcularAlteracoes(anterior, novo).campos).toEqual([])
  })

  it('registra só o campo que mudou, com valor anterior e novo', () => {
    const r = calcularAlteracoes(
      { nome: 'Arieno', cpf: '03096693919', email: 'a@a.com' },
      { nome: 'Arieno', cpf: '03096693919', email: 'b@b.com' },
    )
    expect(r).toEqual({ campos: ['email'], anteriores: { email: 'a@a.com' }, novos: { email: 'b@b.com' } })
  })

  it('número do banco e número do formulário com a mesma quantia não contam como mudança', () => {
    expect(calcularAlteracoes({ renda_formal: 5000 }, { renda_formal: Number('5000') }).campos).toEqual([])
  })

  it('apagar um valor conta como mudança (para vazio)', () => {
    const r = calcularAlteracoes({ profissao: 'Medico' }, { profissao: null })
    expect(r.campos).toEqual(['profissao'])
    expect(r.anteriores).toEqual({ profissao: 'Medico' })
    expect(r.novos).toEqual({ profissao: null })
  })

  it('campo não enviado (undefined) é ignorado', () => {
    expect(calcularAlteracoes({ nome: 'A' }, { nome: undefined }).campos).toEqual([])
  })

  it('campo sem valor anterior conhecido vale como vazio', () => {
    expect(calcularAlteracoes({}, { rg: '123' }).anteriores).toEqual({ rg: null })
  })
})

describe('registrarAlteracoesPessoa', () => {
  function clienteFalso() {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn(() => ({ insert })) }
    return { client: client as never, insert }
  }
  const base = { pessoaId: 'p1', empresaId: 'e1', usuarioId: 'u1', origem: 'leads' as const }

  it('não grava nada quando nada mudou', async () => {
    const { client, insert } = clienteFalso()
    await registrarAlteracoesPessoa(client, { ...base, anterior: { nome: 'A' }, novo: { nome: 'A' } })
    expect(insert).not.toHaveBeenCalled()
  })

  it('não grava quando não conseguiu ler os valores anteriores', async () => {
    const { client, insert } = clienteFalso()
    await registrarAlteracoesPessoa(client, { ...base, anterior: null, novo: { nome: 'B' } })
    expect(insert).not.toHaveBeenCalled()
  })

  it('grava só os campos alterados, com usuario_id', async () => {
    const { client, insert } = clienteFalso()
    const campos = await registrarAlteracoesPessoa(client, {
      ...base, anterior: { nome: 'A', cpf: '1' }, novo: { nome: 'B', cpf: '1' },
    })
    expect(campos).toEqual(['nome'])
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'u1', campos_alterados: ['nome'],
      valores_anteriores: { nome: 'A' }, valores_novos: { nome: 'B' }, origem: 'leads',
    }))
  })
})

describe('exibição', () => {
  it('registro sem valores anteriores é antigo', () => {
    expect(eRegistroAntigo({ campos_alterados: ['nome', 'cpf'], valores_anteriores: {} })).toBe(true)
    expect(eRegistroAntigo({ campos_alterados: ['nome'], valores_anteriores: { nome: null } })).toBe(false)
  })

  it('resumo curto dos campos', () => {
    const a = (c: string[]) => ({ campos_alterados: c, valores_anteriores: { x: 1 } })
    expect(resumoCampos(a(['cpf']))).toBe('CPF')
    expect(resumoCampos(a(['nome', 'cpf']))).toBe('Nome e CPF')
    expect(resumoCampos(a(['nome', 'cpf', 'email', 'rg', 'sexo']))).toBe('Nome, CPF, E-mail e mais 2')
  })

  it('formata datas, moeda, rótulos e vazio', () => {
    expect(formatarValorAlteracao('data_nascimento', '1981-11-29')).toBe('29/11/1981')
    expect(formatarValorAlteracao('estado_civil', 'casado')).toBe('Casado(a)')
    expect(formatarValorAlteracao('email', null)).toBe('(vazio)')
    expect(formatarValorAlteracao('renda_formal', 5000)).toMatch(/5\.000,00/)
  })
})
