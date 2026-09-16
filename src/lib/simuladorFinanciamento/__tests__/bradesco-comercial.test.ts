/**
 * Bradesco Comercial PF — financiamento de imóvel comercial, pessoa física.
 * Ver supabase/migrations/20260916_310_bancos_comercial_bradesco.sql e
 * BRADESCO_COMERCIAL_PF (constantes.ts) / simularBradescoComercial (engine.ts).
 *
 * Regras cobertas (pedido do usuário, 2026-09-16):
 * - LTV até 70%, prazo até 240 meses, comprometimento de renda 30% SAC / 15% PRICE
 * - Parcela mínima R$200
 * - Taxa/MIP/DFI parametrizáveis via overrides — nunca hardcoded
 * - MIP/DFI sem override caem no fallback da tabela residencial do Bradesco, com aviso
 * - FGTS não aceito — aviso quando usaFgts=true
 * - IOF aplicável e calculado
 * - Bradesco residencial e os demais bancos em modalidade comercial ficam intocados
 */

import { describe, it, expect } from 'vitest'
import { simularBanco, simularTodosBancos } from '../engine'
import type { InputFinanciamento } from '../tipos'
import type { BancoSimOverrides } from '../criteria'

const BASE_COMERCIAL: InputFinanciamento = {
  valorImovel:     500_000,
  valorEntrada:    150_000, // 70% financiado — exatamente no teto do LTV comercial
  dataNascimento:  '1985-03-10',
  rendaMensal:     20_000,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       ['bradesco'],
  tipoImovel:      'novo',
  finalidade:      'comercial',
  tipoOperacao:    'comercial',
}

describe('Bradesco Comercial PF', () => {
  it('LTV 70% (limite exato) é elegível', () => {
    const r = simularBanco('bradesco', BASE_COMERCIAL)
    expect(r.elegivel).toBe(true)
    expect(r.programa).toBe('Comercial PF')
  })

  it('acima de 70% de LTV fica inelegível (não herda os 80% do residencial)', () => {
    const r = simularBanco('bradesco', { ...BASE_COMERCIAL, valorEntrada: 100_000 }) // 80% financiado
    expect(r.elegivel).toBe(false)
    expect(r.motivoInelegivel).toMatch(/70%/)
  })

  it('prazo máximo é limitado a 240 meses (não os 420 do residencial)', () => {
    const r = simularBanco('bradesco', { ...BASE_COMERCIAL, dataNascimento: '2000-01-01' }) // jovem, sem corte de idade
    expect(r.elegivel).toBe(true)
    expect(r.parcelas).toBeLessThanOrEqual(240)
  })

  it('comprometimento de renda SAC usa 30% (avisoRenda dispara com renda baixa)', () => {
    const r = simularBanco('bradesco', { ...BASE_COMERCIAL, rendaMensal: 3_000 })
    expect(r.elegivel).toBe(true)
    expect(r.avisoRenda).toBe(true)
  })

  it('comprometimento de renda PRICE usa 15%, mais restritivo que o SAC', () => {
    // Faixa de renda calibrada pro cenário base (financiado R$350.000, 240 meses): SAC
    // primeira parcela ~R$4.916 (30% de R$18.000 = R$5.400, passa); PRICE ~R$3.934 (15% de
    // R$18.000 = R$2.700, não passa) — prova que os dois limiares são aplicados de fato,
    // não só copiados um do outro.
    const rendaMensal = 18_000
    const sac   = simularBanco('bradesco', { ...BASE_COMERCIAL, rendaMensal, tipoAmortizacao: 'SAC' })
    const price = simularBanco('bradesco', { ...BASE_COMERCIAL, rendaMensal, tipoAmortizacao: 'PRICE' })
    expect(sac.elegivel).toBe(true)
    expect(price.elegivel).toBe(true)
    expect(sac.avisoRenda).toBe(false)
    expect(price.avisoRenda).toBe(true)
  })

  it('parcela abaixo de R$200 fica inelegível por parcela mínima, não por LTV/renda', () => {
    const r = simularBanco('bradesco', {
      ...BASE_COMERCIAL, valorImovel: 10_000, valorEntrada: 3_000, rendaMensal: 50_000,
    })
    expect(r.elegivel).toBe(false)
    expect(r.motivoInelegivel).toMatch(/parcela mínima/i)
  })

  it('taxa comercial é parametrizável via overrides — não usa a taxa residencial quando configurada', () => {
    const overrides: BancoSimOverrides = { taxaAnual: 0.20 } // bem acima do residencial (11,90%), só pra provar que aplica
    const semOverride = simularBanco('bradesco', BASE_COMERCIAL)
    const comOverride = simularBanco('bradesco', BASE_COMERCIAL, overrides)
    expect(comOverride.taxaAnual).toBe(0.20)
    expect(comOverride.taxaAnual).not.toBe(semOverride.taxaAnual)
    expect(comOverride.primeiraParcela).toBeGreaterThan(semOverride.primeiraParcela)
  })

  it('sem overrides comerciais (taxa/MIP/DFI), avisa que taxa e MIP/DFI usam a tabela residencial como proxy', () => {
    const r = simularBanco('bradesco', BASE_COMERCIAL)
    expect(r.observacao).toMatch(/taxa comercial ainda não configurada/i)
    expect(r.observacao).toMatch(/mip\/dfi.*residencial do bradesco/i)
  })

  it('com todos os overrides comerciais configurados, não exibe nenhum aviso de proxy', () => {
    const r = simularBanco('bradesco', BASE_COMERCIAL, { taxaAnual: 0.135, mipRate: 0.0002, dfiRate: 0.00007 })
    expect(r.observacao ?? '').not.toMatch(/residencial do bradesco/i)
  })

  it('FGTS: aviso só aparece quando usaFgts=true (comercial não aceita FGTS)', () => {
    const comFgts = simularBanco('bradesco', { ...BASE_COMERCIAL, usaFgts: true })
    const semFgts = simularBanco('bradesco', { ...BASE_COMERCIAL, usaFgts: false })
    expect(comFgts.observacao).toMatch(/FGTS não é aceito/i)
    expect(semFgts.observacao ?? '').not.toMatch(/FGTS não é aceito/i)
  })

  it('IOF é sinalizado como aplicável e calculado (> 0) — imóvel comercial', () => {
    const r = simularBanco('bradesco', BASE_COMERCIAL)
    expect(r.elegivel).toBe(true)
    expect(r.iofAplicavel).toBe(true)
    expect(r.valorIof).toBeGreaterThan(0)
  })

  it('Bradesco residencial (finalidade !== comercial) continua com as regras antigas (LTV 80%, taxa base)', () => {
    const r = simularBanco('bradesco', { ...BASE_COMERCIAL, finalidade: 'residencial', valorEntrada: 100_000 }) // 80% financiado
    expect(r.elegivel).toBe(true)
    expect(r.programa).toBe('SBPE')
    expect(r.iofAplicavel).toBeFalsy()
  })

  it('demais bancos continuam bloqueados em imóvel comercial — só Caixa e Bradesco operam', () => {
    const resultados = simularTodosBancos(
      { ...BASE_COMERCIAL, bancosIds: ['caixa', 'bradesco', 'itau', 'santander'] },
    )
    const itau = resultados.find((r) => r.bancoId === 'itau')
    const santander = resultados.find((r) => r.bancoId === 'santander')
    const bradesco = resultados.find((r) => r.bancoId === 'bradesco')
    expect(itau?.elegivel).toBe(false)
    expect(santander?.elegivel).toBe(false)
    expect(bradesco?.elegivel).toBe(true)
  })
})
