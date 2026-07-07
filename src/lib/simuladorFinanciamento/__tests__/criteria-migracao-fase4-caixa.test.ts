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
    { nome: 'imóvel usado — penalidade de 10pp no LTV', input: { ...BASE_INPUT, tipoImovel: 'usado', valorEntrada: 100_000 } },
    { nome: 'imóvel usado — dentro do novo limite (70%)', input: { ...BASE_INPUT, tipoImovel: 'usado', valorEntrada: 150_000 } },
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

  it('override de maxLtv do banco de dados (PRICE) não abre exceção ao teto de 360 meses', () => {
    const resultado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 130_000 }, { maxLtv: 0.75 })
    expect(resultado.elegivel).toBe(true)
    expect(resultado.parcelas).toBe(360)
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

  it('só um sistema elegível (PRICE excede LTV 70%, SAC dentro de 80%): PRICE fica totalmente ausente', () => {
    const resultados = simularTodosBancosNovo({ ...BASE_INPUT, valorImovel: 500_000, valorEntrada: 120_000 })
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))
    expect(porId.get('caixa-sbpe-sac')?.elegivel).toBe(true)
    expect(porId.has('caixa-sbpe-price')).toBe(false) // omitido por completo, não aparece nem como inelegível
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
