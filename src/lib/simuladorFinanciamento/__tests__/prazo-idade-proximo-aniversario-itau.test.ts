/**
 * Corrigido em 2026-07-13: a regra idade+prazo do Itaú usa a idade que o cliente completará
 * no PRÓXIMO aniversário (convenção atuarial), não a idade atual — e soma 1 mês ao
 * resultado. `calcularPrazoMaximo` (engine.ts) usava só a idade atual (convenção que
 * continua valendo para os demais bancos, não verificada com essa precisão).
 *
 * Casos-âncora reais, simulados do zero (sessão limpa, sem "Simular novamente") no site
 * oficial do Itaú em 13/07/2026, imóvel R$1.000.000,00, SAC, sem correntista:
 *   - nasc. 01/01/1990 (36 anos) → prazo 420 (teto do produto, sem redução por idade)
 *   - nasc. 01/01/1975 (51 anos) → prazo 343 meses (financiado R$700.000)
 *   - nasc. 01/01/1960 (66 anos) → prazo 163 meses (financiado R$700.000)
 *   - nasc. 01/01/1980 (46 anos) → prazo 403 meses, tanto com financiado R$700.000
 *     quanto R$300.000 (confirma que a proporção financiado/renda não afeta o prazo)
 *
 * Fórmula verificada (5 casos exatos): prazo = (80,5 anos − idade no próximo aniversário)
 * × 12 + 1, capado no teto do produto (420 meses SFH).
 */
import { describe, it, expect } from 'vitest'
import { calcularPrazoMaximo } from '../engine'

describe('calcularPrazoMaximo — Itaú, convenção "idade no próximo aniversário"', () => {
  it('nasc. 1990-01-01 (36 anos): prazo capado em 420 (teto do produto)', () => {
    expect(calcularPrazoMaximo('1990-01-01', 420, 966, 'proximo-aniversario')).toBe(420)
  })

  it('nasc. 1975-01-01 (51 anos): prazo 343 meses', () => {
    expect(calcularPrazoMaximo('1975-01-01', 420, 966, 'proximo-aniversario')).toBe(343)
  })

  it('nasc. 1960-01-01 (66 anos): prazo 163 meses', () => {
    expect(calcularPrazoMaximo('1960-01-01', 420, 966, 'proximo-aniversario')).toBe(163)
  })

  it('nasc. 1980-01-01 (46 anos): prazo 403 meses', () => {
    expect(calcularPrazoMaximo('1980-01-01', 420, 966, 'proximo-aniversario')).toBe(403)
  })

  it('convenção "atual" (demais bancos) não muda de comportamento — mesmo caso dá um resultado diferente', () => {
    // 1975-01-01 (51 anos completos hoje): convenção antiga usa a idade atual (51), não a
    // do próximo aniversário (52) — resultado necessariamente diferente de 343.
    expect(calcularPrazoMaximo('1975-01-01', 420, 966, 'atual')).not.toBe(343)
  })
})
