/**
 * Teste de regressão — Fase 2 da migração para o motor agnóstico
 * (docs/calibracao-simuladores/arquitetura-motor-agnostico.md)
 *
 * Mesma metodologia de `criteria-migracao.test.ts` (Fase 1): os snapshots
 * gravados aqui foram capturados com Inter e Daycoval **ainda no caminho
 * hardcoded antigo** (antes de `ehBancoComCriterios` passar a incluí-los).
 * Depois da migração, a mesma suíte deve reproduzir os snapshots gravados
 * sem nenhuma diferença.
 *
 * NÃO editar os snapshots manualmente. Nenhuma correção de regra (taxa,
 * prazo, LTV, seguro) do Inter ou do Daycoval deve mudar um valor aqui —
 * isso só pode acontecer numa fase futura dedicada a calibração, nunca
 * numa fase de migração estrutural.
 */

import { describe, it, expect } from 'vitest'
import { simularBanco } from '../engine'
import type { InputFinanciamento } from '../tipos'

const BASE_INPUT: InputFinanciamento = {
  valorImovel:     500_000,
  valorEntrada:    150_000,
  dataNascimento:  '1990-06-15',
  rendaMensal:     15_000,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       [],
  tipoImovel:      'novo',
  finalidade:      'residencial',
}

describe('Inter — regressão antes/depois da migração (Fase 2)', () => {
  it('aquisição residencial padrão', () => {
    const r = simularBanco('inter', { ...BASE_INPUT })
    expect(r).toMatchSnapshot()
  })

  it('correntista', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, correntista: true })
    expect(r).toMatchSnapshot()
  })

  it('imóvel usado', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, tipoImovel: 'usado' })
    expect(r).toMatchSnapshot()
  })

  it('com prazo máximo atual (420 meses — cliente jovem, sem restrição de idade)', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, dataNascimento: '2000-01-01' })
    expect(r.parcelas).toBeGreaterThan(0)
    expect(r).toMatchSnapshot()
  })

  it('idade próxima ao limite (78 anos — prazo reduzido pela regra idade+prazo)', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, dataNascimento: '1948-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('idade no corte duro de 80 anos (inelegível)', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, dataNascimento: '1946-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('LTV no limite de 80%', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, valorEntrada: 100_000 })
    expect(r).toMatchSnapshot()
  })

  it('LTV acima do limite (inelegível)', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, valorEntrada: 50_000 })
    expect(r).toMatchSnapshot()
  })

  it('PRICE (inelegível — Inter não oferece)', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, tipoAmortizacao: 'PRICE' })
    expect(r).toMatchSnapshot()
  })

  it('renda baixa (aviso de comprometimento de renda)', () => {
    const r = simularBanco('inter', { ...BASE_INPUT, rendaMensal: 3_000 })
    expect(r).toMatchSnapshot()
  })

  it('com overrides do banco de dados (taxa, LTV, prazo, MIP e DFI customizados)', () => {
    const r = simularBanco('inter', { ...BASE_INPUT }, {
      taxaAnual: 0.11,
      maxLtv: 0.75,
      prazoMaximoMeses: 360,
      mipRate: 0.0003,
      dfiRate: 0.00009,
    })
    expect(r).toMatchSnapshot()
  })

  it('faixas etárias da tabela MIP própria (Sompo) — idades cobrindo vários tetos', () => {
    for (const [dataNascimento, label] of [
      ['2005-01-01', 'jovem <=30'],
      ['1985-01-01', '~40'],
      ['1970-01-01', '~55'],
      ['1955-01-01', '~70'],
    ] as const) {
      const r = simularBanco('inter', { ...BASE_INPUT, dataNascimento })
      expect({ label, primeiraParcela: r.primeiraParcela, totalSeguros: r.totalSeguros }).toMatchSnapshot()
    }
  })
})

describe('Daycoval — regressão antes/depois da migração (Fase 2)', () => {
  const BASE_DAYCOVAL: InputFinanciamento = {
    ...BASE_INPUT,
    valorImovel:  400_000,
    valorEntrada: 200_000, // 50% financiado — dentro do LTV de 60% do CGI
  }

  it('CGI/Home Equity — cenário padrão', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL })
    expect(r).toMatchSnapshot()
  })

  it('correntista', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL, correntista: true })
    expect(r).toMatchSnapshot()
  })

  it('LTV no limite máximo (60%)', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL, valorEntrada: 160_000 }) // 60% financiado
    expect(r).toMatchSnapshot()
  })

  it('LTV acima do limite (inelegível)', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL, valorEntrada: 100_000 }) // 75% financiado
    expect(r).toMatchSnapshot()
  })

  it('prazo máximo atual (360 meses — cliente jovem)', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL, dataNascimento: '2000-01-01' })
    expect(r.parcelas).toBeGreaterThan(0)
    expect(r).toMatchSnapshot()
  })

  it('idade próxima ao limite (78 anos — prazo reduzido)', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL, dataNascimento: '1948-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('idade no corte duro de 80 anos (inelegível)', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL, dataNascimento: '1946-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('teto de imóvel (R$ 1.000.000 — acima disso é inelegível)', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL, valorImovel: 1_200_000, valorEntrada: 600_000 })
    expect(r).toMatchSnapshot()
  })

  it('PRICE (inelegível — Daycoval não oferece)', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL, tipoAmortizacao: 'PRICE' })
    expect(r).toMatchSnapshot()
  })

  it('MIP flat — não deve variar com a idade (verificação da estratégia)', () => {
    const jovem = simularBanco('daycoval', { ...BASE_DAYCOVAL, dataNascimento: '2000-01-01' })
    const maisVelho = simularBanco('daycoval', { ...BASE_DAYCOVAL, dataNascimento: '1965-01-01' })
    // Ambos elegíveis com o mesmo prazo → mesma taxa efetiva de MIP embutida na parcela
    // (a diferença de parcela, se houver, vem só do prazo reduzido pela regra idade+prazo)
    expect({ jovem: jovem.totalSeguros, maisVelho: maisVelho.totalSeguros }).toMatchSnapshot()
  })

  it('com overrides do banco de dados (taxa, LTV, prazo, MIP e DFI customizados)', () => {
    const r = simularBanco('daycoval', { ...BASE_DAYCOVAL }, {
      taxaAnual: 0.12,
      maxLtv: 0.55,
      prazoMaximoMeses: 240,
      mipRate: 0.0004,
      dfiRate: 0.00005,
    })
    expect(r).toMatchSnapshot()
  })
})
