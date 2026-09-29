import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]> }))
vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return { supabaseAdmin: { from: (t: string) => criarFakeDb(estado.tabelas).from(t) } }
})

beforeEach(() => {
  estado.tabelas = {
    leads: [{ id: 'l1', empresa_id: 'e1', nome: 'Lead', pessoa_id: 'heitor', cidade_imovel: 'Maringá', conjuge_nome: 'NÃO USAR' }],
    participacoes: [
      { id: 'a', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'heitor', papel: 'titular', compoe_renda: true, ordem: 1 },
      { id: 'b', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'afranio', papel: 'coparticipante', compoe_renda: true, ordem: 2 },
    ],
    pessoa_relacionamentos: [{ id: 'r', pessoa_a_id: 'afranio', pessoa_b_id: 'maria', tipo: 'casamento', regime_bens: 'comunhao_parcial', data_inicio: null, data_fim: null }],
    pessoas: [
      { id: 'heitor', nome: 'Heitor', deleted_at: null },
      { id: 'afranio', nome: 'Afrânio', deleted_at: null },
      { id: 'maria', nome: 'Maria', deleted_at: null },
    ],
    pessoa_fgts_contas: [],
  }
})

describe('buscarDadosFormularioLead', () => {
  it('compradores = participações; cônjuge do coparticipante pelo Relacionamento; campos soltos do lead ignorados', async () => {
    const { buscarDadosFormularioLead } = await import('../dados-lead')
    const d = await buscarDadosFormularioLead('l1')
    expect(d.compradores.map(c => c.nome)).toEqual(['Heitor', 'Afrânio'])
    expect(d.compradores[0].principal).toBe(true)
    expect(d.compradores[0].conjuge_nome).toBeNull()
    expect(d.compradores[1].conjuge_nome).toBe('Maria')
    expect(d.compradores[1].regime_casamento).toBe('comunhao_parcial')
  })
})
