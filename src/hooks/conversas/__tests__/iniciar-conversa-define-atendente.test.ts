/**
 * Regressão (2026-09-22): `+ Nova` (Conversas) criava a conversa sem `atendente_id`.
 * A RLS de SELECT em `conversas` (empresa_conversas_select, migration 20260801_230) só
 * libera ver a conversa pra admin/gerente/gestor, o atendente dela, o atendente da
 * instância, um participante, ou uma conversa sem atendente E sem instância — com
 * instância definida e atendente_id nulo, quem criou (perfil comercial) ficava sem
 * conseguir ver a própria conversa (via Fonti; ela existia e recebia mensagens
 * normalmente pelo WhatsApp).
 */
import { describe, it, expect, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: 'conversa-1', error: null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: rpcMock,
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}))
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ usuario: null }) }))

describe('iniciarConversaImpl', () => {
  it('passa p_atendente_id = quem está criando a conversa', async () => {
    const { iniciarConversaImpl } = await import('../useIniciarConversa')
    await iniciarConversaImpl(
      { telefone: '44999998888', nome: 'Mileno' },
      'usuario-andresa',
      'empresa-1',
    )
    expect(rpcMock).toHaveBeenCalledWith(
      'obter_ou_criar_conversa',
      expect.objectContaining({ p_atendente_id: 'usuario-andresa' }),
    )
  })
})
