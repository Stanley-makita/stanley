import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, negado: false }))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return {
    supabaseAdmin: {
      from: (t: string) => criarFakeDb(estado.tabelas).from(t),
      rpc: async () => ({ data: false, error: null }),
    },
  }
})
vi.mock('@/lib/documentos/vinculosServidor', () => ({
  autenticarRota: async () => ({ usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial', nome: 'Ana' }, token: 't' }),
  verificarDestino: async () => estado.negado ? NextResponse.json({ error: 'x' }, { status: 403 }) : null,
}))

beforeEach(() => {
  estado.negado = false
  estado.tabelas = {
    leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: null }],
    pessoas: [
      { id: 'heitor', empresa_id: 'e1', nome: 'Heitor', cpf: null, deleted_at: null },
      { id: 'maria', empresa_id: 'e1', nome: 'Maria', cpf: '11144477735', deleted_at: null },
    ],
    participacoes: [],
  }
})

const req = (url: string, method: 'POST' | 'DELETE', body: unknown) => new NextRequest(`http://localhost${url}`, {
  method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body),
})
const ctx = { params: { id: 'l1' } }

describe('/api/leads/[id]/participantes', () => {
  it('POST com pessoa existente inclui; DELETE remove', async () => {
    const { POST, DELETE } = await import('../route')
    const r1 = await POST(req('/api/leads/l1/participantes', 'POST', { pessoa_id: 'maria' }), ctx)
    expect(r1.status).toBe(200)
    expect(await r1.json()).toEqual({ ok: true, pessoa_id: 'maria' })
    expect(estado.tabelas.participacoes).toEqual([expect.objectContaining({ lead_id: 'l1', pessoa_id: 'maria', papel: 'coparticipante', explicita: true })])
    const r2 = await DELETE(req('/api/leads/l1/participantes', 'DELETE', { pessoa_id: 'maria' }), ctx)
    expect(r2.status).toBe(200)
    expect(estado.tabelas.participacoes).toHaveLength(0)
  })
  it('POST com nome/CPF: reaproveita pelo CPF', async () => {
    const { POST } = await import('../route')
    const r = await POST(req('/api/leads/l1/participantes', 'POST', { nome: 'Maria S', cpf: '111.444.777-35' }), ctx)
    expect(await r.json()).toEqual({ ok: true, pessoa_id: 'maria' })
    expect(estado.tabelas.pessoas).toHaveLength(2)
  })
  it('sem permissão: 403 e nada gravado', async () => {
    estado.negado = true
    const { POST } = await import('../route')
    expect((await POST(req('/api/leads/l1/participantes', 'POST', { pessoa_id: 'maria' }), ctx)).status).toBe(403)
    expect(estado.tabelas.participacoes).toHaveLength(0)
  })
  it('pedido sem pessoa nem nome: 400', async () => {
    const { POST } = await import('../route')
    expect((await POST(req('/api/leads/l1/participantes', 'POST', {}), ctx)).status).toBe(400)
  })
})

describe('/api/leads/[id]/vendedores', () => {
  it('POST inclui vendedor; DELETE remove pelo vínculo', async () => {
    const { POST, DELETE } = await import('../../vendedores/route')
    const r1 = await POST(req('/api/leads/l1/vendedores', 'POST', { pessoa_id: 'maria' }), ctx)
    expect(r1.status).toBe(200)
    const vinc = estado.tabelas.participacoes[0]
    expect(vinc).toMatchObject({ lead_id: 'l1', pessoa_id: 'maria', papel: 'vendedor', explicita: true })
    const r2 = await DELETE(req('/api/leads/l1/vendedores', 'DELETE', { vinculo_id: vinc.id }), ctx)
    expect(r2.status).toBe(200)
    expect(estado.tabelas.participacoes).toHaveLength(0)
  })
})
