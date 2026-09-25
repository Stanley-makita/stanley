import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, destinoNegado: false }))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return {
    supabaseAdmin: {
      from: (t: string) => criarFakeDb(estado.tabelas, { unicos: { documento_vinculos: ['documento_id', 'entidade_tipo', 'entidade_id'] } }).from(t),
    },
  }
})
vi.mock('@/lib/documentos/vinculosServidor', () => ({
  autenticarRota: async () => ({ usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial', nome: 'Ana' }, token: 't' }),
  verificarDestino: async () => estado.destinoNegado ? NextResponse.json({ error: 'x' }, { status: 403 }) : null,
  participantesDaEntidade: async () => ({ pessoaIds: ['comp'], compradorasIds: ['comp'], vendedorasIds: [], titularLeadPessoaId: null }),
}))

const doc = (id: string, extra: Row = {}): Row => ({
  id, empresa_id: 'e1', dominio: 'acervo_documental', deleted_at: null, pessoa_id: 'comp', classificacao_legado: 'rg', nome_original: `${id}.pdf`, nome_exibicao: null, ...extra,
})

beforeEach(() => {
  estado.destinoNegado = false
  estado.tabelas = {
    documentos: [doc('d1'), doc('d2'), doc('trab', { dominio: 'processo_trabalho' }), doc('outra', { empresa_id: 'e2' })],
    documento_vinculos: [{ id: 'v0', empresa_id: 'e1', documento_id: 'd2', entidade_tipo: 'processo', entidade_id: 'pr1', pasta_id: 'escolhida-pelo-operador' }],
    catalogo_pastas_processo: [{ id: 'pasta-comp', codigo: 'comprador' }],
    catalogo_tipos_documento: [{ codigo: 'rg', pasta_sugerida_codigo: 'comprador' }],
    lead_historico: [],
    processo_comentarios: [],
  }
})

const req = (method: 'POST' | 'DELETE', body: unknown) => new NextRequest('http://localhost/api/documentos/vinculos', {
  method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body),
})

describe('POST /api/documentos/vinculos', () => {
  it('vincula válidos com pasta, conta os que já existiam e recusa o resto sem mexer no dono', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('POST', { documento_ids: ['d1', 'd2', 'trab', 'outra'], entidade_tipo: 'processo', entidade_id: 'pr1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      vinculados: 1, ja_existiam: 1,
      recusados: [{ documento_id: 'trab', motivo: 'documento_de_trabalho' }, { documento_id: 'outra', motivo: 'outra_empresa' }],
    })
    const vinc = estado.tabelas.documento_vinculos
    expect(vinc.find(v => v.documento_id === 'd1')).toMatchObject({ entidade_tipo: 'processo', entidade_id: 'pr1', pasta_id: 'pasta-comp', vinculado_por: 'u1', empresa_id: 'e1' })
    // Já existia: pasta escolhida pelo operador preservada.
    expect(vinc.find(v => v.documento_id === 'd2')?.pasta_id).toBe('escolhida-pelo-operador')
    expect(estado.tabelas.documentos.every(d => d.pessoa_id === 'comp')).toBe(true)
  })

  it('403 do destino: nada gravado', async () => {
    estado.destinoNegado = true
    const { POST } = await import('../route')
    const res = await POST(req('POST', { documento_ids: ['d1'], entidade_tipo: 'lead', entidade_id: 'l1' }))
    expect(res.status).toBe(403)
    expect(estado.tabelas.documento_vinculos).toHaveLength(1)
  })

  it('400 com entidade_tipo inválido ou lista vazia', async () => {
    const { POST } = await import('../route')
    expect((await POST(req('POST', { documento_ids: ['d1'], entidade_tipo: 'lead_historico', entidade_id: 'x' }))).status).toBe(400)
    expect((await POST(req('POST', { documento_ids: [], entidade_tipo: 'lead', entidade_id: 'l1' }))).status).toBe(400)
  })
})

describe('DELETE /api/documentos/vinculos', () => {
  it('remove só o vínculo, mantém o documento e registra no histórico do negócio', async () => {
    const { DELETE } = await import('../route')
    const res = await DELETE(req('DELETE', { documento_id: 'd2', entidade_tipo: 'processo', entidade_id: 'pr1' }))
    expect(res.status).toBe(200)
    expect(estado.tabelas.documento_vinculos).toHaveLength(0)
    expect(estado.tabelas.documentos.find(d => d.id === 'd2')?.deleted_at).toBeNull()
    expect(estado.tabelas.processo_comentarios[0]).toMatchObject({ processo_id: 'pr1', usuario_id: 'u1', tipo: 'alteracao' })
    expect(String(estado.tabelas.processo_comentarios[0].texto)).toContain('d2.pdf')
  })

  it('lead: registra em lead_historico', async () => {
    estado.tabelas.documento_vinculos.push({ id: 'v1', empresa_id: 'e1', documento_id: 'd1', entidade_tipo: 'lead', entidade_id: 'l1', pasta_id: null })
    const { DELETE } = await import('../route')
    await DELETE(req('DELETE', { documento_id: 'd1', entidade_tipo: 'lead', entidade_id: 'l1' }))
    expect(estado.tabelas.lead_historico[0]).toMatchObject({ lead_id: 'l1', tipo: 'acao_operacional', usuario_id: 'u1' })
  })

  it('recusa remover documento de trabalho do negócio (400) e não apaga o vínculo', async () => {
    estado.tabelas.documento_vinculos.push({ id: 'v2', empresa_id: 'e1', documento_id: 'trab', entidade_tipo: 'processo', entidade_id: 'pr1', pasta_id: null })
    const { DELETE } = await import('../route')
    const res = await DELETE(req('DELETE', { documento_id: 'trab', entidade_tipo: 'processo', entidade_id: 'pr1' }))
    expect(res.status).toBe(400)
    expect(estado.tabelas.documento_vinculos.some(v => v.documento_id === 'trab')).toBe(true)
  })

  it('404 quando o vínculo não existe', async () => {
    const { DELETE } = await import('../route')
    expect((await DELETE(req('DELETE', { documento_id: 'd1', entidade_tipo: 'processo', entidade_id: 'pr1' }))).status).toBe(404)
  })
})
