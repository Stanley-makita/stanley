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

// Usado nos describes de equivalência antigo vs. novo (que comparam `simularBanco`/
// `simularTodosBancos` da baseline congelada contra o motor atual). valorImovel = 700_000
// (não 500_000) de propósito, desde jul/2026: CAIXA_PRO_COTISTA.maxValorImovel é
// exatamente 500_000 (corrigido pelo normativo) e o Pró-Cotista passou a ter seu próprio
// LTV (60%, também corrigido) — com valorImovel=500_000, `BASE_INPUT` cairia bem na
// fronteira, o "novo" motor entraria no Pró-Cotista (LTV mais apertado) enquanto a
// baseline (`_baseline-fase4-caixa/engine.ts`, que herda o LTV do SBPE pro Pró-Cotista,
// nunca corrigido lá de propósito) continuaria elegível — divergência real, mas sem
// nenhuma relação com o que esses testes querem provar (SAC/PRICE, prazo, idade, MIP,
// overrides). 700_000 fica acima do teto do Pró-Cotista E do maior teto do MCMV (600_000
// da Classe Média), então nenhum dos dois programas é acionado em nenhum dos dois lados.
// Os testes que usam isso só comparam novo≈antigo entre si (nunca hardcodam um valor
// absoluto), então a troca de 500_000 pra 700_000 não quebra nenhuma proporção verificada.
const BASE_INPUT_EQUIV: InputFinanciamento = { ...BASE_INPUT, valorImovel: 700_000 }

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
    { nome: 'SAC padrão, sem correntista', input: { ...BASE_INPUT_EQUIV } },
    { nome: 'SAC padrão, correntista', input: { ...BASE_INPUT_EQUIV, correntista: true } },
    // Cenários PRICE de prazo/LTV foram movidos para o describe dedicado abaixo
    // ("teto de prazo PRICE") — desde a correção do teto de 360 meses, PRICE diverge
    // de propósito do baseline congelado (que nunca teve essa distinção), então não
    // faz mais sentido compará-los por equivalência byte-a-byte com o motor antigo.
    { nome: 'SAC LTV 80% no limite', input: { ...BASE_INPUT_EQUIV, valorEntrada: 100_000 } },
    // Cenários de imóvel usado movidos para o describe dedicado abaixo ("LTV de imóvel
    // usado") — a penalidade de -10pp que o baseline aplicava foi removida (não tinha
    // lastro normativo e foi desmentida por simulação real no simulador oficial da
    // Caixa em 2026-07-07), então esses cenários agora divergem de propósito do baseline.
    // 'cliente 45 anos' e 'cliente 68 anos' movidos para o describe dedicado abaixo
    // ("idade — nascidos no dia 1º do mês") — a correção de 2026-07-13 no fuso horário de
    // `calcularIdadeEmMeses` (ver engine.ts) faz com que datas de nascimento no dia 1º de
    // qualquer mês deixem de somar 1 mês indevido à idade; o baseline (congelado) ainda
    // tem o bug antigo, então esses dois casos agora divergem de propósito. 'cliente
    // jovem' (2002-01-01) e 'cliente 80+' (1940-01-01) também nascem no dia 1º, mas
    // continuam batendo aqui porque a diferença de 1 mês não muda o resultado testado:
    // no jovem, o prazo já satura no teto do banco de qualquer forma; no 80+, o corte
    // duro de idade (`idadeMaximaAbsoluta`, baseado em anos, não meses) já dá inelegível
    // nos dois lados.
    { nome: 'cliente jovem (idade mín. MIP)', input: { ...BASE_INPUT_EQUIV, dataNascimento: '2002-01-01' } },
    { nome: 'cliente 80+ anos — inelegível', input: { ...BASE_INPUT_EQUIV, dataNascimento: '1940-01-01' } },
    { nome: 'valor do imóvel acima do teto SFH (2.25M)', input: { ...BASE_INPUT_EQUIV, valorImovel: 3_000_000, valorEntrada: 1_000_000 } },
    { nome: 'entrada maior que o imóvel — inelegível', input: { ...BASE_INPUT_EQUIV, valorEntrada: 600_000 } },
    { nome: 'Pró-Cotista (imóvel ≤ R$350k)', input: { ...BASE_INPUT_EQUIV, valorImovel: 300_000, valorEntrada: 60_000, rendaMensal: 8_000 } },
    { nome: 'MCMV Faixa 1 (renda ≤ 3.200, imóvel ≤ 270k)', input: { ...BASE_INPUT_EQUIV, valorImovel: 250_000, valorEntrada: 30_000, rendaMensal: 3_000 } },
    { nome: 'MCMV Faixa 3 (renda ≤ 9.600, imóvel ≤ 400k)', input: { ...BASE_INPUT_EQUIV, valorImovel: 380_000, valorEntrada: 80_000, rendaMensal: 9_000 } },
    { nome: 'MCMV Classe Média (renda ≤ 13.000, imóvel ≤ 600k)', input: { ...BASE_INPUT_EQUIV, valorImovel: 550_000, valorEntrada: 100_000, rendaMensal: 12_000 } },
    { nome: 'override: taxaAnual do banco de dados', input: { ...BASE_INPUT_EQUIV }, overrides: { taxaAnual: 0.0999 } },
    { nome: 'override: maxLtv do banco de dados (SAC)', input: { ...BASE_INPUT_EQUIV, valorEntrada: 100_000 }, overrides: { maxLtv: 0.85 } },
    { nome: 'override: mipRate do banco de dados', input: { ...BASE_INPUT_EQUIV }, overrides: { mipRate: 0.0005 } },
    { nome: 'override: dfiRate do banco de dados (deve ser ignorado — quirk preservado)', input: { ...BASE_INPUT_EQUIV }, overrides: { dfiRate: 0.001 } },
    { nome: 'override: prazoMaximoMeses do banco de dados', input: { ...BASE_INPUT_EQUIV }, overrides: { prazoMaximoMeses: 240 } },
    // 'prazo curto por idade avançada' (dataNascimento '1965-03-01', dia 1º) também movido
    // para o describe dedicado abaixo — mesmo motivo dos dois casos de idade acima.
  ]

  for (const { nome, input, overrides } of cenarios) {
    it(nome, () => {
      const novo = simularBancoNovo('caixa', input, overrides)
      const antigo = simularBancoAntigo('caixa', input, overrides)
      expectResultadoEquivalente(novo, antigo)
    })
  }
})

// Correção de 2026-07-13: `calcularIdadeEmMeses`/`calcularIdadeEmAnos` (engine.ts) liam a
// data de nascimento via `new Date(dataNasc).getFullYear()/getMonth()` — hora LOCAL do
// processo. Para nascimentos no dia 1º de qualquer mês, a meia-noite UTC vira 21h do dia
// anterior em fusos negativos (ex.: America/Sao_Paulo, UTC-3), empurrando a data para o mês
// anterior e somando 1 mês indevido à idade. Corrigido fixando o cálculo em
// America/Sao_Paulo (fuso do negócio), independente de onde o processo Node roda. Só testado
// contra o motor novo (não contra `_baseline-fase4-caixa/`, que preserva o bug antigo de
// propósito) — ver os 3 casos removidos da lista de equivalência acima.
describe('Fase 4 — Caixa: idade — nascidos no dia 1º do mês (correção do bug de fuso em calcularIdadeEmMeses)', () => {
  it('cliente 45 anos (faixa MIP intermediária) — 1980-01-01', () => {
    const r = simularBancoNovo('caixa', { ...BASE_INPUT_EQUIV, dataNascimento: '1980-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('cliente 68 anos (faixa MIP alta, prazo reduzido) — 1957-01-01', () => {
    const r = simularBancoNovo('caixa', { ...BASE_INPUT_EQUIV, dataNascimento: '1957-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('prazo curto por idade avançada + prazo banco pequeno — 1965-03-01', () => {
    const r = simularBancoNovo('caixa', { ...BASE_INPUT_EQUIV, dataNascimento: '1965-03-01' }, { prazoMaximoMeses: 180 })
    expect(r).toMatchSnapshot()
  })
})

describe('Fase 4 — Caixa: simularTodosBancos / simularCaixaDuplo (equivalência antigo vs. novo)', () => {
  const cenarios: Array<{ nome: string; input: InputFinanciamento; overrides?: Partial<Record<string, BancoSimOverrides>> }> = [
    { nome: 'SBPE puro (valor/renda fora de MCMV e Pró-Cotista)', input: { ...BASE_INPUT_EQUIV } },
    // 'Pró-Cotista + SBPE (imóvel ≤ 350k)' movido para o describe dedicado "LTV do
    // Pró-Cotista" abaixo — desde a correção de jul/2026 (Pró-Cotista passou a ter seu
    // próprio teto de 60%, a baseline continua herdando o do SBPE), diverge de propósito.
    { nome: 'MCMV + SBPE (sem Pró-Cotista, imóvel > 350k)', input: { ...BASE_INPUT_EQUIV, valorImovel: 550_000, valorEntrada: 100_000, rendaMensal: 12_000 } },
    { nome: 'Pró-Cotista + MCMV + SBPE (imóvel ≤ 350k e dentro de faixa MCMV)', input: { ...BASE_INPUT_EQUIV, valorImovel: 260_000, valorEntrada: 40_000, rendaMensal: 3_000 } },
    { nome: 'lote_urbanizado — só SBPE (MCMV/Pró-Cotista bloqueados)', input: { ...BASE_INPUT_EQUIV, valorImovel: 300_000, valorEntrada: 60_000, rendaMensal: 3_000, tipoOperacao: 'lote_urbanizado', tipoImovel: undefined } },
    { nome: 'comercial — só SBPE (MCMV/Pró-Cotista bloqueados)', input: { ...BASE_INPUT_EQUIV, valorImovel: 300_000, valorEntrada: 60_000, rendaMensal: 3_000, tipoOperacao: 'comercial', finalidade: 'comercial' } },
    { nome: 'jaRecebeuSubsidio=true — bloqueia MCMV/Pró-Cotista', input: { ...BASE_INPUT_EQUIV, valorImovel: 260_000, valorEntrada: 40_000, rendaMensal: 3_000, jaRecebeuSubsidio: true } },
    { nome: 'usaFgts=false — bloqueia só Pró-Cotista', input: { ...BASE_INPUT_EQUIV, valorImovel: 260_000, valorEntrada: 40_000, rendaMensal: 3_000, usaFgts: false } },
    // 'PRICE + Pró-Cotista + SBPE' movido para o describe "teto de prazo PRICE" abaixo
    // (mesmo motivo do describe anterior — PRICE agora diverge de propósito do baseline).
    { nome: 'override de taxaAnual aplicado ao SBPE dentro do duplo', input: { ...BASE_INPUT_EQUIV }, overrides: { caixa: { taxaAnual: 0.0999 } } },
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
  // `usaFgts: false` nos 3 primeiros testes: isola a checagem do LTV/prazo do SBPE do
  // Pró-Cotista (jul/2026, LTV próprio de 60% — sem isso, `BASE_INPUT` (imóvel ≤ 500k,
  // novo) seria roteado pro Pró-Cotista, cujo teto mais apertado quebraria a asserção de
  // `elegivel` por um motivo que não tem nada a ver com o que este teste quer provar).
  it('PRICE respeita 360 meses; SAC continua com 420', () => {
    const price = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 150_000, usaFgts: false })
    const sac = simularBancoNovo('caixa', { ...BASE_INPUT, valorEntrada: 100_000, usaFgts: false })
    expect(price.elegivel).toBe(true)
    expect(price.parcelas).toBe(360)
    expect(sac.elegivel).toBe(true)
    expect(sac.parcelas).toBe(420)
  })

  it('LTV de PRICE (70%) continua sendo verificado independente do novo teto de prazo', () => {
    const dentro = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 150_000, usaFgts: false })
    const excede = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 50_000, usaFgts: false })
    expect(dentro.elegivel).toBe(true)
    expect(dentro.parcelas).toBe(360)
    expect(excede.elegivel).toBe(false)
    expect(excede.motivoInelegivel).toMatch(/excede.*imóvel/i)
  })

  it('teto de 360 meses do PRICE se mantém mesmo com override de maxLtv presente (mas ignorado pro PRICE)', () => {
    // financiado 70% (dentro do teto fixo do PRICE) — o override de maxLtv aqui não tem
    // nenhum efeito sobre o PRICE (ver teste abaixo), só confirma que sua mera presença
    // não interfere no cálculo de prazo.
    const resultado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 150_000, usaFgts: false }, { maxLtv: 0.92 })
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
    const resultado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', usaFgts: false }, { prazoMaximoMeses: 420 })
    expect(resultado.parcelas).toBe(360)
  })

  it('idade+prazo continua podendo reduzir o teto de PRICE para menos de 360', () => {
    // Cliente com 68 anos: LIMITE_IDADE_PRAZO_MESES (966) - idade em meses já é < 360.
    const resultado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorEntrada: 150_000, dataNascimento: '1957-01-01', usaFgts: false })
    expect(resultado.parcelas).toBeLessThan(360)
  })

  // Pró-Cotista NÃO herda o teto de 360 do PRICE — corrigido jul/2026: essa regra é do
  // SBPE (MO30769 §3.3), enquanto MO30824 v040 §5.4 mostra prazo máximo = 420 pros dois
  // sistemas no Pró-Cotista (só o mínimo difere entre SAC/SFA-TP). Confirmado no
  // simulador oficial (Classe Média, mesma família de programas MCMV/Pró-Cotista, imóvel
  // usado, PRICE: prazo 420, não 360 — ver describe "LTV do MCMV Classe Média" abaixo).
  it('Pró-Cotista em PRICE respeita 420 meses (não herda o teto de 360 do SBPE); SBPE continua em 360', () => {
    const resultados = simularTodosBancosNovo(
      { ...BASE_INPUT, tipoAmortizacao: 'PRICE', valorImovel: 300_000, valorEntrada: 120_000, rendaMensal: 8_000 },
    )
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))
    expect(porId.get('caixa-procotista-price')?.parcelas).toBe(420)
    expect(porId.get('caixa-sbpe-price')?.parcelas).toBe(360)
  })
})

// LTV do Pró-Cotista: normativo MO30824 v040 §5.4 ("parametros mcmv.pdf") — quota máxima
// de 60% (SAC e SFA/TP), corrigido jul/2026 (antes herdava o LTV do SBPE, 80%/70%).
// Testado diretamente (não é mais equivalência contra o baseline, que nunca teve esse
// teto próprio — ver 'Pró-Cotista + SBPE (imóvel ≤ 350k)', removido do describe de
// equivalência acima pelo mesmo motivo).
describe('Fase 4 — Caixa: LTV do Pró-Cotista (60% — MO30824 v040 §5.4)', () => {
  it('financiamento dentro de 60% do imóvel: elegível', () => {
    const resultado = simularBancoNovo('caixa', {
      valorImovel: 300_000, valorEntrada: 120_000, dataNascimento: '1990-06-15',
      rendaMensal: 20_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial',
    })
    expect(resultado.elegivel).toBe(true)
    expect(resultado.programa).toBe('Pró-Cotista FGTS')
    expect(resultado.valorFinanciado).toBeCloseTo(180_000, 6)
  })

  it('financiamento acima de 60% do imóvel: inelegível (antes ficava elegível, herdando os 80% do SBPE)', () => {
    const resultado = simularBancoNovo('caixa', {
      valorImovel: 300_000, valorEntrada: 100_000, dataNascimento: '1990-06-15',
      rendaMensal: 20_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial',
    })
    expect(resultado.elegivel).toBe(false)
    expect(resultado.motivoInelegivel).toMatch(/excede 60% do imóvel/)
  })
})

// LTV do MCMV Classe Média em imóvel usado (região Sul/Sudeste): 60%, não 80% — normativo
// MO30824 v040 §6.5. Caso-âncora real: simulador oficial da Caixa, 09/07/2026, renda
// R$13.000, imóvel R$430.000 usado (Maringá-PR), nascimento 04/08/1995, PRICE — entrada
// ajustada de R$108.119 para R$172.000 (40%), financiado R$258.000 (60%). Corrigido
// jul/2026 (dois bugs juntos): (1) `ltvMcmv()` não aplicava a penalidade de -20pp de
// imóvel usado nesta faixa; (2) `construirCenariosCaixa` calculava a entrada mínima do
// PRICE contra o LTV "cheio" (novo), sem descontar a penalidade — então mesmo com o LTV
// certo no critério, o ajuste automático de entrada nunca alcançava o teto real de usado.
describe('Fase 4 — Caixa: LTV do MCMV Classe Média em imóvel usado (60% — MO30824 v040 §6.5)', () => {
  it('caso-âncora real: entrada ajustada para 40%, financiado R$258.000', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 430_000, valorEntrada: 108_119, dataNascimento: '1995-08-04',
      rendaMensal: 13_000, tipoAmortizacao: 'PRICE', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial',
    })
    const mcmvPrice = resultados.find((r) => r.resultadoId === 'caixa-mcmv-price')
    expect(mcmvPrice?.elegivel).toBe(true)
    expect(mcmvPrice?.programa).toBe('MCMV Classe Média')
    expect(mcmvPrice?.valorFinanciado).toBeCloseTo(258_000, 6)
    expect(mcmvPrice?.observacao).toContain('172.000')
    // Prazo PRICE do MCMV é 420, não 360 (teto de 360 é regra do SBPE, MO30769 §3.3, que
    // o MCMV/Pró-Cotista não herdam — MO30824 v040 §6.5 mostra máximo 420 pros dois
    // sistemas). Confirmado no simulador oficial: mesmo cenário, PRICE aparece com prazo
    // 420, não 360 — bug real corrigido jul/2026 (`prazoMaximoMesesPrice` não era
    // sobrescrito na construção do critério MCMV/Pró-Cotista).
    expect(mcmvPrice?.parcelas).toBe(420)
  })

  it('imóvel novo continua na cota cheia de 80% (sem penalidade)', () => {
    const resultado = simularBancoNovo('caixa', {
      valorImovel: 430_000, valorEntrada: 108_119, dataNascimento: '1995-08-04',
      rendaMensal: 13_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial',
    })
    expect(resultado.elegivel).toBe(true)
    expect(resultado.programa).toBe('MCMV Classe Média')
    expect(resultado.valorFinanciado).toBeCloseTo(430_000 - 108_119, 6)
  })
})

// Seguro (MIP) do MCMV Classe Média: normal por idade (igual ao SBPE), NÃO o subsidiado
// de baixa renda das Faixas 1-3. Corrigido jul/2026: `MCMV_FAIXAS` tinha
// `mipSubsidizado: true` pra Classe Média, contradizendo um comentário mais antigo no
// próprio arquivo ("Faixa 4 usa MIP normal") — e dando um seguro ~40% mais barato que o
// real. Caso-âncora real: simulador oficial da Caixa, 09/07/2026, renda R$13.000, imóvel
// R$450.000 usado (Maringá-PR), nascimento 20/02/2000 (idade 26) — última parcela batia
// exato (juros/amortização corretos), mas a 1ª divergia ~R$21-22 tanto no SAC quanto no
// PRICE — isolado como sendo 100% o componente de seguro (MIP subsidiado, 0,0000151,
// dava ~R$34/mês; MIP normal por idade ≤30, 0,000096, mais DFI padrão 0,000066, dá
// ~R$55/mês — bate com o oficial).
describe('Fase 4 — Caixa: seguro do MCMV Classe Média é o normal por idade, não o subsidiado', () => {
  it('caso-âncora real: 1ª parcela bate dentro de R$1 (antes divergia ~R$22)', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 450_000, valorEntrada: 180_000, dataNascimento: '2000-02-20',
      rendaMensal: 13_000, tipoAmortizacao: 'PRICE', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial',
    })
    const price = resultados.find((r) => r.resultadoId === 'caixa-mcmv-price')
    const sac = resultados.find((r) => r.resultadoId === 'caixa-mcmv-sac')
    expect(price?.elegivel).toBe(true)
    expect(price?.primeiraParcela).toBeCloseTo(2401.02, 0) // oficial: R$2.401,02
    expect(price?.ultimaParcela).toBeCloseTo(2346.12, 0)   // oficial: R$2.346,12
    expect(sac?.elegivel).toBe(true)
    expect(sac?.primeiraParcela).toBeCloseTo(2972.75, 0)   // oficial: R$2.972,75
    expect(sac?.ultimaParcela).toBeCloseTo(673.21, 0)      // oficial: R$673,21
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
  // `usaFgts: false` nos dois testes abaixo: isola a comparação de LTV do SBPE do efeito
  // do Pró-Cotista (jul/2026, restrito a imóvel novo — sem isso, o cenário "novo" seria
  // roteado pro Pró-Cotista, mais barato, e "usado" ficaria no SBPE, quebrando a
  // equivalência de LTV que este teste quer provar, por um motivo totalmente diferente).
  it('SAC: imóvel usado tem o mesmo teto de 80% que imóvel novo', () => {
    const usado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoImovel: 'usado', valorEntrada: 100_000, usaFgts: false })
    const novo  = simularBancoNovo('caixa', { ...BASE_INPUT, tipoImovel: 'novo',  valorEntrada: 100_000, usaFgts: false })
    expect(usado.elegivel).toBe(true)
    expect(usado.valorFinanciado).toBeCloseTo(novo.valorFinanciado, 6)
    expect(usado.primeiraParcela).toBeCloseTo(novo.primeiraParcela, 6)
  })

  it('PRICE: imóvel usado tem o mesmo teto de 70% que imóvel novo', () => {
    const usado = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', tipoImovel: 'usado', valorEntrada: 150_000, usaFgts: false })
    const novo  = simularBancoNovo('caixa', { ...BASE_INPUT, tipoAmortizacao: 'PRICE', tipoImovel: 'novo',  valorEntrada: 150_000, usaFgts: false })
    expect(usado.elegivel).toBe(true)
    expect(usado.valorFinanciado).toBeCloseTo(novo.valorFinanciado, 6)
    expect(usado.primeiraParcela).toBeCloseTo(novo.primeiraParcela, 6)
  })

  // Caso-âncora real: simulador oficial da Caixa, 2026-07-07 — SBPE, imóvel usado,
  // COM relacionamento (correntista), R$430.000, renda R$15.971,82, nascimento
  // 04/08/1995, Maringá-PR. SAC: cota 80%, prazo 420, entrada R$86.000, financiado
  // R$344.000, 1ª R$3.985,59, última R$851,38. PRICE: cota 70%, prazo 360, entrada
  // R$129.000, financiado R$301.000, 1ª R$2.890,86, última R$2.833,58.
  //
  // A investigação de jul/2026 (12 simulações novas, R$450k, idades 25/30/45 × SAC/PRICE
  // × com/sem relacionamento) provou que o seguro NÃO varia por relacionamento — a
  // hipótese anterior (que motivou uma tolerância alargada aqui) vinha de um bug real e
  // separado: `taxaAnualCorrentista` da Caixa estava em 0.1119 (Bonificação 2, exige
  // crédito salário/débito automático) em vez de 0.1129 (Bonificação 1, só
  // "relacionamento: Sim" — o cenário real testado aqui). Corrigidos os dois problemas
  // (MIP ≤30 e a taxa correntista), este caso bate a poucos centavos — tolerância voltou
  // a ser apertada.
  // `usaFgts: false` em todos os casos-âncora desta seção: as simulações oficiais
  // responderam "Não" para "possui 3 anos de trabalho sob regime do FGTS" — sem isso,
  // `simularBanco` aplicava Pró-Cotista (8,66%) para qualquer imóvel ≤ CAIXA_PRO_COTISTA.
  // maxValorImovel (500k desde a correção de jul/2026), ignorando elegibilidade real de
  // FGTS — bug agora corrigido em `engine.ts` (`simularBanco`, branch Pró-Cotista, alinhado
  // com a checagem que `simularCaixaDuplo`/produção já fazia).
  it('caso-âncora real: SAC bate com o simulador oficial dentro de R$1', () => {
    const r = simularBancoNovo('caixa', {
      valorImovel: 430_000, valorEntrada: 86_000, dataNascimento: '1995-08-04',
      rendaMensal: 15_971.82, tipoAmortizacao: 'SAC', correntista: true, usaFgts: false,
      bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial',
    })
    expect(r.elegivel).toBe(true)
    expect(r.parcelas).toBe(420)
    expect(r.primeiraParcela).toBeCloseTo(3985.59, 0) // diff real: R$0,02
    expect(r.ultimaParcela).toBeCloseTo(851.38, 0)    // diff real: R$0,00
  })

  it('caso-âncora real: PRICE bate com o simulador oficial dentro de R$1', () => {
    const r = simularBancoNovo('caixa', {
      valorImovel: 430_000, valorEntrada: 129_000, dataNascimento: '1995-08-04',
      rendaMensal: 15_971.82, tipoAmortizacao: 'PRICE', correntista: true, usaFgts: false,
      bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial',
    })
    expect(r.elegivel).toBe(true)
    expect(r.parcelas).toBe(360)
    expect(r.primeiraParcela).toBeCloseTo(2890.86, 0) // diff real: R$0,01
    expect(r.ultimaParcela).toBeCloseTo(2833.58, 0)   // diff real: R$0,01
  })

  // Dataset de calibração jul/2026: 12 simulações reais no caixa.gov.br, mesmo imóvel
  // (R$450.000, usado, Maringá-PR, renda R$15.981,82), cruzando idade (25/30/45) ×
  // sistema (SAC/PRICE) × relacionamento (com/sem) — todas na coluna "Caixa Residencial
  // Habitacional". Usado pra recalibrar CAIXA_MIP_RATES (faixas ≤25/≤30/≤45) e corrigir
  // taxaAnualCorrentista (0.1119 → 0.1129). Batem a 1-2 centavos em todos os 12 casos.
  const CASOS_450K = [
    { nome: 'idade 25, SAC, sem relacionamento',  dataNascimento: '2001-08-04', tipoAmortizacao: 'SAC' as const,   correntista: false, oficial1a: 4223.09, oficialUlt: 889.94 },
    { nome: 'idade 25, SAC, com relacionamento',  dataNascimento: '2001-08-04', tipoAmortizacao: 'SAC' as const,   correntista: true,  oficial1a: 4168.73, oficialUlt: 889.81 },
    { nome: 'idade 25, PRICE, sem relacionamento', dataNascimento: '2001-08-04', tipoAmortizacao: 'PRICE' as const, correntista: false, oficial1a: 3066.18, oficialUlt: 3007.19 },
    { nome: 'idade 25, PRICE, com relacionamento', dataNascimento: '2001-08-04', tipoAmortizacao: 'PRICE' as const, correntista: true,  oficial1a: 3023.20, oficialUlt: 2964.21 },
    { nome: 'idade 30, SAC, sem relacionamento',  dataNascimento: '1996-08-04', tipoAmortizacao: 'SAC' as const,   correntista: false, oficial1a: 4224.17, oficialUlt: 889.94 },
    { nome: 'idade 30, SAC, com relacionamento',  dataNascimento: '1996-08-04', tipoAmortizacao: 'SAC' as const,   correntista: true,  oficial1a: 4169.81, oficialUlt: 889.81 },
    { nome: 'idade 30, PRICE, sem relacionamento', dataNascimento: '1996-08-04', tipoAmortizacao: 'PRICE' as const, correntista: false, oficial1a: 3067.13, oficialUlt: 3007.19 },
    { nome: 'idade 30, PRICE, com relacionamento', dataNascimento: '1996-08-04', tipoAmortizacao: 'PRICE' as const, correntista: true,  oficial1a: 3024.15, oficialUlt: 2964.21 },
    { nome: 'idade 45, SAC, sem relacionamento',  dataNascimento: '1981-08-04', tipoAmortizacao: 'SAC' as const,   correntista: false, oficial1a: 4280.33, oficialUlt: 889.94 },
    { nome: 'idade 45, SAC, com relacionamento',  dataNascimento: '1981-08-04', tipoAmortizacao: 'SAC' as const,   correntista: true,  oficial1a: 4225.97, oficialUlt: 889.81 },
    { nome: 'idade 45, PRICE, sem relacionamento', dataNascimento: '1981-08-04', tipoAmortizacao: 'PRICE' as const, correntista: false, oficial1a: 3116.27, oficialUlt: 3007.19 },
    { nome: 'idade 45, PRICE, com relacionamento', dataNascimento: '1981-08-04', tipoAmortizacao: 'PRICE' as const, correntista: true,  oficial1a: 3073.29, oficialUlt: 2964.21 },
  ]

  for (const c of CASOS_450K) {
    it(`caso-âncora real (R$450k): ${c.nome} bate dentro de R$1`, () => {
      const r = simularBancoNovo('caixa', {
        valorImovel: 450_000, valorEntrada: c.tipoAmortizacao === 'SAC' ? 90_000 : 135_000,
        dataNascimento: c.dataNascimento, rendaMensal: 15_981.82, tipoAmortizacao: c.tipoAmortizacao,
        correntista: c.correntista, usaFgts: false, bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial',
      })
      expect(r.elegivel).toBe(true)
      expect(r.primeiraParcela).toBeCloseTo(c.oficial1a, 0)
      expect(r.ultimaParcela).toBeCloseTo(c.oficialUlt, 0)
    })
  }
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

// Caso-âncora real que corrigiu a faixa de MIP ≤40 anos (jul/2026): simulador oficial da
// Caixa, imóvel R$1.600.000 novo, sem renda informada, "financiando valor máximo",
// nascimento 19/09/1987 (idade 38). Antes da correção, a faixa ≤40 usava 0.000264
// (nunca confirmada por caso real) — a 1ª parcela do PRICE divergia R$191,53 (SAC:
// R$218,90), grande o bastante pra aparecer com um imóvel caro. Reconstruindo o seguro
// implícito via 1ªParcela−últimaParcela (que já batia exato): MIP real = 0.000093,
// idêntico à faixa ≤25 — não os 0.000264 antigos.
describe('Fase 4 — Caixa: caso-âncora real (calibração MIP faixa ≤40 anos, jul/2026)', () => {
  it('PRICE e SAC batem com o simulador oficial dentro de R$1 (imóvel de alto valor, idade 38)', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 1_600_000, valorEntrada: 320_000, dataNascimento: '1987-09-19',
      rendaMensal: 0, rendaInformada: false, tipoAmortizacao: 'PRICE', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial', usaFgts: false,
      financiandoValorMaximo: true,
    })
    const price = resultados.find((r) => r.resultadoId === 'caixa-sbpe-price')
    const sac = resultados.find((r) => r.resultadoId === 'caixa-sbpe-sac')

    expect(price?.elegivel).toBe(true)
    expect(price?.valorFinanciado).toBeCloseTo(1_120_000, 6) // 70% de 1,6M
    expect(price?.primeiraParcela).toBeCloseTo(10838.12, 0) // diff real: R$0,01
    expect(price?.ultimaParcela).toBeCloseTo(10628.36, 0)

    expect(sac?.elegivel).toBe(true)
    expect(sac?.valorFinanciado).toBeCloseTo(1_280_000, 6) // 80% de 1,6M
    expect(sac?.primeiraParcela).toBeCloseTo(14951.54, 0) // diff real: R$0,02
    expect(sac?.ultimaParcela).toBeCloseTo(3100.36, 0)
  })
})

// Caso-âncora real que corrigiu a faixa de MIP ≤35 anos (jul/2026): simulador oficial da
// Caixa, SBPE Balcão, imóvel R$550.000 novo, entrada fixa R$226.657,89, nascimento
// 15/10/1993 (32 anos). Antes da correção a faixa ≤35 usava 0.000204 (nunca confirmada
// por caso real, e maior que as duas faixas vizinhas — inconsistência já registrada).
// Reconstruindo o seguro implícito via PRICE (1ªParcela−últimaParcela, que já batia
// exato): R$3.159,98 − R$3.086,17 = R$73,81; DFI (0.000066 × 550.000) = R$36,30; MIP
// implícito = R$37,51 / R$323.342,11 financiado = 0.000116 — resolve a inconsistência de
// monotonicidade (fica entre ≤30=0.000096 e ≤40=0.000093).
describe('Fase 4 — Caixa: caso-âncora real (calibração MIP faixa ≤35 anos, jul/2026)', () => {
  it('SAC e PRICE batem com o simulador oficial dentro de R$1 (imóvel R$550k novo, idade 32)', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 550_000, valorEntrada: 226_657.89, dataNascimento: '1993-10-15',
      rendaMensal: 100_000, tipoAmortizacao: 'PRICE', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial',
    })
    const sac = resultados.find((r) => r.resultadoId === 'caixa-sbpe-sac')
    const price = resultados.find((r) => r.resultadoId === 'caixa-sbpe-price')

    expect(sac?.elegivel).toBe(true)
    expect(sac?.parcelas).toBe(420)
    expect(sac?.primeiraParcela).toBeCloseTo(3812.67, 0) // diff real: R$0,01
    expect(sac?.ultimaParcela).toBeCloseTo(801.87, 0)

    expect(price?.elegivel).toBe(true)
    expect(price?.parcelas).toBe(360)
    expect(price?.primeiraParcela).toBeCloseTo(3159.98, 0)
    expect(price?.ultimaParcela).toBeCloseTo(3086.17, 0)
  })
})

// Caso-âncora real que corrigiu as faixas de MIP ≤55/≤60/≤65/999 (jul/2026): 5 simulações
// no simulador oficial (SBPE Balcão, imóvel R$550k novo), uma por faixa, idades 48/53/58/
// 63/70 — todas com aniversário já passado em 2026, prazo reduzido automaticamente pelo
// teto de idade da Caixa (confirma que a idade certa caiu em cada faixa). Ver
// `constantes.ts` (CAIXA_MIP_RATES) para o cálculo do MIP implícito de cada caso.
describe('Fase 4 — Caixa: caso-âncora real (calibração MIP faixas ≤50-999 anos, jul/2026)', () => {
  const casos: Array<{
    idade: number; dataNascimento: string
    entradaSac: number; entradaPrice: number
    prazoSac: number; prazoPrice: number
    sac: { primeira: number; ultima: number }
    price: { primeira: number; ultima: number }
  }> = [
    { idade: 48, dataNascimento: '1978-03-15', entradaSac: 239_497.00, entradaPrice: 235_244.92,
      prazoSac: 386, prazoPrice: 360,
      sac: { primeira: 3812.66, ultima: 836.73 }, price: { primeira: 3162.68, ultima: 3004.88 } },
    { idade: 53, dataNascimento: '1973-03-15', entradaSac: 258_028.24, entradaPrice: 248_347.00,
      prazoSac: 326, prazoPrice: 326,
      sac: { primeira: 3812.66, ultima: 928.77 }, price: { primeira: 3162.68, ultima: 2922.46 } },
    { idade: 58, dataNascimento: '1968-03-15', entradaSac: 289_439.53, entradaPrice: 281_143.97,
      prazoSac: 266, prazoPrice: 266,
      sac: { primeira: 3812.67, ultima: 1013.47 }, price: { primeira: 3162.68, ultima: 2714.22 } },
    { idade: 63, dataNascimento: '1963-03-15', entradaSac: 325_236.25, entradaPrice: 320_277.91,
      prazoSac: 206, prazoPrice: 206,
      sac: { primeira: 3812.66, ultima: 1126.01 }, price: { primeira: 3162.67, ultima: 2499.00 } },
    { idade: 70, dataNascimento: '1956-03-15', entradaSac: 367_545.97, entradaPrice: 366_136.89,
      prazoSac: 122, prazoPrice: 122,
      sac: { primeira: 3812.67, ultima: 1534.15 }, price: { primeira: 3162.67, ultima: 2527.16 } },
  ]

  it.each(casos)('idade $idade: SAC e PRICE batem com o simulador oficial dentro de R$1', (caso) => {
    const sac = simularBancoNovo('caixa', {
      valorImovel: 550_000, valorEntrada: caso.entradaSac, dataNascimento: caso.dataNascimento,
      rendaMensal: 100_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial',
    })
    expect(sac.elegivel).toBe(true)
    expect(sac.parcelas).toBe(caso.prazoSac)
    expect(sac.primeiraParcela).toBeCloseTo(caso.sac.primeira, 0)
    expect(sac.ultimaParcela).toBeCloseTo(caso.sac.ultima, 0)

    const price = simularBancoNovo('caixa', {
      valorImovel: 550_000, valorEntrada: caso.entradaPrice, dataNascimento: caso.dataNascimento,
      rendaMensal: 100_000, tipoAmortizacao: 'PRICE', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial',
    })
    expect(price.elegivel).toBe(true)
    expect(price.parcelas).toBe(caso.prazoPrice)
    expect(price.primeiraParcela).toBeCloseTo(caso.price.primeira, 0)
    expect(price.ultimaParcela).toBeCloseTo(caso.price.ultima, 0)
  })
})

// Corte de idade próprio do SAC no MCMV Classe Média (jul/2026): 9 simulações no
// simulador oficial, mesmo imóvel (R$550k novo), mesma renda (R$13.000), variando só a
// idade — 61, 62, 63, 64, 65, 68 e 69 anos deram "ATENÇÃO! IDADE PROPONENTE SUPERA LIMITE
// DO PROGRAMA" (bloqueado por completo) no SAC, enquanto 60 anos passou normalmente
// (prazo 242, dentro da regra geral de idade+prazo). O PRICE, no mesmo nascimento de 70
// anos, nunca bateu nesse bloqueio — é uma regra própria do programa+sistema, não a regra
// geral de idade+prazo de 80 anos e 6 meses que já tínhamos.
describe('Fase 4 — Caixa: MCMV Classe Média SAC tem corte de idade próprio (60 anos)', () => {
  it('idade 61+ é inelegível no SAC mas o PRICE continua elegível', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 550_000, valorEntrada: 0, dataNascimento: '1956-03-15', // 70 anos
      rendaMensal: 13_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial', usaFgts: false,
      financiandoValorMaximo: true,
    })
    expect(resultados.find((r) => r.resultadoId === 'caixa-mcmv-sac')).toBeUndefined()
    expect(resultados.find((r) => r.resultadoId === 'caixa-mcmv-price')?.elegivel).toBe(true)
  })

  it('idade 60 (limite) segue elegível no SAC', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 550_000, valorEntrada: 0, dataNascimento: '1966-03-15', // 60 anos
      rendaMensal: 13_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial', usaFgts: false,
      financiandoValorMaximo: true,
    })
    const sac = resultados.find((r) => r.resultadoId === 'caixa-mcmv-sac')
    expect(sac?.elegivel).toBe(true)
    expect(sac?.parcelas).toBe(242) // bate com o oficial (regra geral de idade+prazo)
  })
})

// Caso-âncora real que CONFIRMA (não corrige) o "financiando valor máximo" com prazo
// longo (jul/2026): simulador oficial da Caixa, imóvel R$550k novo, renda R$13.000,
// nascimento 15/03/2008 (18 anos, prazo cheio de 420 meses — sem redução por idade).
// Diferente do caso-âncora de 70 anos (prazo 122, onde o PRICE divergia ~24% do oficial),
// aqui SAC e PRICE maximizam sua própria entrada de forma independente e batem bem com o
// oficial: MCMV PRICE R$440.000 (oficial R$437.941,30, +0,47%), MCMV SAC R$355.228
// (oficial R$352.044,40, +0,9%), SBPE SAC R$331.526 (oficial R$323.984,39, +2,3% — mesmo
// resíduo pequeno já conhecido do modelo de renda). Isola o problema: o gap grande do
// PRICE é específico de prazo CURTO por idade avançada, não um bug geral na lógica
// SAC×PRICE — ver pendência registrada no commit da fase 4 (prazo curto).
describe('Fase 4 — Caixa: caso-âncora real (financiando valor máximo com prazo longo, jul/2026)', () => {
  it('MCMV PRICE/SAC e SBPE SAC batem com o oficial dentro de ~2,5% (idade 18, prazo 420)', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 550_000, valorEntrada: 0, dataNascimento: '2008-03-15', // 18 anos
      rendaMensal: 13_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial', usaFgts: false,
      financiandoValorMaximo: true,
    })
    const porId = new Map(resultados.map((r) => [r.resultadoId, r]))

    // Tolerâncias absolutas (não toBeCloseTo — a diferença real é de milhares de reais,
    // pequena em termos percentuais, mas grande demais para as casas decimais de toBeCloseTo).
    expect(Math.abs(porId.get('caixa-mcmv-price')!.valorFinanciado - 437_941.30)).toBeLessThan(3_000)
    expect(Math.abs(porId.get('caixa-mcmv-sac')!.valorFinanciado - 352_044.40)).toBeLessThan(4_000)
    expect(Math.abs(porId.get('caixa-sbpe-sac')!.valorFinanciado - 323_984.39)).toBeLessThan(8_000) // resíduo conhecido
  })
})

// Caso-âncora real que CONFIRMA a penalidade de imóvel usado no MCMV Classe Média
// (jul/2026): simulador oficial, imóvel R$550k usado, renda R$13.000, nascimento
// 15/03/1996 (30 anos, prazo cheio 420 meses — renda não é o fator restritivo aqui).
// SAC e PRICE batem exatamente no teto de LTV de 60% (80% - 20pp de penalidade usado),
// financiado R$330.000 idêntico pros dois sistemas (esperado — quando o LTV é o fator
// restritivo, não a renda, SAC e PRICE convergem trivialmente). Parcelas batem a poucos
// centavos com o oficial.
describe('Fase 4 — Caixa: caso-âncora real (MCMV Classe Média usado, LTV 60%, jul/2026)', () => {
  it('SAC e PRICE batem no teto de 60% e as parcelas batem com o oficial', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 550_000, valorEntrada: 0, dataNascimento: '1996-03-15', // 30 anos
      rendaMensal: 13_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'usado', finalidade: 'residencial', usaFgts: false,
      financiandoValorMaximo: true,
    })
    const sac = resultados.find((r) => r.resultadoId === 'caixa-mcmv-sac')
    const price = resultados.find((r) => r.resultadoId === 'caixa-mcmv-price')

    expect(sac?.valorFinanciado).toBeCloseTo(330_000, 6) // 60% de 550k
    expect(Math.abs(sac!.primeiraParcela - 3627.81)).toBeLessThan(1) // tolerância R$1
    expect(Math.abs(sac!.ultimaParcela - 817.26)).toBeLessThan(1)

    expect(price?.valorFinanciado).toBeCloseTo(330_000, 6)
    expect(Math.abs(price!.primeiraParcela - 2929.02)).toBeLessThan(1)
    expect(Math.abs(price!.ultimaParcela - 2861.92)).toBeLessThan(1)
  })
})

// Trava de segurança temporária pro gap do PRICE em prazo curto (jul/2026): NÃO é a
// fórmula real da Caixa (ainda não descoberta) — é uma salvaguarda pra não superestimar
// tanto o financiado enquanto a fórmula certa não é encontrada. Sem a trava, o caso-âncora
// de 70 anos/prazo 122 dava SBPE PRICE R$227.575 (oficial R$183.863 — 24% acima). Com a
// trava (teto de 10% acima do financiado do SAC, só quando prazo ≤ 200 meses), cai pra
// R$205.371 (~11,7% acima — ainda impreciso, mas bem mais conservador). O caso de prazo
// longo (idade 18, MCMV, confirmado em outro teste) não é afetado pela trava.
describe('Fase 4 — Caixa: trava de segurança do PRICE em prazo curto (jul/2026)', () => {
  it('SBPE PRICE fica mais conservador quando o prazo é curto (idade 70)', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 550_000, valorEntrada: 0, dataNascimento: '1956-03-15', // 70 anos
      rendaMensal: 13_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial', usaFgts: false,
      financiandoValorMaximo: true,
    })
    const price = resultados.find((r) => r.resultadoId === 'caixa-sbpe-price')
    // Antes da trava: R$227.575. Depois: ~R$205.371 (teto = SAC × 1.10).
    expect(price?.valorFinanciado).toBeLessThan(210_000)
    expect(price?.valorFinanciado).toBeGreaterThan(200_000)
  })

  it('não afeta o caso de prazo longo já confirmado (idade 18, MCMV)', () => {
    const resultados = simularTodosBancosNovo({
      valorImovel: 550_000, valorEntrada: 0, dataNascimento: '2008-03-15', // 18 anos
      rendaMensal: 13_000, tipoAmortizacao: 'SAC', correntista: false,
      bancosIds: ['caixa'], tipoImovel: 'novo', finalidade: 'residencial', usaFgts: false,
      financiandoValorMaximo: true,
    })
    expect(resultados.find((r) => r.resultadoId === 'caixa-mcmv-price')?.valorFinanciado).toBeCloseTo(440_000, 6)
    expect(resultados.find((r) => r.resultadoId === 'caixa-sbpe-price')?.valorFinanciado).toBeCloseTo(385_000, 6)
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
    // Itaú é excluído da comparação campo a campo (mas ainda entra na contagem de
    // resultados): em 2026-07-13, na mesma sessão desta migração da Caixa, dois bugs reais
    // do Itaú foram corrigidos (double-count de MIP/DFI na "1ª parcela" + TAC nunca
    // aplicada) — divergência intencional do `_baseline-fase4-caixa/engine.ts` congelado,
    // sem relação com a migração da Caixa que este teste verifica. Ver
    // criteria-migracao-fase3-itau.test.ts para a cobertura de regressão do Itaú.
    const bancosIds: InputFinanciamento['bancosIds'] = ['caixa', 'itau', 'bradesco', 'santander', 'bb', 'inter', 'daycoval']
    const input = { ...BASE_INPUT, bancosIds }
    const novos = simularTodosBancosNovo(input)
    const antigos = simularTodosBancosAntigo(input)
    const novosNaoCaixa = novos.filter((r) => r.bancoId !== 'caixa')
    const antigosNaoCaixa = antigos.filter((r) => r.bancoId !== 'caixa')
    expect(novosNaoCaixa.length).toBe(antigosNaoCaixa.length)
    const antigosPorId = new Map(antigosNaoCaixa.map((r) => [r.resultadoId, r]))
    novosNaoCaixa.forEach((novo) => {
      if (novo.bancoId === 'itau') return
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
      const input: InputFinanciamento = { ...BASE_INPUT_EQUIV, dataNascimento }
      const novo = simularBancoNovo('caixa', input)
      const antigo = simularBancoAntigo('caixa', input)
      expectResultadoEquivalente(novo, antigo)
    })
  }
})
