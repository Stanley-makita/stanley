import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, participantes: null as unknown }))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return { supabaseAdmin: { from: (t: string) => criarFakeDb(estado.tabelas).from(t) } }
})
vi.mock('@/lib/documentos/vinculosServidor', () => ({
  autenticarRota: async () => ({ usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial', nome: 'Ana' }, token: 't' }),
  verificarDestino: async () => null,
  participantesDaEntidade: async () => estado.participantes,
}))

const d = (id: string, pessoa: string, recebido: string, extra: Row = {}): Row => ({
  id, empresa_id: 'e1', dominio: 'acervo_documental', deleted_at: null, pessoa_id: pessoa, nome_original: `${id}.pdf`, nome_exibicao: null, classificacao_legado: 'rg', recebido_em: recebido, ...extra,
})

beforeEach(() => {
  estado.tabelas = {
    pessoas: [{ id: 'titular', nome: 'Joao' }, { id: 'conj', nome: 'Maria' }],
    documentos: [
      d('t-solto', 'titular', '2026-09-01'),          // titular sem vínculo de lead → já aparece em "Sem pasta": oculto
      d('t-outro-lead', 'titular', '2026-09-02'),     // vinculado a OUTRO lead → candidato
      d('t-aqui', 'titular', '2026-09-03'),           // já vinculado a este lead → fora
      d('c1', 'conj', '2026-09-04'),                  // cônjuge → candidato
      d('c-exc', 'conj', '2026-09-05', { deleted_at: '2026-09-06' }),
    ],
    documento_vinculos: [
      { documento_id: 't-outro-lead', entidade_tipo: 'lead', entidade_id: 'l-antigo' },
      { documento_id: 't-aqui', entidade_tipo: 'lead', entidade_id: 'l1' },
    ],
  }
  estado.participantes = { pessoaIds: ['titular', 'conj'], compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: 'titular' }
})

const req = (q: string) => new NextRequest(`http://localhost/api/documentos/vinculos/candidatos?${q}`, { headers: { Authorization: 'Bearer t' } })

describe('GET candidatos', () => {
  it('lead: cônjuge + titular preso a outro lead; oculta titular solto e o que já está aqui', async () => {
    const { GET } = await import('../candidatos/route')
    const res = await GET(req('entidade_tipo=lead&entidade_id=l1'))
    expect(await res.json()).toEqual({
      pessoas: [
        { pessoa_id: 'titular', nome: 'Joao', documentos: [{ id: 't-outro-lead', nome: 't-outro-lead.pdf', classificacao: 'rg', recebido_em: '2026-09-02' }] },
        { pessoa_id: 'conj', nome: 'Maria', documentos: [{ id: 'c1', nome: 'c1.pdf', classificacao: 'rg', recebido_em: '2026-09-04' }] },
      ],
    })
  })

  it('processo: todo acervo solto das pessoas entra (não há ocultos)', async () => {
    estado.participantes = { pessoaIds: ['titular'], compradorasIds: ['titular'], vendedorasIds: [], titularLeadPessoaId: null }
    const { GET } = await import('../candidatos/route')
    const res = await GET(req('entidade_tipo=processo&entidade_id=pr1'))
    const json = await res.json() as { pessoas: { documentos: { id: string }[] }[] }
    expect(json.pessoas[0].documentos.map(x => x.id)).toEqual(['t-solto', 't-outro-lead', 't-aqui'])
  })

  it('400 sem entidade válida', async () => {
    const { GET } = await import('../candidatos/route')
    expect((await GET(req('entidade_tipo=x&entidade_id=l1'))).status).toBe(400)
  })
})
