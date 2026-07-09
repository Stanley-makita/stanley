/**
 * Fase 4 da migração para o motor agnóstico — Caixa.
 * Ver docs/calibracao-simuladores/arquitetura-motor-agnostico.md e
 * docs/calibracao-simuladores/migracao-motor-agnostico-fase-4-caixa.md.
 *
 * Objetivo: provar EQUIVALÊNCIA de comportamento entre o motor antigo (Caixa
 * hardcoded em `simularBancoComTaxa`/`calcularSACCaixa`/`calcularPRICECaixa`)
 * e o motor novo (Caixa via `SimulationCriteria` + `criteria-resolver.ts`).
 *
 * Como o código já foi migrado nesta sessão, a versão "antes" não pôde ser
 * capturada por um snapshot em separado ANTES da edição (como nas Fases 1–3).
 * Em vez disso, este teste importa uma cópia byte-a-byte do `engine.ts` e do
 * `criteria-resolver.ts` de ANTES da migração (`./_baseline-fase4-caixa/`,
 * reconstruída a partir do Read feito no início da sessão, antes de qualquer
 * edição) lado a lado com o motor atual, roda a MESMA matriz de cenários nos
 * dois, e compara os resultados numéricos campo a campo. Isso prova a mesma
 * coisa que um snapshot before/after provaria, só que numa única rodada.
 *
 * Não alterar `_baseline-fase4-caixa/` em nenhuma fase futura — é um
 * congelamento intencional do estado "pré-Fase 4".
 */
import { describe, it, expect } from 'vitest'
import { simularBanco as simularBancoNovo, simularTodosBancos as simularTodosBancosNovo, calcularPrazoMaximo } from '../engine'
import { simularBanco as simularBancoAntigo, simularTodosBancos as simularTodosBancosAntigo } from './_baseline-fase4-caixa/engine'
import type { InputFinanciamento } from '../tipos'
import type { BancoSimOverrides } from '../criteria'

const BASE_INPUT: InputFinanciamento = {
  valorImovel:     500_000,
  valorEntrada:    100_000,
  dataNascimento:  '1990-06-15',
  rendaMensal:     20_000,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       ['caixa'],
  tipoImovel:      'novo',
  finalidade:      'residencial',
}

// Compara todos os campos numéricos/relevantes de um ResultadoBanco (ignora resultadoId,
// que pode diferir de nome mas nunca de valor entre as duas implementações neste teste).
function expectResultadoEquivalente(novo: any, antigo: any) {
  expect(novo.elegivel).toBe(antigo.elegivel)
  expect(novo.bancoId).toBe(antigo.bancoId)
  expect(novo.programa).toBe(antigo.programa)
  expect(novo.motivoInelegivel).toBe(antigo.motivoInelegivel)
  expect(novo.valorFinanciado).toBeCloseTo(antigo.valorFinanciado, 6)
  expect(novo.maxFinanciavel30).toBeCloseTo(antigo.maxFinanciavel30, 2)
  expect(novo.parcelas).toBe(antigo.parcelas)
  expect(novo.primeiraParcela).toBeCloseTo(antigo.primeiraParcela, 6)
  expect(novo.ultimaParcela).toBeCloseTo(antigo.ultimaParcela, 6)
  expect(novo.taxaMensal).toBeCloseTo(antigo.taxaMensal, 12)
  expect(novo.taxaAnual).toBeCloseTo(antigo.taxaAnual, 12)
  expect(novo.totalJuros).toBeCloseTo(antigo.totalJuros, 4)
  expect(novo.totalSeguros).toBeCloseTo(antigo.totalSeguros, 4)
  expect(novo.totalPago).toBeCloseTo(antigo.totalPago, 4)
  expect(novo.tipoAmortizacao).toBe(antigo.tipoAmortizacao)
  if ('avisoRenda' in antigo || 'avisoRenda' in novo) {
    expect(novo.avisoRenda).toBe(antigo.avisoRenda)
  }
}

describe('Fase 4 — Caixa: simularBanco (equivalência antigo vs. novo)', () => {
  const cenarios: Array<{ nome: string; input: InputFinanciamento; overrides?: BancoSimOverrides }> = [
    { nome: 'SAC padrão, sem correntista', input: { ...BASE_INPUT } },
    { nome: 'SAC padrão, correntista', input: { ...BASE_INPUT, correntista: true } },
    // Cenários PRICE de prazo/LTV foram movidos para o describe dedicado abaixo
    // ("teto de prazo PRICE") — desde a correção do teto de 360 meses, PRICE diverge
    // de propósito do baseline congelado (que nunca teve essa distinção), então não
    // faz mais sentido compará-los por equivalência byte-a-byte com o motor antigo.
    { nome: 'SAC LTV 80% no limite', input: { ...BASE_INPUT, valorEntrada: 100_000 } },
    // Cenários de imóvel usado movidos para o describe dedicado abaixo ("LTV de imóvel
    // usado") — a penalidade de -10pp que o baseline aplicava foi removida (não tinha
    // lastro normativo e foi desmentida por simulação real no simulador oficial da
    // Caixa em 2026-07-07), então esses cenários agora divergem de propósito do baseline.
    { nome: 'cliente jovem (idade mín. MIP)', input: { ...BASE_INPUT, dataNascimento: '2002-01-01' } },
    { nome: 'cliente 45 anos (faixa MIP intermediária)', input: { ...BASE_INPUT, dataNascimento: '1980-01-01' } },
    { nome: 'cliente 68 anos (faixa MIP alta, prazo reduzido)', input: { ...BASE_INPUT, dataNascimento: '1957-01-01' } },
    { nome: 'cliente 80+ anos — inelegível', input: { ...BASE_INPUT, dataNascimento: '1940-01-01' } },
    { nome: 'valor do imóvel acima do teto SFH (2.25M)', input: { ...BASE_INPUT, valorImovel: 3_000_000, valorEntrada: 1_000_000 } },
    { nome: 'entrada maior que o imóvel — inelegível', input: { ...BASE_INPUT, valorEntrada: 600_000 } },
    { nome: 'Pró-Cotista (imóvel ≤ R$350k)', input: { ...BASE_INPUT, valorImovel: 300_000, valorEntrada: 60_000, rendaMensal: 8_000 } },
    { nome: 'MCMV Faixa 1 (renda ≤ 3.200, imóvel ≤ 270k)', input: { ...BASE_INPUT, valorImovel: 250_000, valorEntrada: 30_000, rendaMensal: 3_000 } },
    { nome: 'MCMV Faixa 3 (renda ≤ 9.600, imóvel ≤ 400k)', input: { ...BASE_INPUT, valorImovel: 380_000, valorEntrada: 80_000, rendaMensal: 9_000 } },
    { nome: 'MCMV Classe Média (renda ≤ 13.000, imóvel ≤ 600k)', input: { ...BASE_INPUT, valorImovel: 550_000, valorEntrada: 100_000, rendaMensal: 12_000 } },
    { nome: 'override: taxaAnual do banco de dados', input: { ...BASE_INPUT }, overrides: { taxaAnual: 0.0999 } },
    { nome: 'override: maxLtv do banco de dados (SAC)', input: { ...BASE_INPUT, valorEntrada: 100_000 }, overrides: { maxLtv: 0.85 } },
    { nome: 'override: mipRate do banco de dados', input: { ...BASE_INPUT }, overrides: { mipRate: 0.0005 } },
    { nome: 'override: dfiRate do banco de dados (deve ser ignorado — quirk preservado)', input: { ...BASE_INPUT }, overrides: { dfiRate: 0.001 } },
    { nome: 'override: prazoMaximoMeses do banco de dados', input: { ...BASE_INPUT }, overrides: { prazoMaximoMeses: 240 } },
    { nome: 'prazo curto por idade avançada + prazo banco pequeno', input: { ...BASE_INPUT, dataNascimento: '1965-03-01' }, overrides: { prazoMaximoMeses: 180 } },
  ]

  for (const { nome, input, overrides } of cenarios) {
    it(nome, () => {
      const novo = simularBancoNovo('caixa', input, overrides)
      const antigo = simularBancoAntigo('caixa', input, overrides)
      expectResultadoEquivalente(novo, antigo)
    })
  }
})

describe('Fase 4 — Caixa: simularTodosBancos / simularCaixaDuplo (equivalência antigo vs. novo)', () => {
  const cenarios: Array<{ nome: string; input: InputFinanciamento; overrides?: Partial<Record<string, BancoSimOverrides>> }> = [
    { nome: 'SBPE puro (valor/renda fora de MCMV e Pró-Cotista)', input: { ...BASE_INPUT } },
    { nome: 'Pró-Cotista + SBPE (imóvel ≤ 350k)', input: { ...BASE_INPUT, valorImovel: 300_000, valorEntrada: 60_000, rendaMensal: 8_000 } },
    { nome: 'MCMV + SBPE (sem Pró-Cotista, imóvel > 350k)', input: { ...BASE_INPUT, valorImovel: 550_000, valorEntrada: 100_000, rendaMensal: 12_000 } },
    { nome: 'Pró-Cotista + MCMV + SBPE (imóvel ≤ 350k e dentro de faixa MCMV)', input: { ...BASE_INPUT, valorImovel: 260_000, valorEntrada: 40_000, rendaMensal: 3_000 } },
    { nome: 'lote_urbanizado — só SBPE (MCMV/Pró-Cotista bloqueados)', input: { ...BASE_INPUT, valorImovel: 300_000, valorEntrada: 60_000, rendaMensal: 3_000, tipoOperacao: 'lote_urbanizado', tipoImovel: undefined } },
    { nome: 'comercial — só SBPE (MCMV/Pró-Cotista bloqueados)', input: { ...BASE_INPUT, valorImovel: 300_000, valorEntrada: 60_000, rendaMensal: 3_000, tipoOperacao: 'comercial', finalidade: 'comercial' } },
    { nome: 'jaRecebeuSubsidio=true — bloqueia MCMV/Pró-Cotista', input: { ...BASE_INPUT, valorImovel: 260_000, valorEntrada: 40_000, rendaMensal: 3_000, jaRecebeuSubsidio: true } },
    { nome: 'usaFgts=false — bloqueia só Pró-Cotista', input: { ...BASE_INPUT, valorImovel: 260_000, valorEntrada: 40_000, rendaMensal: 3_000, usaFgts: false } },
    // 'PRICE + Pró-Cotista + SBPE' movido para o describe "teto de prazo PRICE" abaixo
    // (mesmo motivo do describe anterior — PRICE agora diverge de propósito do baseline).
    { nome: 'override de taxaAnual aplicado ao SBPE dentro do duplo', input: { ...BASE_INPUT }, overrides: { caixa: { taxaAnual: 0.0999 } } },
  ]

  // Desde a Comparação de Cenários (SAC/PRICE), o motor novo produz 2 ids por programa
  // (`-sac`/`-price`) em vez de 1, e OMITE totalmente um programa cujos dois cenários
  // sejam inelegíveis (o baseline sempre empurrava 1 resultado por programa, elegível ou
  // não). Por isso a equivalência exata de contagem/ids deixou de fazer sentido — em vez
  // disso, para cada resultado ELEGÍVEL do baseline, confirma que existe um `-sac`
  // equivalente no motor novo (prova a equivalência do cenário SAC, que não mudou).
  // Resultados inelegíveis do baseline não têm contrapartida obrigatória: no motor novo,
  // um programa cujo único cenário testado (SAC) já é inelegível é omitido por completo.
  for (const { nome, input, overrides } of cenarios) {
    it(nome, () => {
      const novos = simularTodosBancosNovo(input, overrides)
      const antigos = simularTodosBancosAntigo(input, overrides)
      const antigosPorId = new Map(antigos.map((r) => [r.resultadoId, r]))
      antigosPorId.forEach((antigo, idBase) => {
        if (!antigo.elegivel) return
        const novoSac = novos.find((r) => r.resultadoId === `${idBase}-sac`)
        expect(novoSac, `esperava ${idBase}-sac`).toBeTruthy()
        expectResultadoEquivalente(novoSac, antigo)
      })
    })
  }
})

// Teto de prazo PRICE = 360 meses (SAC = 420) — MO30769 v032 seção 3.3, regra normativa
// confirmada, não calibração. Testado separadamente do baseline congelado (que nunca
// teve essa distinção) porque a divergência aqui é intencional, não uma regressão.
describe('Fase 4 — Caixa: teto de prazo PRICE (360 meses — MO30769 v032)', () => {
  it('PRICE respeita 360 meses; SAC continua com 420', () => {
    const price = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 150_000 })
    const sac = simularBancoNovo('caixa', { ...BASE_INPUT, valorEntrada: 100_000 })
    expect(price.elegivel).toBe(true)
    expect(price.parcelas).toBe(360)
    expect(sac.elegivel).toBe(true)
    expect(sac.parcelas).toBe(420)
  })

  it('LTV de PRICE (70%) continua sendo verificado independente do novo teto de prazo', () => {
    const dentro = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 150_000 })
    const excede = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 50_000 })
    expect(dentro.elegivel).toBe(true)
    expect(dentro.parcelas).toBe(360)
    expect(excede.elegivel).toBe(false)
    expect(excede.motivoInelegivel).toMatch(/excede.*imóvel/i)
  })

  it('teto de 360 meses do PRICE se mantém mesmo com override de maxLtv presente (mas ignorado pro PRICE)', () => {
    // financiado 70% (dentro do teto fixo do PRICE) — o override de maxLtv aqui não tem
    // nenhum efeito sobre o PRICE (ver teste abaixo), só confirma que sua mera presença
    // não interfere no cálculo de prazo.
    const resultado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 150_000 }, { maxLtv: 0.92 })
    expect(resultado.elegivel).toBe(true)
    expect(resultado.parcelas).toBe(360)
  })

  it('override de maxLtv do banco de dados NÃO vaza para o teto do PRICE (bug real de produção, 2026-07-07)', () => {
    // financiado 74% (valorEntrada 130k sobre 500k) — dentro do teto do SAC (mesmo sem
    // override) e do override de 75% (se vazasse pro PRICE), mas ACIMA do teto real e
    // fixo do PRICE (70%, cfg.maxLtvPrice — não configurável pela tabela `bancos`, que só
    // tem uma coluna `ltv_maximo` por banco, sem distinguir SAC de PRICE). A tabela
    // `bancos` (Configurações > Bancos) é a origem do bug: qualquer `ltv_maximo`
    // configurado — inclusive o valor padrão da coluna (80) — reabria o teto do PRICE de
    // 70% para 80%, aprovando financiamentos PRICE acima do que a Caixa realmente permite.
    const resultado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 130_000 }, { maxLtv: 0.75 })
    expect(resultado.elegivel).toBe(false)
    expect(resultado.motivoInelegivel).toMatch(/excede.*imóvel/i)
  })

  it('override de prazoMaximoMeses do banco de dados não estende PRICE além de 360', () => {
    const resultado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE' }, { prazoMaximoMeses: 420 })
    expect(resultado.parcelas).toBe(360)
  })

  it('idade+prazo continua podendo reduzir o teto de PRICE para menos de 360', () => {
    // Cliente com 68 anos: LIMITE_IDADE_PRAZO_MESES (966) - idade em meses já é < 360.
    const resultado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 150_000, dataNascimento: '1957-01-01' })
    expect(resultado.parcelas).toBeLessThan(360)
  })

  it('Pró-Cotista + SBPE em PRICE: ambos respeitam o teto de 360 meses', () => {
    const resultados = simularTodosBancosNovo(
      { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorImovel: 300_000, valorEntrada: 100_000, rendaMensal: 8_000 },
    )
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))
    expect(porId.get('caixa-procotista-price')?.parcelas).toBe(360)
    expect(porId.get('caixa-sbpe-price')?.parcelas).toBe(360)
  })
})

// LTV de imóvel usado: a Caixa NÃO reduz a cota máxima para imóvel usado — SAC 80% e
// PRICE 70%, idênticas às de imóvel novo. Havia uma penalidade de -10pp aqui (herdada do
// código hardcoded original, sem lastro em normativo — base-criterios-caixa.md seção 13),
// removida em 2026-07-07 após confirmação por simulação real no simulador oficial da
// Caixa (SBPE, imóvel usado, com relacionamento: cota SAC 80%/PRICE 70%, iguais às de
// imóvel novo). Testado diretamente (não é mais equivalência contra o baseline, que ainda
// tem a penalidade antiga).
describe('Fase 4 — Caixa: LTV de imóvel usado (sem penalidade — confirmado por simulação real)', () => {
  it('SAC: imóvel usado tem o mesmo teto de 80% que imóvel novo', () => {
    const usado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoImovel: 'usado', valorEntrada: 100_000 })
    const novo  = simularBancoNovo('caixa', { ...BASE_INPUT, tipoImovel: 'novo',  valorEntrada: 100_000 })
    expect(usado.elegivel).toBe(true)
    expect(usado.valorFinanciado).toBeCloseTo(novo.valorFinanciado, 6)
    expect(usado.primeiraParcela).toBeCloseTo(novo.primeiraParcela, 6)
  })

  it('PRICE: imóvel usado tem o mesmo teto de 70% que imóvel novo', () => {
    const usado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', tipoImovel: 'usado', valorEntrada: 150_000 })
    const novo  = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', tipoImovel: 'novo',  valorEntrada: 150_000 })
    expect(usado.elegivel).toBe(true)
    expect(usado.valorFinanciado).toBeCloseTo(novo.valorFinanciado, 6)
    expect(usado.primeiraParcela).toBeCloseTo(novo.primeiraParcela, 6)
  })

  // Caso-âncora real: simulador oficial da Caixa, 2026-07-07 — SBPE, imóvel usado,
  // com relacionamento, R$430.000, renda R$15.971,82, nascimento 04/08/1995, Maringá-PR.
  // SAC: cota 80%, prazo 420, entrada R$86.000, financiado R$344.000, 1ª R$3.985,59,
  // última R$851,38. PRICE: cota 70%, prazo 360, entrada R$129.000, financiado
  // R$301.000, 1ª R$2.890,86, última R$2.833,58. Tolerância de R$5 (dentro de 95-98%
  // de precisão pedido) — o motor não precisa bater ao centavo, os campos de seguro/
  // tarifa já são calibração empírica, não fórmula oficial publicada.
  it('caso-âncora real: SAC bate com o simulador oficial dentro de R$5', () => {
    const r = simularBancoNovo('caixa', {
      valorImovel: 430_000, valorEntrada: 86_000, dataNascimento: '1995-08-04',
      rendaMensal: 15_971.82, tipoAmortizacao: 'SAC', correntista: true,
      bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial',
    })
    expect(r.elegivel).toBe(true)
    expect(r.parcelas).toBe(420)
    expect(r.primeiraParcela).toBeCloseTo(3985.59, -1) // tolerância R$5 (diff real: R$1,21)
    expect(r.ultimaParcela).toBeCloseTo(851.38, -1)    // tolerância R$5 (diff real: R$0,06)
  })

  it('caso-âncora real: PRICE bate com o simulador oficial dentro de R$50', () => {
    const r = simularBancoNovo('caixa', {
      valorImovel: 430_000, valorEntrada: 129_000, dataNascimento: '1995-08-04',
      rendaMensal: 15_971.82, tipoAmortizacao: 'PRICE', correntista: true,
      bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial',
    })
    expect(r.elegivel).toBe(true)
    expect(r.parcelas).toBe(360)
    expect(r.primeiraParcela).toBeCloseTo(2890.86, -1) // tolerância R$5 (diff real: R$1,18)
    expect(r.ultimaParcela).toBeCloseTo(2833.58, -2)   // tolerância R$50 (diff real: R$20,49)
  })
})

// Caso-âncora real usado para calibrar a faixa jovem (≤30 anos) de CAIXA_MIP_RATES —
// até esta sessão só a faixa ≤50 tinha sido verificada contra o simulador oficial.
describe('Fase 4 — Caixa: caso-âncora real (calibração MIP faixa ≤30 anos, jul/2026)', () => {
  // Simulador oficial da Caixa, 2026-07-08 — SBPE Balcão, imóvel usado, sem
  // relacionamento, R$1.200.000, entrada R$350.000, financiado R$850.000, nascimento
  // 10/10/2000 (25 anos), Marialva-PR. SAC: cota 80%, prazo 420, 1ª R$9.946,23, última
  // R$2.067,24, taxa 11,49% a.a. efetiva. Última parcela batia exatamente mesmo antes da
  // calibração (MIP/DFI zerados nela) — só a 1ª divergia, por causa da faixa de MIP.
  it('SAC bate com o simulador oficial dentro de R$1 (faixa de MIP ≤30 anos calibrada)', () => {
    const r = simularBancoNovo('caixa', {
      valorImovel: 1_200_000, valorEntrada: 350_000, dataNascimento: '2000-10-10',
      rendaMensal: 100_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial',
    })
    expect(r.elegivel).toBe(true)
    expect(r.parcelas).toBe(420)
    expect(r.primeiraParcela).toBeCloseTo(9946.23, 0) // tolerância R$1 (diff real: R$0,02)
    expect(r.ultimaParcela).toBeCloseTo(2067.24, 0)
  })
})

// Comparação de Cenários: a Caixa passa a gerar SAC e PRICE automaticamente (via
// gerarCenariosComparativos, engine.ts) para cada programa aplicável — desde que ambos
// sejam elegíveis. Este describe testa o comportamento novo diretamente (não é mais uma
// prova de equivalência contra o baseline, que nunca teve essa distinção).
describe('Fase 4 — Caixa: Comparação de Cenários (SAC×PRICE automático)', () => {
  // valorEntrada: 150_000 sobre valorImovel: 500_000 → financiado 70% — dentro do LTV
  // máximo do SAC (80%) E do PRICE (70%), então os dois sistemas ficam elegíveis. A
  // entrada padrão de BASE_INPUT (100_000 → financiado 80%) já exclui o PRICE por LTV,
  // então não serve para testar o caminho "os dois elegíveis".
  const ENTRADA_AMBOS_ELEGIVEIS = 150_000

  it('SBPE puro: SAC e PRICE elegíveis, mesmo programa, ambos aparecem', () => {
    const resultados = simularTodosBancosNovo({ ...BASE_INPUT, valorEntrada: ENTRADA_AMBOS_ELEGIVEIS })
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))
    const sac = porId.get('caixa-sbpe-sac')
    const price = porId.get('caixa-sbpe-price')
    expect(sac?.elegivel).toBe(true)
    expect(price?.elegivel).toBe(true)
    expect(sac?.programa).toBe(price?.programa)
  })

  it('prazo máximo calculado separadamente por sistema: SAC 420, PRICE 360', () => {
    const resultados = simularTodosBancosNovo({ ...BASE_INPUT, valorEntrada: ENTRADA_AMBOS_ELEGIVEIS })
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))
    expect(porId.get('caixa-sbpe-sac')?.parcelas).toBe(420)
    expect(porId.get('caixa-sbpe-price')?.parcelas).toBe(360)
  })

  it('idade limita SAC e PRICE de forma independente (nunca copia o teto de um para o outro)', () => {
    const dataNascimento = '1957-01-01' // ~69 anos: teto de idade+prazo fica entre 12 e 360 meses
    const resultados = simularTodosBancosNovo({ ...BASE_INPUT, valorEntrada: ENTRADA_AMBOS_ELEGIVEIS, dataNascimento })
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))
    const tetoSac   = calcularPrazoMaximo(dataNascimento, 420)
    const tetoPrice = calcularPrazoMaximo(dataNascimento, 360)
    expect(tetoSac).toBeLessThan(420) // confirma que a idade realmente está limitando
    expect(porId.get('caixa-sbpe-sac')?.parcelas).toBe(tetoSac)
    expect(porId.get('caixa-sbpe-price')?.parcelas).toBe(tetoPrice)
  })

  it('entrada informada não atinge o teto do PRICE (70%): entrada é ajustada para cima, PRICE não fica ausente', () => {
    // Calibração jul/2026: o simulador oficial da Caixa NUNCA rejeita PRICE por LTV — ele
    // recalcula a entrada/financiado para caber exatamente no teto de 70%, em vez de
    // declarar inelegível (comportamento anterior deste teste, já descontinuado).
    const resultados = simularTodosBancosNovo({ ...BASE_INPUT, valorImovel: 500_000, valorEntrada: 120_000 })
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))
    const sac = porId.get('caixa-sbpe-sac')
    const price = porId.get('caixa-sbpe-price')
    expect(sac?.elegivel).toBe(true)
    expect(sac?.valorFinanciado).toBeCloseTo(500_000 - 120_000, 6) // SAC usa a entrada informada, sem ajuste
    expect(price?.elegivel).toBe(true)
    expect(price?.valorFinanciado).toBeCloseTo(500_000 * 0.70, 6) // PRICE: entrada ajustada para 150_000 (30%)
    expect(price?.observacao).toContain('Entrada ajustada')
  })

  it('entrada informada já atinge o teto do PRICE (70%): não ajusta nem anota observação', () => {
    const resultados = simularTodosBancosNovo({ ...BASE_INPUT, valorImovel: 500_000, valorEntrada: 150_000 })
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))
    const price = porId.get('caixa-sbpe-price')
    expect(price?.elegivel).toBe(true)
    expect(price?.valorFinanciado).toBeCloseTo(350_000, 6)
    expect(price?.observacao ?? '').not.toContain('Entrada ajustada')
  })

  it('outros bancos continuam com exatamente 1 resultado, idêntico ao motor antigo', () => {
    const bancosIds: InputFinanciamento['bancosIds'] = ['caixa', 'itau', 'bradesco', 'santander', 'bb', 'inter', 'daycoval']
    const input = { ...BASE_INPUT, bancosIds }
    const novos = simularTodosBancosNovo(input)
    const antigos = simularTodosBancosAntigo(input)
    const novosNaoCaixa = novos.filter((r) => r.bancoId !== 'caixa')
    const antigosNaoCaixa = antigos.filter((r) => r.bancoId !== 'caixa')
    expect(novosNaoCaixa.length).toBe(antigosNaoCaixa.length)
    const antigosPorId = new Map(antigosNaoCaixa.map((r) => [r.resultadoId, r]))
    novosNaoCaixa.forEach((novo) => {
      expectResultadoEquivalente(novo, antigosPorId.get(novo.resultadoId))
    })
  })
})

describe('Fase 4 — Caixa: varredura de idades (todas as faixas de MIP)', () => {
  // CAIXA_MIP_RATES tem tetos em 30/35/40/45/50/55/60/65/999 — testa uma idade em cada
  // faixa (e uma na fronteira exata) para garantir que `estrategiaMipCaixaSbpe` +
  // `resolverTaxaMip('teto-idade')` bate exatamente com o antigo `getCaixaMipRate`.
  const anoAtual = new Date().getFullYear()
  const idades = [20, 30, 31, 35, 36, 40, 41, 45, 46, 50, 51, 55, 56, 60, 61, 65, 66, 70, 75]

  for (const idade of idades) {
    it(`idade ${idade} anos`, () => {
      const dataNascimento = `${anoAtual - idade}-06-15`
      const input: InputFinanciamento = { ...BASE_INPUT, dataNascimento }
      const novo = simularBancoNovo('caixa', input)
      const antigo = simularBancoAntigo('caixa', input)
      expectResultadoEquivalente(novo, antigo)
    })
  }
})
