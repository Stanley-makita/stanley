/**
 * Regressão (2026-09-21): o guard de concorrência de salvarConsorcioPendente/salvarCustasPendente
 * passava o OBJETO em `.eq('<col>_pendente', obj)`. O supabase-js o serializa como "[object Object]"
 * e o Postgres rejeita (22P02 "invalid input syntax for type json") — o UPDATE nunca aplicava e o
 * *consorcio/*custas repetiam a 1ª pergunta pra sempre. O valor tem que ser string JSON.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/conversas/garantirConversaOperador', () => ({
  garantirConversaOperador: vi.fn().mockResolvedValue('conversa-1'),
}))

function criarSupabaseEspiao() {
  const eqCalls: Array<[string, unknown]> = []
  const q: Record<string, unknown> = {
    update: () => q,
    eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return q },
    select: () => Promise.resolve({ data: [{ id: 'conversa-1' }], error: null }),
  }
  return { supabase: { from: () => q } as unknown as SupabaseClient, eqCalls }
}

describe('guard de concorrência dos pendentes', () => {
  it('*consorcio: compara consorcio_pendente com string JSON', async () => {
    const { salvarConsorcioPendente } = await import('../consorcio-pendente')
    const { supabase, eqCalls } = criarSupabaseEspiao()
    const anterior = { passo: 'tipo_bem' as const, dados: {} }
    const ok = await salvarConsorcioPendente(supabase, 'e1', '5544', { passo: 'valor_bem', dados: { tipoBem: 'imovel' } }, anterior)

    expect(ok).toBe(true)
    const guard = eqCalls.find(([c]) => c === 'consorcio_pendente')
    expect(typeof guard?.[1]).toBe('string')
    expect(JSON.parse(guard![1] as string)).toEqual(anterior)
  })

  it('*custas: compara custas_pendente com string JSON', async () => {
    const { salvarCustasPendente } = await import('../custas-pendente')
    const { supabase, eqCalls } = criarSupabaseEspiao()
    const anterior = { passo: 'valor_imovel', dados: {} } as never
    await salvarCustasPendente(supabase, 'e1', '5544', { passo: 'valor_imovel', dados: { a: 1 } } as never, anterior)

    const guard = eqCalls.find(([c]) => c === 'custas_pendente')
    expect(typeof guard?.[1]).toBe('string')
  })
})
