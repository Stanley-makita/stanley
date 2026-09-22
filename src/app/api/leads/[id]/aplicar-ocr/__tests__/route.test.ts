/**
 * `/api/leads/[id]/aplicar-ocr`: além de gravar em `pessoas`, precisa propagar
 * nome/cpf/data_nascimento pro `lead` — o sidebar de Captação ("Faltando") e o
 * gate de Formulários (AbaFormularios.tsx → dadosIncompletos) leem esses campos
 * de `lead`, não de `pessoas`. Achado real (2026-09-22): data de nascimento
 * confirmada via OCR ficava só na Pessoa, sidebar continuava dizendo "Faltando"
 * pra qualquer usuário — mesma lacuna já corrigida antes só pro fluxo do
 * WhatsApp (*fonti) em workflow-captacao.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const estado = vi.hoisted(() => ({
  updatesPessoas: [] as Array<{ valores: unknown }>,
  updatesLeads:   [] as Array<{ valores: unknown }>,
  pessoaAtual:    {} as Record<string, unknown>,
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: async (token: string) =>
        token === 'token-valido'
          ? { data: { user: { id: 'auth-user-1' } }, error: null }
          : { data: { user: null }, error: new Error('inválido') },
    },
    from(tabela: string) {
      if (tabela === 'usuarios') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.single = () => Promise.resolve({ data: { id: 'usuario-1', empresa_id: 'empresa-1' }, error: null })
        return q
      }
      if (tabela === 'leads') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.maybeSingle = () => Promise.resolve({ data: { pessoa_id: 'pessoa-1' }, error: null })
        q.update = (valores: unknown) => { estado.updatesLeads.push({ valores }); return q }
        return q
      }
      if (tabela === 'pessoas') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.maybeSingle = () => Promise.resolve({ data: estado.pessoaAtual, error: null })
        q.update = (valores: unknown) => { estado.updatesPessoas.push({ valores }); return q }
        return q
      }
      if (tabela === 'pessoas_alteracoes') {
        const q: Record<string, unknown> = {}
        q.insert = () => Promise.resolve({ error: null })
        return q
      }
      if (tabela === 'documentos') {
        const q: Record<string, unknown> = {}
        q.update = () => q
        q.in = () => q
        q.eq = () => Promise.resolve({ error: null })
        return q
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    },
  },
}))

function montarRequest(body: unknown, token = 'token-valido') {
  return new NextRequest('http://localhost/api/leads/lead-1/aplicar-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  estado.updatesPessoas = []
  estado.updatesLeads = []
  estado.pessoaAtual = {}
})

describe('POST /api/leads/[id]/aplicar-ocr', () => {
  it('aplica data_nascimento na Pessoa E propaga pro Lead (sidebar/gate leem do lead)', async () => {
    const { POST } = await import('../route')
    const res = await POST(
      montarRequest({
        campos: [{ campo: 'data_nascimento', valor: '10/10/1975', documento_id: 'doc-1', confirmado: false }],
        documento_ids_revisados: ['doc-1'],
      }),
      { params: { id: 'lead-1' } } as never,
    )
    expect(res.status).toBe(200)

    expect(estado.updatesPessoas).toHaveLength(1)
    expect((estado.updatesPessoas[0].valores as Record<string, unknown>).data_nascimento).toBe('1975-10-10')

    expect(estado.updatesLeads).toHaveLength(1)
    expect((estado.updatesLeads[0].valores as Record<string, unknown>).data_nascimento).toBe('1975-10-10')
  })

  it('campo que o Lead não duplica (ex.: RG) não gera update em leads', async () => {
    const { POST } = await import('../route')
    await POST(
      montarRequest({
        campos: [{ campo: 'rg', valor: '24413', documento_id: 'doc-1', confirmado: false }],
        documento_ids_revisados: [],
      }),
      { params: { id: 'lead-1' } } as never,
    )
    expect(estado.updatesPessoas).toHaveLength(1)
    expect(estado.updatesLeads).toHaveLength(0)
  })

  it('CPF divergente: não sobrescreve Pessoa nem propaga pro Lead', async () => {
    estado.pessoaAtual = { cpf: '11111111111' }
    const { POST } = await import('../route')
    const res = await POST(
      montarRequest({
        campos: [{ campo: 'cpf', valor: '22222222222', documento_id: 'doc-1', confirmado: false }],
        documento_ids_revisados: [],
      }),
      { params: { id: 'lead-1' } } as never,
    )
    const json = await res.json()
    expect(json.cpf_divergente).toBe(true)
    expect(estado.updatesLeads).toHaveLength(0)
  })
})
