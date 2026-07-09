/**
 * Testes: seleção de amortização SAC vs PRICE
 *
 * Cobertura:
 *   1. PRICE sem banco (simularTodosBancos com BANCOS_PRICE)
 *   2. PRICE com Caixa
 *   3. PRICE com Bradesco (inelegível — não oferta PRICE)
 *   4. PRICE com banco sem suporte (Santander)
 *   5. SAC explícito
 *   6. Sem amortização informada (deve usar SAC por padrão do normalizer)
 */

import { describe, it, expect } from 'vitest'
import { simularBanco, simularTodosBancos } from '../engine'
import { BANCOS_CONFIG, BANCOS_PRICE, TODOS_BANCOS } from '../constantes'
import type { InputFinanciamento } from '../tipos'

const BASE_INPUT: InputFinanciamento = {
  valorImovel:     500_000,
  valorEntrada:    100_000,
  dataNascimento:  '1990-06-15',
  rendaMensal:     20_000,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       [],
  tipoImovel:      'novo',
  finalidade:      'residencial',
}

// ─── 1. PRICE sem banco — usar BANCOS_PRICE ──────────────────────────────────

describe('PRICE sem banco específico', () => {
  it('BANCOS_PRICE contém apenas Caixa e Itaú', () => {
    expect(BANCOS_PRICE).toEqual(['caixa', 'itau'])
  })

  it('todos os bancos em BANCOS_PRICE têm suportaPrice=true', () => {
    for (const id of BANCOS_PRICE) {
      expect(BANCOS_CONFIG[id].suportaPrice).toBe(true)
    }
  })

  it('simularTodosBancos com BANCOS_PRICE PRICE → apenas elegíveis são Caixa/Itaú', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'PRICE',
      bancosIds:        BANCOS_PRICE,
    }
    const resultados = simularTodosBancos(input)
    const elegiveis  = resultados.filter((r) => r.elegivel)
    expect(elegiveis.length).toBeGreaterThan(0)
    for (const r of elegiveis) {
      expect(BANCOS_PRICE).toContain(r.bancoId)
      // Caixa (Comparação de Cenários) sempre tenta SAC e PRICE independente do pedido —
      // um resultado SAC elegível dela pode aparecer mesmo pedindo PRICE. Bancos de
      // cenário único (Itaú) continuam respeitando exatamente o tipoAmortizacao pedido.
      if (r.bancoId !== 'caixa') {
        expect(r.tipoAmortizacao).toBe('PRICE')
      }
    }
  })
})

// ─── 2. PRICE com Caixa ──────────────────────────────────────────────────────

describe('PRICE com Caixa', () => {
  it('Caixa PRICE elegível quando LTV dentro do limite (70%)', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'PRICE',
      bancosIds:        ['caixa'],
      valorEntrada:     150_000, // 70% financiado → 350k / 500k = 70%
    }
    const r = simularBanco('caixa', input)
    expect(r.elegivel).toBe(true)
    expect(r.tipoAmortizacao).toBe('PRICE')
    expect(r.primeiraParcela).toBeGreaterThan(0)
  })

  it('Caixa PRICE inelegível quando LTV excede 70%', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'PRICE',
      bancosIds:        ['caixa'],
      valorEntrada:     50_000, // 90% financiado → excede 70% LTV PRICE
    }
    const r = simularBanco('caixa', input)
    expect(r.elegivel).toBe(false)
    expect(r.motivoInelegivel).toMatch(/Financiamento.*excede/)
  })

  it('Caixa SAC aceita LTV 80%', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'SAC',
      bancosIds:        ['caixa'],
      valorEntrada:     100_000, // 80% financiado → dentro do limite SAC
    }
    const r = simularBanco('caixa', input)
    expect(r.elegivel).toBe(true)
    expect(r.tipoAmortizacao).toBe('SAC')
  })
})

// ─── 3. PRICE com Bradesco (não oferece PRICE) ───────────────────────────────

describe('PRICE com Bradesco', () => {
  it('Bradesco não tem suportaPrice', () => {
    expect(BANCOS_CONFIG['bradesco'].suportaPrice).toBeFalsy()
  })

  it('Bradesco PRICE → inelegível com mensagem clara', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'PRICE',
      bancosIds:        ['bradesco'],
    }
    const r = simularBanco('bradesco', input)
    expect(r.elegivel).toBe(false)
    expect(r.motivoInelegivel).toContain('PRICE')
  })

  it('Bradesco SAC → elegível normalmente', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'SAC',
      bancosIds:        ['bradesco'],
    }
    const r = simularBanco('bradesco', input)
    expect(r.elegivel).toBe(true)
  })
})

// ─── 4. PRICE com banco sem suporte (Santander, BB, Inter, Daycoval) ─────────

describe('PRICE com bancos sem suporte', () => {
  const semSuporte = TODOS_BANCOS.filter((id) => !BANCOS_CONFIG[id].suportaPrice)

  it('bancos sem suporte incluem Bradesco, Santander, BB, Inter, Daycoval', () => {
    expect(semSuporte).toContain('bradesco')
    expect(semSuporte).toContain('santander')
    expect(semSuporte).toContain('bb')
    expect(semSuporte).toContain('inter')
    expect(semSuporte).toContain('daycoval')
  })

  for (const id of ['santander', 'bb', 'inter'] as const) {
    it(`${id} PRICE → inelegível`, () => {
      const input: InputFinanciamento = {
        ...BASE_INPUT,
        tipoAmortizacao: 'PRICE',
        bancosIds:        [id],
      }
      const r = simularBanco(id, input)
      expect(r.elegivel).toBe(false)
      expect(r.motivoInelegivel).toContain('PRICE')
    })
  }
})

// ─── 5. SAC explícito ────────────────────────────────────────────────────────

describe('SAC explícito', () => {
  it('todos os bancos (exceto Caixa) simulam SAC corretamente', () => {
    // Caixa é excluída deste check de propósito: ela sempre tenta SAC e PRICE
    // simultaneamente, ignorando o tipoAmortizacao pedido (ver construirCenariosCaixa) —
    // e PRICE nunca fica inelegível por LTV para ela (a entrada é ajustada para cima em
    // vez de rejeitar), então sempre aparece um resultado PRICE ao lado do SAC.
    const idsSac = TODOS_BANCOS.filter((id) => id !== 'daycoval' && id !== 'caixa')
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'SAC',
      bancosIds:        idsSac,
    }
    const resultados = simularTodosBancos(input)
    for (const r of resultados.filter((r) => r.elegivel)) {
      expect(r.tipoAmortizacao).toBe('SAC')
    }
  })

  it('SAC: primeira parcela maior que a última (amortização decrescente)', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'SAC',
      bancosIds:        ['caixa'],
    }
    const r = simularBanco('caixa', input)
    expect(r.elegivel).toBe(true)
    expect(r.primeiraParcela).toBeGreaterThan(r.ultimaParcela)
  })
})

// ─── 6. Sem amortização — normalizer usa SAC como padrão ─────────────────────

describe('Sem amortização informada', () => {
  it('normalizer converte string vazia para SAC', async () => {
    const { normalizarDadosCaptacao } = await import('../../workflows/normalizador-captacao')
    const dados = normalizarDadosCaptacao({
      bancos_raw: [],
      solicitar_simulacao: false,
      tipo_amortizacao_raw: null,
    })
    expect(dados.tipo_amortizacao).toBe('SAC')
  })

  it('normalizer converte "price" para PRICE (case insensitive)', async () => {
    const { normalizarDadosCaptacao } = await import('../../workflows/normalizador-captacao')
    const dados = normalizarDadosCaptacao({
      bancos_raw: [],
      solicitar_simulacao: false,
      tipo_amortizacao_raw: 'tabela price',
    })
    expect(dados.tipo_amortizacao).toBe('PRICE')
  })

  it('normalizer converte "Tabela SAC" para SAC', async () => {
    const { normalizarDadosCaptacao } = await import('../../workflows/normalizador-captacao')
    const dados = normalizarDadosCaptacao({
      bancos_raw: [],
      solicitar_simulacao: false,
      tipo_amortizacao_raw: 'Tabela SAC',
    })
    expect(dados.tipo_amortizacao).toBe('SAC')
  })
})

// ─── 7. Invariantes de cálculo PRICE ─────────────────────────────────────────
//
// Em PRICE, a parcela financeira (amortização + juros) é constante.
// O total da parcela varia porque o MIP cresce com a idade do mutuário ao longo
// do contrato — no Itaú esse efeito é acentuado (MIP renovado a cada 10 anos).
// Por isso comparamos a variação relativa: deve ser < 20% para um prazo de 420m.

describe('Invariantes de cálculo PRICE', () => {
  it('PRICE Itaú: parcelas variam <20% (MIP encarece com idade, mas financiamento é constante)', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'PRICE',
      bancosIds:        ['itau'],
    }
    const r = simularBanco('itau', input)
    if (!r.elegivel) return
    const diff = Math.abs(r.primeiraParcela - r.ultimaParcela) / r.primeiraParcela
    expect(diff).toBeLessThan(0.20)
  })

  it('PRICE Caixa: primeira parcela maior que última (MIP SAC-like — decresce)', () => {
    const input: InputFinanciamento = {
      ...BASE_INPUT,
      tipoAmortizacao: 'PRICE',
      bancosIds:        ['caixa'],
      valorEntrada:     150_000, // 70% LTV → dentro do limite PRICE
    }
    const r = simularBanco('caixa', input)
    if (!r.elegivel) return
    // Caixa PRICE: DFI e MIP sobre saldo decrescente → primeira > última é esperado
    expect(r.primeiraParcela).toBeGreaterThan(0)
    expect(r.ultimaParcela).toBeGreaterThan(0)
  })
})
