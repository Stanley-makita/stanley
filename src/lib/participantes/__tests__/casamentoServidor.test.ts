import { describe, it, expect, beforeEach } from 'vitest'
import { criarFakeDb, type Row } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { registrarCasamento, normalizarRegime } from '../casamentoServidor'

let tabelas: Record<string, Row[]>
beforeEach(() => {
  tabelas = {
    pessoas: [
      { id: 'a', empresa_id: 'e1', nome: 'Afrânio', conjuge_pessoa_id: null, estado_civil: null, deleted_at: null },
      { id: 'm', empresa_id: 'e1', nome: 'Maria', conjuge_pessoa_id: null, estado_civil: null, deleted_at: null },
      { id: 'x', empresa_id: 'e1', nome: 'Xavier', conjuge_pessoa_id: 'y', estado_civil: 'casado', deleted_at: null },
      { id: 'y', empresa_id: 'e1', nome: 'Yara', conjuge_pessoa_id: 'x', estado_civil: 'casado', deleted_at: null },
    ],
  }
})
const p = (id: string) => tabelas.pessoas.find(x => x.id === id)!

describe('normalizarRegime', () => {
  it('aceita os valores do cadastro e traduz o comunhao_universal do OCR', () => {
    expect(normalizarRegime('comunhao_parcial')).toBe('comunhao_parcial')
    expect(normalizarRegime('comunhao_universal')).toBe('comunhao_total')
    expect(normalizarRegime('qualquer')).toBeNull()
    expect(normalizarRegime(null)).toBeNull()
  })
})

describe('registrarCasamento', () => {
  it('liga os dois lados com estado civil, regime e data', async () => {
    const r = await registrarCasamento(criarFakeDb(tabelas) as never, 'e1', 'a', 'm',
      { estadoCivil: 'casado', regime: 'comunhao_universal', data: '1990-05-12' })
    expect(r).toEqual({ ok: true })
    for (const [de, para] of [['a', 'm'], ['m', 'a']]) {
      expect(p(de)).toMatchObject({ conjuge_pessoa_id: para, estado_civil: 'casado', regime_casamento: 'comunhao_total', data_casamento: '1990-05-12' })
    }
  })
  it('escolhido casado com outra pessoa: pede confirmação e não grava nada', async () => {
    const r = await registrarCasamento(criarFakeDb(tabelas) as never, 'e1', 'a', 'x', { estadoCivil: 'casado', regime: null, data: null })
    expect(r).toEqual({ confirmar: [expect.objectContaining({ id: 'x' }), expect.objectContaining({ id: 'y' })] })
    expect(p('a').conjuge_pessoa_id).toBeNull()
    expect(p('x').conjuge_pessoa_id).toBe('y')
  })
  it('com confirmação: encerra o casamento antigo e liga o novo', async () => {
    const r = await registrarCasamento(criarFakeDb(tabelas) as never, 'e1', 'a', 'x',
      { estadoCivil: 'casado', regime: null, data: null, confirmarEncerrar: true })
    expect(r).toEqual({ ok: true })
    expect(p('y').conjuge_pessoa_id).toBeNull()
    expect(p('a').conjuge_pessoa_id).toBe('x')
    expect(p('x').conjuge_pessoa_id).toBe('a')
  })
  it('data inválida é ignorada (nunca grava valor quebrado)', async () => {
    await registrarCasamento(criarFakeDb(tabelas) as never, 'e1', 'a', 'm', { estadoCivil: 'casado', regime: null, data: '12/05/1990' })
    expect(p('a').data_casamento).toBeNull()
  })
})
