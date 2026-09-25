import { describe, it, expect, vi, beforeEach } from 'vitest'
import { criarFakeDb, type Row } from './helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, pode: true }))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('./helpers/fakeDb')
  return { supabaseAdmin: { from: (t: string) => criarFakeDb(estado.tabelas).from(t) } }
})
vi.mock('@/lib/auth/resolverPermissaoServidor', () => ({ podeServidor: async () => estado.pode }))

beforeEach(() => {
  estado.pode = true
  estado.tabelas = {
    leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'titular', conjuge_pessoa_id: 'conj', deleted_at: null }],
    processo_compradores: [{ processo_id: 'pr1', empresa_id: 'e1', pessoa_id: 'comp' }, { processo_id: 'pr1', empresa_id: 'e1', pessoa_id: null }],
    processo_vendedores: [{ processo_id: 'pr1', empresa_id: 'e1', pessoa_id: 'vend' }],
  }
})

const ctx = { usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial' as const, nome: 'Ana' }, token: 't' }

describe('verificarDestino', () => {
  it('ok quando pode editar e enxerga', async () => {
    const { verificarDestino } = await import('../vinculosServidor')
    const cliente = criarFakeDb({ processos: [{ id: 'pr1', deleted_at: null }] }) as never
    expect(await verificarDestino(ctx, 'processo', 'pr1', cliente)).toBeNull()
  })
  it('403 sem permissão de editar', async () => {
    estado.pode = false
    const { verificarDestino } = await import('../vinculosServidor')
    const cliente = criarFakeDb({ processos: [{ id: 'pr1', deleted_at: null }] }) as never
    expect((await verificarDestino(ctx, 'processo', 'pr1', cliente))?.status).toBe(403)
  })
  it('403 quando a RLS esconde o lead (fora da carteira)', async () => {
    const { verificarDestino } = await import('../vinculosServidor')
    const cliente = criarFakeDb({ leads: [] }) as never
    expect((await verificarDestino(ctx, 'lead', 'l1', cliente))?.status).toBe(403)
  })
})

describe('participantesDaEntidade', () => {
  it('lead: titular + cônjuge', async () => {
    const { participantesDaEntidade } = await import('../vinculosServidor')
    expect(await participantesDaEntidade('lead', 'l1', 'e1')).toEqual({
      pessoaIds: ['titular', 'conj'], compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: 'titular',
    })
  })
  it('processo: compradores + vendedores, sem nulos', async () => {
    const { participantesDaEntidade } = await import('../vinculosServidor')
    expect(await participantesDaEntidade('processo', 'pr1', 'e1')).toEqual({
      pessoaIds: ['comp', 'vend'], compradorasIds: ['comp'], vendedorasIds: ['vend'], titularLeadPessoaId: null,
    })
  })
})
