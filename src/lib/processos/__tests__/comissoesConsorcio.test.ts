/** Regressão (2026-10-03): colunas de comissão do Consórcio vazias — agora somam o fluxo financeiro. */
import { describe, it, expect } from 'vitest'
import { somarComissoesConsorcio } from '../comissoesConsorcio'

describe('somarComissoesConsorcio', () => {
  it('soma as parcelas por negócio (valor numérico vindo como texto do PostgREST)', () => {
    const r = somarComissoesConsorcio(
      [{ processo_id: 'a', valor_parcela: '1400.10' }, { processo_id: 'a', valor_parcela: 1399.9 }, { processo_id: 'b', valor_parcela: 100 }],
      [{ processo_id: 'a', valor_parcela: '350.03' }, { processo_id: 'a', valor_parcela: 349.97 }],
    )
    expect(r).toEqual({ a: { empresa: 2800, comercial: 700 }, b: { empresa: 100, comercial: 0 } })
  })
})
