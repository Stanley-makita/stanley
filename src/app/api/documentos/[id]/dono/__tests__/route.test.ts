import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, negado: false }))

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
  verificarDestino: async () => estado.negado ? NextResponse.json({ error: 'x' }, { status: 403 }) : null,
  participantesDaEntidade: async () => ({ pessoaIds: ['heitor', 'afranio'], compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: 'heitor' }),
}))

beforeEach(() => {
  estado.negado = false
  estado.tabelas = {
    documentos: [
      { id: 'd1', empresa_id: 'e1', dominio: 'acervo_documental', deleted_at: null, pessoa_id: 'heitor', nome_original: 'rg-afranio.pdf', nome_exibicao: null },
      { id: 'trab', empresa_id: 'e1', dominio: 'processo_trabalho', deleted_at: null, pessoa_id: null, nome_original: 'contrato.pdf', nome_exibicao: null },
      { id: 'alheio', empresa_id: 'e1', dominio: 'acervo_documental', deleted_at: null, pessoa_id: 'estranho', nome_original: 'x.pdf', nome_exibicao: null },
    ],
    documento_vinculos: [],
    pessoas: [
      { id: 'heitor', nome: 'Heitor Almeida' },
      { id: 'afranio', nome: 'Afrânio Souza' },
    ],
    lead_historico: [],
    processo_comentarios: [],
  }
})

const req = (id: string, body: unknown) => new NextRequest(`http://localhost/api/documentos/${id}/dono`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body),
})

describe('POST /api/documentos/[id]/dono', () => {
  it('move o documento para outro participante, garante o vínculo com o lead e registra no histórico', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('d1', { entidade_tipo: 'lead', entidade_id: 'l1', pessoa_id: 'afranio' }), { params: { id: 'd1' } })
    expect(res.status).toBe(200)
    expect(estado.tabelas.documentos[0].pessoa_id).toBe('afranio')
    expect(estado.tabelas.documento_vinculos).toEqual([expect.objectContaining({ documento_id: 'd1', entidade_tipo: 'lead', entidade_id: 'l1' })])
    expect(estado.tabelas.lead_historico[0].descricao).toContain('Afrânio Souza')
  })

  it('destino que não participa da proposta: 422 e nada muda', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('d1', { entidade_tipo: 'lead', entidade_id: 'l1', pessoa_id: 'estranho' }), { params: { id: 'd1' } })
    expect(res.status).toBe(422)
    expect(estado.tabelas.documentos[0].pessoa_id).toBe('heitor')
  })

  it('documento que não é da proposta (dono de fora e sem vínculo): 422', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('alheio', { entidade_tipo: 'lead', entidade_id: 'l1', pessoa_id: 'afranio' }), { params: { id: 'alheio' } })
    expect(res.status).toBe(422)
    expect(estado.tabelas.documentos[2].pessoa_id).toBe('estranho')
  })

  it('documento de trabalho do negócio (sem dono): 400', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('trab', { entidade_tipo: 'processo', entidade_id: 'p1', pessoa_id: 'afranio' }), { params: { id: 'trab' } })
    expect(res.status).toBe(400)
  })

  it('sem permissão no lead/negócio: 403 e nada muda', async () => {
    estado.negado = true
    const { POST } = await import('../route')
    const res = await POST(req('d1', { entidade_tipo: 'lead', entidade_id: 'l1', pessoa_id: 'afranio' }), { params: { id: 'd1' } })
    expect(res.status).toBe(403)
    expect(estado.tabelas.documentos[0].pessoa_id).toBe('heitor')
  })

  it('já é dessa pessoa: 200 sem mudar nada', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('d1', { entidade_tipo: 'lead', entidade_id: 'l1', pessoa_id: 'heitor' }), { params: { id: 'd1' } })
    expect(res.status).toBe(200)
    expect(estado.tabelas.lead_historico).toHaveLength(0)
  })
})
