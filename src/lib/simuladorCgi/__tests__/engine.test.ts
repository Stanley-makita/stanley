import { describe, it, expect } from 'vitest'
import {
  simularBancoCgi, simularTodosBancosCgi, resolverBancosCgi, resolverMenorPrestacaoCgi,
  executarSimulacaoCgi,
} from '../engine'
import { BANCOS_CGI_CONFIG, TODOS_BANCOS_CGI, PRAZO_MAXIMO_CGI_MESES, LIMITE_IDADE_PRAZO_CGI_MESES } from '../constantes'
import type { InputCgi } from '../tipos'

describe('Cenário A — 5 bancos normais (dentro do LTV e prazo)', () => {
  const input: InputCgi = { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 180, bancosIds: [] }
  const resultado = executarSimulacaoCgi(input)

  it('simula os 5 bancos', () => {
    expect(resultado.bancos).toHaveLength(5)
  })

  it('nenhum é limitado por LTV ou prazo (500k < 600k e 180 < 240)', () => {
    for (const b of resultado.bancos) {
      expect(b.limitadoPeloLtv).toBe(false)
      expect(b.limitadoPeloPrazoBanco).toBe(false)
      expect(b.valorSimulado).toBe(500_000)
      expect(b.prazoConsiderado).toBe(180)
      expect(b.elegivel).toBe(true)
    }
  })

  it('Santander usa PRICE; os outros 4 usam SAC', () => {
    const porBanco = Object.fromEntries(resultado.bancos.map((b) => [b.bancoId, b]))
    expect(porBanco.santander.sistemaAmortizacao).toBe('PRICE')
    expect(porBanco.inter.sistemaAmortizacao).toBe('SAC')
    expect(porBanco.daycoval.sistemaAmortizacao).toBe('SAC')
    expect(porBanco.cashme.sistemaAmortizacao).toBe('SAC')
    expect(porBanco.bradesco.sistemaAmortizacao).toBe('SAC')
  })

  it('Inter/Daycoval/CashMe marcados como pós-fixados (IPCA); Santander/Bradesco não', () => {
    const porBanco = Object.fromEntries(resultado.bancos.map((b) => [b.bancoId, b]))
    expect(porBanco.inter.indexadoIpca).toBe(true)
    expect(porBanco.daycoval.indexadoIpca).toBe(true)
    expect(porBanco.cashme.indexadoIpca).toBe(true)
    expect(porBanco.santander.indexadoIpca).toBe(false)
    expect(porBanco.bradesco.indexadoIpca).toBe(false)
  })

  it('taxas batem com a config (18% para Inter/Daycoval/CashMe, 20% para Santander/Bradesco)', () => {
    const porBanco = Object.fromEntries(resultado.bancos.map((b) => [b.bancoId, b]))
    expect(porBanco.inter.taxaAnualReferencia).toBeCloseTo(0.18)
    expect(porBanco.santander.taxaAnualReferencia).toBeCloseTo(0.20)
    expect(porBanco.bradesco.taxaAnualReferencia).toBeCloseTo(0.20)
  })
})

describe('Cenário B — limitação de LTV a 60%', () => {
  it('imóvel 500k, pedido 400k (80%) → limita a 300k', () => {
    const r = simularBancoCgi('inter', { valorImovel: 500_000, valorDesejado: 400_000, bancosIds: [] })
    expect(r.valorMaximoPeloImovel).toBe(300_000)
    expect(r.valorSimulado).toBe(300_000)
    expect(r.limitadoPeloLtv).toBe(true)
  })
})

describe('Cenário C — "quero o máximo"', () => {
  it('imóvel 800k, pedido = teto LTV → simula 480k', () => {
    const valorImovel = 800_000
    const valorDesejado = valorImovel * BANCOS_CGI_CONFIG.inter.ltvMax
    const r = simularBancoCgi('inter', { valorImovel, valorDesejado, bancosIds: [] })
    expect(r.valorSimulado).toBe(480_000)
    expect(r.limitadoPeloLtv).toBe(false)
  })
})

describe('Cenário D — limitação de prazo pelo teto do banco', () => {
  it('prazo pedido 300 → limita a 240 e sinaliza', () => {
    const r = simularBancoCgi('bradesco', { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 300, bancosIds: [] })
    expect(r.prazoSolicitado).toBe(300)
    expect(r.prazoMaximoBanco).toBe(PRAZO_MAXIMO_CGI_MESES)
    expect(r.prazoConsiderado).toBe(PRAZO_MAXIMO_CGI_MESES)
    expect(r.limitadoPeloPrazoBanco).toBe(true)
  })

  it('prazo ausente → assume 240 (default)', () => {
    const r = simularBancoCgi('bradesco', { valorImovel: 1_000_000, valorDesejado: 500_000, bancosIds: [] })
    expect(r.prazoConsiderado).toBe(PRAZO_MAXIMO_CGI_MESES)
    expect(r.limitadoPeloPrazoBanco).toBe(false)
  })
})

describe('Cenário E — banco único', () => {
  it('resolverBancosCgi(["santander"]) retorna só Santander', () => {
    expect(resolverBancosCgi(['santander'])).toEqual(['santander'])
  })

  it('simularTodosBancosCgi com 1 banco retorna 1 resultado', () => {
    const bancos = simularTodosBancosCgi({ valorImovel: 1_000_000, valorDesejado: 500_000, bancosIds: ['santander'] }, ['santander'])
    expect(bancos).toHaveLength(1)
    expect(bancos[0].bancoId).toBe('santander')
  })
})

describe('Cenário F — comparativo de todos os bancos', () => {
  it('resolverBancosCgi([]) retorna TODOS_BANCOS_CGI', () => {
    expect(resolverBancosCgi([])).toEqual(TODOS_BANCOS_CGI)
  })

  it('escolhe o banco com a prestação genuinamente mais baixa entre os 5 (não presume SAC vs PRICE)', () => {
    // Nota: com prazos longos, a 1ª parcela SAC (amortização + juros cheios sobre o
    // principal) costuma superar a parcela fixa PRICE mesmo com taxa PRICE maior — por
    // isso não presumimos que os bancos de taxa 18% (SAC) vençam o Santander (PRICE,
    // 20%). Exatamente a razão de nunca chamar isso de "melhor cenário".
    const resultado = executarSimulacaoCgi({ valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 180, bancosIds: [] })
    const esperado = [...resultado.bancos].sort((a, b) => a.prestacaoEstimada - b.prestacaoEstimada)[0]
    expect(resultado.bancoMenorPrestacaoId).toBe(esperado.bancoId)
  })
})

describe('Cenário G — IOF separado da prestação', () => {
  const r = simularBancoCgi('inter', { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 180, bancosIds: [] })

  it('IOF é positivo e não está embutido na prestação', () => {
    expect(r.iofEstimado).toBeGreaterThan(0)
    expect(r.valorTotalAposIof).toBeCloseTo(r.valorSimulado + r.iofEstimado, 2)
  })

  it('prestação é calculada sobre valorSimulado, não sobre valorTotalAposIof', () => {
    const amortizacaoSimulado = r.valorSimulado / r.prazoConsiderado
    const amortizacaoComIof   = r.valorTotalAposIof / r.prazoConsiderado
    expect(amortizacaoSimulado).toBeLessThan(amortizacaoComIof)
    const primeiraParcelaEsperada = Math.round((amortizacaoSimulado + r.valorSimulado * r.taxaMensal) * 100) / 100
    expect(r.prestacaoEstimada).toBeCloseTo(primeiraParcelaEsperada, 2)
  })
})

describe('Cenário H — regressão zero (isolamento do módulo)', () => {
  it('não importa nem depende de BANCOS_CONFIG do financiamento imobiliário', () => {
    expect(TODOS_BANCOS_CGI).toEqual(['inter', 'daycoval', 'cashme', 'santander', 'bradesco'])
    expect(TODOS_BANCOS_CGI).not.toContain('caixa')
    expect(TODOS_BANCOS_CGI).not.toContain('itau')
  })
})

// ── Regra de idade x prazo (80 anos e 3 meses) ──────────────────────────────────────
// dataNascimento é montada relativa a "hoje" para os testes não expirarem — usa uma data
// fixa (2026-08-25, dia em que a regra foi escrita) como referência de "hoje" simulado,
// mas como o motor usa Date real, calculamos a data de nascimento necessária a partir de
// hoje mesmo (idadeMesesAlvo meses atrás), então os testes continuam válidos no futuro.
function dataNascimentoComIdadeEmMeses(idadeMesesAlvo: number): string {
  const hoje = new Date()
  const anos = Math.floor(idadeMesesAlvo / 12)
  const meses = idadeMesesAlvo % 12
  const ano = hoje.getFullYear() - anos
  let mes = hoje.getMonth() + 1 - meses
  let anoAjustado = ano
  if (mes <= 0) { mes += 12; anoAjustado -= 1 }
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${anoAjustado}-${String(mes).padStart(2, '0')}-${dia}`
}

describe('Cenário I — regra de idade x prazo (idade + prazo ≤ 80 anos e 3 meses)', () => {
  it('cliente jovem + 240 meses solicitados → mantém 240', () => {
    const dataNascimento = dataNascimentoComIdadeEmMeses(30 * 12) // 30 anos
    const r = simularBancoCgi('inter', { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 240, dataNascimento, bancosIds: [] })
    expect(r.prazoConsiderado).toBe(240)
    expect(r.limitadoPelaIdade).toBe(false)
    expect(r.elegivel).toBe(true)
  })

  it('idade que permite só 180 meses (dentro do teto do banco) → reduz para 180 e sinaliza', () => {
    // Idade em meses tal que prazoMaximoPorIdade = LIMITE - idadeMeses = 180
    const idadeMeses = LIMITE_IDADE_PRAZO_CGI_MESES - 180
    const dataNascimento = dataNascimentoComIdadeEmMeses(idadeMeses)
    const r = simularBancoCgi('inter', { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 240, dataNascimento, bancosIds: [] })
    expect(r.prazoMaximoPorIdade).toBeCloseTo(180, 0)
    expect(r.prazoConsiderado).toBeLessThanOrEqual(180)
    expect(r.limitadoPelaIdade).toBe(true)
    expect(r.elegivel).toBe(true)
  })

  it('prazo solicitado menor que o limite pela idade → mantém o solicitado, sem sinalizar limitação', () => {
    const idadeMeses = LIMITE_IDADE_PRAZO_CGI_MESES - 200 // permite até 200 meses
    const dataNascimento = dataNascimentoComIdadeEmMeses(idadeMeses)
    const r = simularBancoCgi('inter', { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 100, dataNascimento, bancosIds: [] })
    expect(r.prazoConsiderado).toBe(100)
    expect(r.limitadoPelaIdade).toBe(false)
  })

  it('dataNascimento ausente → simula normalmente, sem aplicar a regra de idade', () => {
    const r = simularBancoCgi('inter', { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 240, bancosIds: [] })
    expect(r.dataNascimentoUsada).toBeNull()
    expect(r.prazoMaximoPorIdade).toBeNull()
    expect(r.limitadoPelaIdade).toBe(false)
    expect(r.elegivel).toBe(true)
    expect(r.prazoConsiderado).toBe(240)
  })

  it('exatamente no limite de 80 anos e 3 meses (prazoMaximoPorIdade ≈ 0, ainda positivo) → aceito', () => {
    const idadeMeses = LIMITE_IDADE_PRAZO_CGI_MESES - 1 // 1 mês de prazo ainda disponível
    const dataNascimento = dataNascimentoComIdadeEmMeses(idadeMeses)
    const r = simularBancoCgi('inter', { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 240, dataNascimento, bancosIds: [] })
    expect(r.prazoMaximoPorIdade).toBeGreaterThan(0)
    expect(r.elegivel).toBe(true)
    expect(r.prazoConsiderado).toBeGreaterThan(0)
  })

  it('idade já ultrapassa o limite mesmo sem prazo (prazoMaximoPorIdade <= 0) → inelegível, não 12 meses forçados', () => {
    const idadeMeses = LIMITE_IDADE_PRAZO_CGI_MESES + 6 // já passou do limite
    const dataNascimento = dataNascimentoComIdadeEmMeses(idadeMeses)
    const r = simularBancoCgi('inter', { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 240, dataNascimento, bancosIds: [] })
    expect(r.prazoMaximoPorIdade).toBeLessThanOrEqual(0)
    expect(r.elegivel).toBe(false)
    expect(r.motivoInelegivel).toBeTruthy()
    expect(r.prazoConsiderado).toBe(0)
    expect(r.prestacaoEstimada).toBe(0)
  })

  it('quando todos os bancos ficam inelegíveis por idade, bancoMenorPrestacaoId é null (não aponta um inelegível)', () => {
    const idadeMeses = LIMITE_IDADE_PRAZO_CGI_MESES + 12
    const dataNascimento = dataNascimentoComIdadeEmMeses(idadeMeses)
    const resultado = executarSimulacaoCgi({ valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 240, dataNascimento, bancosIds: [] })
    expect(resultado.bancos.every((b) => !b.elegivel)).toBe(true)
    expect(resultado.bancoMenorPrestacaoId).toBeNull()
  })

  it('mesma regra vale para qualquer banco (config isolada não altera o cálculo de idade)', () => {
    const idadeMeses = LIMITE_IDADE_PRAZO_CGI_MESES - 50
    const dataNascimento = dataNascimentoComIdadeEmMeses(idadeMeses)
    for (const bancoId of TODOS_BANCOS_CGI) {
      const r = simularBancoCgi(bancoId, { valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 240, dataNascimento, bancosIds: [] })
      expect(r.prazoMaximoPorIdade).toBeCloseTo(50, 0)
    }
  })
})
