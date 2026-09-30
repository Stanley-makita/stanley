import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({
  tabelas: {} as Record<string, Row[]>,
  autenticado: true,
  pode: true,
  visivel: true as boolean,
}))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return { supabaseAdmin: { from: (t: string) => criarFakeDb(estado.tabelas).from(t) } }
})
vi.mock('@/lib/auth/resolverPermissaoServidor', () => ({ podeServidor: vi.fn(async () => estado.pode) }))
vi.mock('@/lib/documentos/vinculosServidor', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return {
    autenticarRota: async () => estado.autenticado
      ? { usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial', nome: 'Ana' }, token: 't' }
      : NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    // Cliente do usuário: enxerga a participação só quando `visivel` (RLS de carteira).
    clienteDoUsuario: () => criarFakeDb(estado.visivel ? estado.tabelas : { participacoes: [] }),
  }
})

beforeEach(() => {
  estado.autenticado = true
  estado.pode = true
  estado.visivel = true
  estado.tabelas = {
    participacoes: [
      { id: 'pa1', empresa_id: 'e1', lead_id: 'l1', processo_id: null, pessoa_id: 'maria', papel: 'conjuge_anuente', compoe_renda: false, compoe_renda_manual: null },
    ],
  }
})

const req = (body: unknown) => new NextRequest('http://localhost/api/participacoes/pa1', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body),
})

describe('PATCH /api/participacoes/[id]', () => {
  it('grava compõe renda e marca como manual', async () => {
    const { PATCH } = await import('../route')
    const res = await PATCH(req({ compoe_renda: true }), { params: { id: 'pa1' } })
    expect(res.status).toBe(200)
    expect(estado.tabelas.participacoes[0]).toMatchObject({ compoe_renda: true, compoe_renda_manual: true })
  })
  it('401 sem sessão', async () => {
    estado.autenticado = false
    const { PATCH } = await import('../route')
    expect((await PATCH(req({ compoe_renda: true }), { params: { id: 'pa1' } })).status).toBe(401)
  })
  it('404 quando a participação não é visível (outra carteira); nada gravado', async () => {
    estado.visivel = false
    const { PATCH } = await import('../route')
    expect((await PATCH(req({ compoe_renda: true }), { params: { id: 'pa1' } })).status).toBe(404)
    expect(estado.tabelas.participacoes[0].compoe_renda_manual).toBeNull()
  })
  it('403 sem permissão de editar o lead; nada gravado', async () => {
    estado.pode = false
    const { PATCH } = await import('../route')
    expect((await PATCH(req({ compoe_renda: true }), { params: { id: 'pa1' } })).status).toBe(403)
    expect(estado.tabelas.participacoes[0].compoe_renda_manual).toBeNull()
  })
  it('422 quando compoe_renda não é booleano', async () => {
    const { PATCH } = await import('../route')
    expect((await PATCH(req({ compoe_renda: 'sim' }), { params: { id: 'pa1' } })).status).toBe(422)
  })
})
