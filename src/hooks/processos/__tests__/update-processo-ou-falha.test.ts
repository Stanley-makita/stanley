/**
 * Regressão (2026-09-22): a RLS de `processos_update` (migration 20260721_183) não
 * incluía `comercial_id` — só operacional/gerente/gestor/admin podiam editar. O PostgREST
 * não lança erro quando a RLS filtra a linha do UPDATE (0 linhas afetadas, sucesso
 * silencioso), e o código só checava `if (error) throw`. Resultado real: o modal "Dados
 * do Negócio" mostrava "Dados financeiros atualizados com sucesso." pro comercial
 * responsável, mas nada era gravado (taxa_juros/sistema_amortizacao/etc continuavam
 * null). Corrigido em dois níveis: migration 20260922_315 (RLS passa a incluir
 * comercial_id) e este helper, que detecta 0 linhas afetadas e lança um erro claro em
 * vez de mascarar como sucesso — proteção pra qualquer gap de RLS futuro, não só este.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const estado = vi.hoisted(() => ({ linhasAfetadas: [] as Array<{ id: string }> }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.update = () => chain
      chain.eq = () => chain
      chain.select = () => Promise.resolve({ data: estado.linhasAfetadas, error: null })
      return chain
    },
  },
}))
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ usuario: null }) }))

describe('updateProcessoOuFalha', () => {
  beforeEach(() => { estado.linhasAfetadas = [] })

  it('lança erro claro quando o UPDATE afeta 0 linhas (RLS filtrou a linha)', async () => {
    const { updateProcessoOuFalha } = await import('../useProcessos')
    await expect(updateProcessoOuFalha('proc-1', 'e1', { taxa_juros: 11.3 }))
      .rejects.toThrow('permissão')
  })

  it('não lança quando o UPDATE afeta a linha normalmente', async () => {
    estado.linhasAfetadas = [{ id: 'proc-1' }]
    const { updateProcessoOuFalha } = await import('../useProcessos')
    await expect(updateProcessoOuFalha('proc-1', 'e1', { taxa_juros: 11.3 }))
      .resolves.toBeUndefined()
  })
})
