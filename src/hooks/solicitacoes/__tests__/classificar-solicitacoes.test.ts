/**
 * Painéis iniciais: a Andresa só via o que RECEBEU. Agora "Para mim" (responsável = eu) e
 * "Que pedi" (solicitante = eu e outra pessoa atende) — a que pedi pra mim mesmo não duplica.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ usuario: null }) }))

import { classificarSolicitacoes, type SolicitacaoPainel } from '../useMinhasSolicitacoes'

const ANDRESA = 'u-andresa'
const CLAUDIA = 'u-claudia'
const MARCIO = 'u-marcio'

function sol(p: Partial<SolicitacaoPainel> & { id: string }): SolicitacaoPainel {
  return {
    titulo: 't', tipo: 'simulacao', prioridade: 'normal', status: 'pendente', sla_at: null,
    created_at: '2026-09-21T21:00:00Z', lead_id: null, processo_id: null,
    responsavel_id: null, solicitante_id: ANDRESA,
    lead: null, processo: null, solicitante: null, responsavel: null, ...p,
  }
}

describe('classificarSolicitacoes', () => {
  it('a que pedi pra mim mesmo conta só em "Para mim"; a que pedi a outra pessoa só em "Que pedi"', () => {
    const rows = [
      sol({ id: 'pra-mim', responsavel_id: ANDRESA }),
      sol({ id: 'pra-claudia', responsavel_id: CLAUDIA }),
    ]
    const r = classificarSolicitacoes(rows, ANDRESA)
    expect(r.paraMim.map((s) => s.id)).toEqual(['pra-mim'])
    expect(r.quePedi.map((s) => s.id)).toEqual(['pra-claudia'])
  })

  it('o que outra pessoa pediu pra mim entra em "Para mim" e não em "Que pedi"', () => {
    const r = classificarSolicitacoes([sol({ id: 'x', solicitante_id: MARCIO, responsavel_id: ANDRESA })], ANDRESA)
    expect(r.paraMim).toHaveLength(1)
    expect(r.quePedi).toHaveLength(0)
  })

  it('não conta solicitação de terceiros (nem pedida nem recebida por mim)', () => {
    const r = classificarSolicitacoes([sol({ id: 'y', solicitante_id: MARCIO, responsavel_id: CLAUDIA })], ANDRESA)
    expect(r.paraMim).toHaveLength(0)
    expect(r.quePedi).toHaveLength(0)
  })

  it('solicitação sem responsável definido, que eu pedi, aparece em "Que pedi"', () => {
    const r = classificarSolicitacoes([sol({ id: 'z', responsavel_id: null })], ANDRESA)
    expect(r.quePedi.map((s) => s.id)).toEqual(['z'])
  })

  it('vencidas vêm primeiro, depois prioridade', () => {
    const agora = new Date('2026-09-22T12:00:00Z').getTime()
    const rows = [
      sol({ id: 'normal-ok', responsavel_id: ANDRESA, prioridade: 'normal' }),
      sol({ id: 'urgente-ok', responsavel_id: ANDRESA, prioridade: 'urgente' }),
      sol({ id: 'baixa-vencida', responsavel_id: ANDRESA, prioridade: 'baixa', sla_at: '2026-09-21T00:00:00Z' }),
    ]
    expect(classificarSolicitacoes(rows, ANDRESA, agora).paraMim.map((s) => s.id))
      .toEqual(['baixa-vencida', 'urgente-ok', 'normal-ok'])
  })
})
