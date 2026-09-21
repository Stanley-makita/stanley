/**
 * `*salva enoque` respondia "não encontrei" (2026-09-21) porque o lead "ENOQUE FRANCISCO..." estava
 * ligado à pessoa provisória do WhatsApp do operador ("Bruno Fontinhas Assessoria") e a busca só
 * olhava pessoas.nome. Agora considera também leads.nome.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/pessoa', () => ({ buscarOuCriarPessoa: vi.fn() }))
vi.mock('@/lib/workflows/workflow-captacao', () => ({ executarWorkflowCaptacao: vi.fn() }))

function criarSupabase(pessoas: unknown[], leads: unknown[]): SupabaseClient {
  const chain = (data: unknown[]) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'not', 'ilike', 'order', 'in']) q[m] = () => q
    q.limit = () => Object.assign(Promise.resolve({ data, error: null }), {
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    })
    return q
  }
  return { from: (t: string) => chain(t === 'pessoas' ? pessoas : t === 'leads' ? leads : []) } as unknown as SupabaseClient
}

describe('buscarEntidade — nome do lead', () => {
  it('acha o cliente pelo nome do lead quando nenhuma pessoa tem esse nome', async () => {
    const { buscarEntidade } = await import('../fonti-comandos')
    const supabase = criarSupabase([], [{ id: 'lead-enoque', nome: 'ENOQUE FRANCISCO DA SILVA JUNIOR', pessoa_id: 'pessoa-bruno' }])
    const r = await buscarEntidade(supabase, 'e1', 'enoque')
    expect(r).toEqual({ tipo: 'pessoa', id: 'pessoa-bruno', label: 'ENOQUE FRANCISCO DA SILVA JUNIOR', lead_id: 'lead-enoque' })
  })

  it('não duplica quando pessoa e lead são do mesmo cliente', async () => {
    const { buscarEntidade } = await import('../fonti-comandos')
    const supabase = criarSupabase([{ id: 'p1', nome: 'Ana Souza' }], [{ id: 'l1', nome: 'Ana Souza', pessoa_id: 'p1' }])
    const r = await buscarEntidade(supabase, 'e1', 'ana')
    expect(r?.tipo).toBe('pessoa')
  })

  it('pessoa e lead de clientes diferentes viram ambiguidade', async () => {
    const { buscarEntidade } = await import('../fonti-comandos')
    const supabase = criarSupabase([{ id: 'p1', nome: 'Enoque Lima' }], [{ id: 'l2', nome: 'ENOQUE FRANCISCO', pessoa_id: 'p2' }])
    const r = await buscarEntidade(supabase, 'e1', 'enoque')
    expect(r?.tipo).toBe('ambiguo')
  })
})
