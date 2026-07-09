import type { BancoId, TipoOperacao, InputFinanciamento, ResultadoBanco, AnalisePredicativa } from './tipos'
import { BANCOS_CONFIG, MIP_RATES, MIP_RATE_MCMV, DFI_RATE_MENSAL, MCMV_FAIXAS, CAIXA_PRO_COTISTA, OBSERVACOES_MODALIDADE, LIMITE_IDADE_PRAZO_MESES } from './constantes'
import type { BancoConfig } from './constantes'
import { resolverCriterios } from './criteria-resolver'
import type { SimulationCriteria, EstrategiaSeguroMip, MetodoConversaoTaxa, BancoSimOverrides, PeriodoMip, CenarioComparativo } from './criteria'

// Reexportado para preservar o import externo existente
// (src/lib/workflows/motor-simulacao.ts e outros importam LIMITE_IDADE_PRAZO_MESES daqui).
export { LIMITE_IDADE_PRAZO_MESES }

// Reexportado para preservar o import externo existente — a definição agora vive em
// criteria.ts (ver docs/calibracao-simuladores/arquitetura-motor-agnostico.md, seção 9).
export type { BancoSimOverrides }

export function taxaAnualParaMensal(taxaAnual: number): number {
  return Math.pow(1 + taxaAnual, 1 / 12) - 1
}

// Conversão de taxa anual → mensal com truncamento em 15 casas decimais — comportamento
// do simulador oficial do Itaú, generalizado (Fase 3) para não depender do nome do banco:
// qualquer critério com `metodoConversaoTaxa: 'composta-truncada-15-casas'` usa esta função.
function taxaAnualParaMensalTruncada15Casas(taxaAnual: number): number {
  const raw = Math.pow(1 + taxaAnual, 1 / 12) - 1
  return Math.trunc(raw * 1e15) / 1e15
}

// Resolve a alíquota mensal de MIP a partir de uma lista de períodos do contrato (cada um
// com sua própria tabela por idade inteira) — generalização (Fase 3) de `getItauMipRate`,
// que importava ITAU_MIP_P1/ITAU_MIP_P2 diretamente. Agora as tabelas vêm do critério.
// ageFloor = idade inteira (anos completados) no mês em questão
// month = número do mês de pagamento (0 = pré-pagamento de assinatura)
function resolverTaxaMipPorPeriodo(periodos: PeriodoMip[], ageFloor: number, month: number): number {
  const periodo = periodos.find((p) => month >= p.mesInicio && (p.mesFimExclusive == null || month < p.mesFimExclusive))
    ?? periodos[0]
  for (let age = ageFloor; age >= 18; age--) {
    if (periodo.tabelaPorIdade[age] !== undefined) return periodo.tabelaPorIdade[age]
  }
  // Fallback fiel ao comportamento original (`getItauMipRate`): se nenhuma idade do
  // período atual bater (ex.: cliente jovem cujo mês já caiu no período 2, que só tem
  // faixas de idade mais altas), cai sempre para a idade mínima do PRIMEIRO período —
  // não do período atual — replicando literalmente `ITAU_MIP_P1[18] ?? 0.000090`.
  const tabelaBase = periodos[0].tabelaPorIdade
  const idadeMinimaBase = Math.min(...Object.keys(tabelaBase).map(Number))
  return tabelaBase[idadeMinimaBase] ?? 0.000090
}

// Calcula a idade decimal (anos) a partir de dataBase + mesesAdicionais
function idadeDecimalEmMeses(dataNasc: string, mesesAdicionais: number, dataBase?: Date): number {
  const nasc = new Date(dataNasc)
  const ref = dataBase ? new Date(dataBase) : new Date()
  ref.setMonth(ref.getMonth() + mesesAdicionais)
  const diff = ref.getTime() - nasc.getTime()
  return diff / (365.24222222 * 24 * 3600 * 1000)
}

interface ResultadoCalculo {
  primeiraParcela: number
  ultimaParcela: number
  totalJuros: number
  totalSeguros: number
}

// SAC com MIP variável por período+idade e pré-pagamento no mês 0 — generalização (Fase 3)
// de `calcularSACItau`. O comportamento é idêntico ao de sempre (só o Itaú usa esta função
// hoje, via `criteria.seguro.mip.tipo === 'periodo-e-idade'`), mas as tabelas de MIP e a
// alíquota de DFI agora chegam como parâmetro (do critério), em vez de vir de constantes
// importadas — nenhum `cfg.id === 'itau'` sobrevive dentro da função.
// A "1ª parcela" inclui pré-pagamento de seguros no mês 0 (comportamento do simulador oficial).
function calcularSACPeriodoIdade(
  valorFinanciadoTotal: number,
  valorAvaliacao: number,
  taxaMensal: number,
  prazo: number,
  dataNasc: string,
  periodosMip: PeriodoMip[],
  dfiTaxaMensal: number,
  dataBase?: Date,
): ResultadoCalculo {
  const amortizacao = valorFinanciadoTotal / prazo
  const dfiMensal = valorAvaliacao * dfiTaxaMensal

  // Mês 0: pré-pagamento de seguros (sem amortização nem juros)
  // Nota: MIP não usa TRUNC (valor raw); DFI usa TRUNC(val, 2) conforme simulador Itaú
  const dfiTrunc = Math.trunc(dfiMensal * 100) / 100
  const idadeM0 = idadeDecimalEmMeses(dataNasc, 0, dataBase)
  const mipRateM0 = resolverTaxaMipPorPeriodo(periodosMip, Math.floor(idadeM0), 0)
  const mipM0 = valorFinanciadoTotal * mipRateM0 // raw, sem TRUNC
  const prePayment = mipM0 + dfiTrunc

  let saldoDevedor = valorFinanciadoTotal
  let totalJuros = 0
  let totalSeguros = prePayment
  let primeiraParcela = 0
  let ultimaParcela = 0

  for (let i = 1; i <= prazo; i++) {
    const isLast = i === prazo
    const idadeI = idadeDecimalEmMeses(dataNasc, i, dataBase)
    const mipRate = resolverTaxaMipPorPeriodo(periodosMip, Math.floor(idadeI), i)
    const juros = saldoDevedor * taxaMensal
    // No simulador Itaú, última parcela não inclui MIP nem DFI
    const mip = isLast ? 0 : saldoDevedor * mipRate
    const dfi = isLast ? 0 : dfiTrunc
    const parcela = amortizacao + juros + mip + dfi

    if (i === 1) primeiraParcela = parcela + prePayment
    if (isLast) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += mip + dfi
    saldoDevedor -= amortizacao
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

// PRICE com MIP variável por período+idade — generalização (Fase 3) de `calcularPRICEItau`,
// mesma lógica de `calcularSACPeriodoIdade` acima.
function calcularPRICEPeriodoIdade(
  valorFinanciadoTotal: number,
  valorAvaliacao: number,
  taxaMensal: number,
  prazo: number,
  dataNasc: string,
  periodosMip: PeriodoMip[],
  dfiTaxaMensal: number,
  dataBase?: Date,
): ResultadoCalculo {
  const fator = Math.pow(1 + taxaMensal, prazo)
  const parcelaCJ = valorFinanciadoTotal * (taxaMensal * fator) / (fator - 1)
  const dfiTrunc = Math.trunc(valorAvaliacao * dfiTaxaMensal * 100) / 100

  const idadeM0 = idadeDecimalEmMeses(dataNasc, 0, dataBase)
  const mipRateM0 = resolverTaxaMipPorPeriodo(periodosMip, Math.floor(idadeM0), 0)
  const prePayment = valorFinanciadoTotal * mipRateM0 + dfiTrunc

  let saldoDevedor = valorFinanciadoTotal
  let totalJuros = 0
  let totalSeguros = prePayment
  let primeiraParcela = 0
  let ultimaParcela = 0

  for (let i = 1; i <= prazo; i++) {
    const isLast = i === prazo
    const idadeI = idadeDecimalEmMeses(dataNasc, i, dataBase)
    const mipRate = resolverTaxaMipPorPeriodo(periodosMip, Math.floor(idadeI), i)
    const juros = saldoDevedor * taxaMensal
    const amort = parcelaCJ - juros
    const mip = isLast ? 0 : saldoDevedor * mipRate
    const dfi = isLast ? 0 : dfiTrunc
    const parcela = parcelaCJ + mip + dfi

    if (i === 1) primeiraParcela = parcela + prePayment
    if (isLast) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += mip + dfi
    saldoDevedor = Math.max(0, saldoDevedor - amort)
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

export function calcularIdadeEmAnos(dataNasc: string): number {
  const nasc = new Date(dataNasc)
  const hoje = new Date()
  let anos = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--
  return anos
}

export function calcularIdadeEmMeses(dataNasc: string): number {
  const nasc = new Date(dataNasc)
  const hoje = new Date()
  return (
    (hoje.getFullYear() - nasc.getFullYear()) * 12 +
    (hoje.getMonth() - nasc.getMonth())
  )
}

// Prazo máximo: min(prazo do banco, limite de idade = limiteIdadePrazoMeses - idade atual em meses)
// `limiteIdadePrazoMeses` é opcional e mantém o default global de hoje (LIMITE_IDADE_PRAZO_MESES,
// importado de constantes.ts) para não alterar nenhum chamador existente — o caminho de critérios
// (ver criteria-resolver.ts) passa esse valor explicitamente por banco a partir da Fase 1.
export function calcularPrazoMaximo(
  dataNasc: string,
  prazoMaxBanco: number,
  limiteIdadePrazoMeses: number = LIMITE_IDADE_PRAZO_MESES,
): number {
  const idadeMeses = calcularIdadeEmMeses(dataNasc)
  const limiteIdade = limiteIdadePrazoMeses - idadeMeses
  return Math.max(12, Math.min(limiteIdade, prazoMaxBanco))
}

export function getMipRate(idadeAnos: number): number {
  const faixa = MIP_RATES.find((f) => idadeAnos >= f.idadeMin && idadeAnos <= f.idadeMax)
  return faixa ? faixa.taxa : MIP_RATES[MIP_RATES.length - 1].taxa
}

// DFI: fixo sobre valor do imóvel (não sobre saldo devedor)
// MIP: variável sobre saldo devedor
export function calcularSAC(
  principal: number,
  valorImovel: number,
  taxaMensal: number,
  prazo: number,
  mip: number,
  dfiRateOverride?: number,
): ResultadoCalculo {
  const amortizacao = principal / prazo
  let saldoDevedor = principal
  let totalJuros = 0
  let totalSeguros = 0
  let primeiraParcela = 0
  let ultimaParcela = 0
  const dfiMensal = valorImovel * (dfiRateOverride ?? DFI_RATE_MENSAL)

  for (let i = 1; i <= prazo; i++) {
    const juros = saldoDevedor * taxaMensal
    const seguroMip = saldoDevedor * mip
    const seguroDfi = dfiMensal
    const parcela = amortizacao + juros + seguroMip + seguroDfi

    if (i === 1) primeiraParcela = parcela
    if (i === prazo) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += seguroMip + seguroDfi
    saldoDevedor -= amortizacao
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

export function calcularPRICE(
  principal: number,
  valorImovel: number,
  taxaMensal: number,
  prazo: number,
  mip: number,
  dfiRateOverride?: number,
): ResultadoCalculo {
  const fator = Math.pow(1 + taxaMensal, prazo)
  const parcelaCJ = principal * (taxaMensal * fator) / (fator - 1)
  const dfiMensal = valorImovel * (dfiRateOverride ?? DFI_RATE_MENSAL)

  let saldoDevedor = principal
  let totalJuros = 0
  let totalSeguros = 0
  let primeiraParcela = 0
  let ultimaParcela = 0

  for (let i = 1; i <= prazo; i++) {
    const juros = saldoDevedor * taxaMensal
    const amort = parcelaCJ - juros
    const seguroMip = saldoDevedor * mip
    const seguroDfi = dfiMensal
    const parcela = parcelaCJ + seguroMip + seguroDfi

    if (i === 1) primeiraParcela = parcela
    if (i === prazo) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += seguroMip + seguroDfi
    saldoDevedor = Math.max(0, saldoDevedor - amort)
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

// SAC com MIP/DFI zerados na última parcela e tarifa de administração mensal fixa somada
// em toda parcela — generalização (Fase 4) de `calcularSACCaixa`. Usada por qualquer
// critério com `seguro.incluirNaUltimaParcela === false` que não seja 'periodo-e-idade'
// (esse caso já tem sua própria função, `calcularSACPeriodoIdade`, acima). Comportamento
// idêntico ao de sempre (só a Caixa usa esta função hoje, via
// `!criteria.seguro.incluirNaUltimaParcela` em `simularComCriterios`), mas a alíquota de
// DFI e a tarifa mensal agora chegam como parâmetro (do critério), em vez de vir de
// constantes importadas — nenhum `cfg.id === 'caixa'` sobrevive dentro da função.
function calcularSACComTarifaMensalFixa(
  principal: number,
  valorImovel: number,
  taxaMensal: number,
  prazo: number,
  mipRate: number,
  dfiTaxaMensal: number,
  tarifaMensal: number,
): ResultadoCalculo {
  const amortizacao = principal / prazo
  const dfiMensal = valorImovel * dfiTaxaMensal
  let saldoDevedor = principal
  let totalJuros = 0
  let totalSeguros = 0
  let primeiraParcela = 0
  let ultimaParcela = 0

  for (let i = 1; i <= prazo; i++) {
    const isLast = i === prazo
    const juros = saldoDevedor * taxaMensal
    const mip = isLast ? 0 : saldoDevedor * mipRate
    const dfi = isLast ? 0 : dfiMensal
    const parcela = amortizacao + juros + mip + dfi + tarifaMensal

    if (i === 1) primeiraParcela = parcela
    if (isLast) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += mip + dfi + tarifaMensal
    saldoDevedor -= amortizacao
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

// PRICE com MIP/DFI zerados na última parcela e tarifa de administração mensal fixa —
// generalização (Fase 4) de `calcularPRICECaixa`, mesma lógica de
// `calcularSACComTarifaMensalFixa` acima.
function calcularPRICEComTarifaMensalFixa(
  principal: number,
  valorImovel: number,
  taxaMensal: number,
  prazo: number,
  mipRate: number,
  dfiTaxaMensal: number,
  tarifaMensal: number,
): ResultadoCalculo {
  const fator = Math.pow(1 + taxaMensal, prazo)
  const parcelaCJ = principal * (taxaMensal * fator) / (fator - 1)
  const dfiMensal = valorImovel * dfiTaxaMensal

  let saldoDevedor = principal
  let totalJuros = 0
  let totalSeguros = 0
  let primeiraParcela = 0
  let ultimaParcela = 0

  for (let i = 1; i <= prazo; i++) {
    const isLast = i === prazo
    const juros = saldoDevedor * taxaMensal
    const amort = parcelaCJ - juros
    const mip = isLast ? 0 : saldoDevedor * mipRate
    const dfi = isLast ? 0 : dfiMensal
    const parcela = parcelaCJ + mip + dfi + tarifaMensal

    if (i === 1) primeiraParcela = parcela
    if (isLast) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += mip + dfi + tarifaMensal
    saldoDevedor = Math.max(0, saldoDevedor - amort)
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

// Busca binária: maior principal cuja 1ª parcela SAC ≤ 30% da renda
export function calcularMaxFinanciavel(
  renda: number,
  valorImovelEstimado: number,
  taxaMensal: number,
  prazo: number,
  mip: number
): number {
  const parcelaMax = renda * 0.30
  let lo = 0
  let hi = renda * 200
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    const { primeiraParcela } = calcularSAC(mid, valorImovelEstimado, taxaMensal, prazo, mip)
    if (primeiraParcela < parcelaMax) lo = mid
    else hi = mid
  }
  return Math.floor((lo + hi) / 2)
}

// ── Fases 1–3 da migração para o motor agnóstico ─────────────────────────────
// Ver docs/calibracao-simuladores/arquitetura-motor-agnostico.md,
// docs/calibracao-simuladores/migracao-motor-agnostico-fase-1.md,
// docs/calibracao-simuladores/migracao-motor-agnostico-fase-2.md e
// docs/calibracao-simuladores/migracao-motor-agnostico-fase-3-itau.md.
//
// Para os bancos já migrados (Fase 1: Bradesco, Santander, Banco do Brasil;
// Fase 2: Inter, Daycoval; Fase 3: Itaú), o cálculo não lê mais `cfg.id` em
// nenhum ponto — consome apenas `SimulationCriteria`, montado por
// `criteria-resolver.ts`. Só a Caixa continua no caminho hardcoded abaixo,
// intocada, até a Fase 4 (múltiplos programas por banco, não só função de
// cálculo/estratégia de seguro diferente).

// Resolve a alíquota mensal de MIP a partir de uma estratégia de critério, para as
// estratégias resolvíveis com um único valor por simulação (não variam mês a mês):
// 'faixa-etaria' (Bradesco/Santander/BB), 'flat' (Daycoval e qualquer banco com
// override de mipRate no banco de dados) e 'teto-idade' (Inter). 'periodo-e-idade'
// (Itaú) NÃO é resolvida aqui — varia a cada mês do contrato (idade avança, e o
// período 0–120/121+ muda a tabela) — ver `resolverTaxaMipPorPeriodo` e o dispatch
// dentro de `simularComCriterios` que chama a função de cálculo especializada.
function resolverTaxaMip(estrategia: EstrategiaSeguroMip, idadeAnos: number): number {
  switch (estrategia.tipo) {
    case 'faixa-etaria': {
      const faixa = estrategia.faixas.find((f) => idadeAnos >= f.idadeMin && idadeAnos <= f.idadeMax)
      return faixa ? faixa.taxa : estrategia.faixas[estrategia.faixas.length - 1].taxa
    }
    case 'teto-idade': {
      // Mesma lógica de getCaixaMipRate/getInterMipRate: primeira faixa cujo teto
      // de idade comporta o cliente; se nenhuma comportar, usa a última (mais alta).
      for (const faixa of estrategia.faixas) {
        if (idadeAnos <= faixa.tetoIdade) return faixa.taxa
      }
      return estrategia.faixas[estrategia.faixas.length - 1].taxa
    }
    case 'flat':
      return estrategia.taxa
    case 'periodo-e-idade':
      throw new Error(
        `Estratégia de seguro 'periodo-e-idade' não é resolvível com um único valor — ` +
        `use resolverTaxaMipPorPeriodo dentro do cálculo mês a mês, ou informe ` +
        `'mipParaCapacidadeMaxima' no critério para obter uma estimativa flat (caso do Itaú).`
      )
  }
}

function taxaAnualParaMensalPorMetodo(taxaAnual: number, metodo: MetodoConversaoTaxa): number {
  return metodo === 'composta-truncada-15-casas'
    ? taxaAnualParaMensalTruncada15Casas(taxaAnual)
    : taxaAnualParaMensal(taxaAnual)
}

// Núcleo de cálculo agnóstico a banco — só consome SimulationCriteria, nunca `cfg.id`.
// Espelha exatamente a lógica de `simularBancoComTaxa` abaixo para os bancos genéricos,
// apenas lendo os valores de `criteria` em vez de `cfg`/constantes globais diretamente.
export function simularComCriterios(
  cfg: BancoConfig,
  criteria: SimulationCriteria,
  input: InputFinanciamento,
  resultadoId: string,
): ResultadoBanco {
  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const prazoMaxBanco = (input.tipoAmortizacao === 'PRICE' && criteria.prazoMaximoMesesPrice != null)
    ? criteria.prazoMaximoMesesPrice
    : criteria.prazoMaximoMeses
  const prazo = calcularPrazoMaximo(input.dataNascimento, prazoMaxBanco, criteria.limiteIdadePrazoMeses)

  // Estratégia usada só para elegibilidade/estimativa de capacidade máxima — para o Itaú
  // é deliberadamente diferente da estratégia real usada na parcela (ver comentário do
  // campo em criteria.ts). Para todos os outros bancos, é a mesma (`seguro.mip`).
  const mipCapacidade = resolverTaxaMip(criteria.mipParaCapacidadeMaxima ?? criteria.seguro.mip, idadeAnos)
  const dfiRate = criteria.seguro.dfi.taxaMensal

  const valorFinanciado = input.valorImovel - input.valorEntrada
  const suportaPrice = criteria.amortizacoesSuportadas.includes('PRICE')

  const baseLtv = input.tipoAmortizacao === 'PRICE'
    ? (criteria.ltv.price ?? criteria.ltv.sac)
    : (input.correntista ? (criteria.ltv.correntista ?? criteria.ltv.sac) : criteria.ltv.sac)
  const penalidade = (criteria.ltv.penalidadeImovelUsado && input.tipoImovel === 'usado')
    ? criteria.ltv.penalidadeImovelUsado
    : 0
  const maxLtv = baseLtv - penalidade
  const maxLtvValue = input.valorImovel * maxLtv

  const taxaAnual = input.correntista ? criteria.taxaAnualCorrentista : criteria.taxaAnualBase

  // ── Verificações de elegibilidade — mesma ordem e mensagens de simularBancoComTaxa ──
  if (input.tipoAmortizacao === 'PRICE' && !suportaPrice) {
    return inelegivel(cfg, valorFinanciado, input, taxaAnual, criteria.programa, prazo, resultadoId,
      'Não oferece financiamento na modalidade PRICE')
  }
  if (criteria.idadeMaximaAbsoluta != null && idadeAnos >= criteria.idadeMaximaAbsoluta) {
    return inelegivel(cfg, valorFinanciado, input, taxaAnual, criteria.programa, prazo, resultadoId,
      `Idade máxima de ${criteria.idadeMaximaAbsoluta} anos atingida`)
  }
  if (prazo < 12) {
    return inelegivel(cfg, valorFinanciado, input, taxaAnual, criteria.programa, prazo, resultadoId,
      'Prazo insuficiente — mutuário muito próximo dos 80 anos')
  }
  if (valorFinanciado <= 0) {
    return inelegivel(cfg, valorFinanciado, input, taxaAnual, criteria.programa, prazo, resultadoId,
      'Valor de entrada maior ou igual ao valor do imóvel')
  }
  if (valorFinanciado > maxLtvValue) {
    return inelegivel(
      cfg, valorFinanciado, input, taxaAnual, criteria.programa, prazo, resultadoId,
      `Financiamento (${fmtMoeda(valorFinanciado)}) excede ${Math.round(maxLtv * 100)}% do imóvel`
    )
  }
  if (criteria.maxValorImovel > 0 && input.valorImovel > criteria.maxValorImovel) {
    return inelegivel(
      cfg, valorFinanciado, input, taxaAnual, criteria.programa, prazo, resultadoId,
      `Imóvel acima do teto ${cfg.nome}: ${fmtMoeda(criteria.maxValorImovel)}`
    )
  }

  const taxaMensal = taxaAnualParaMensalPorMetodo(taxaAnual, criteria.metodoConversaoTaxa)

  const maxFinanciavel30 = calcularMaxFinanciavel(input.rendaMensal, input.valorImovel, taxaMensal, prazo, mipCapacidade)

  // Dispatch por CAPACIDADE do critério (estratégia de seguro), não por identidade do banco.
  // 'periodo-e-idade' (hoje só o Itaú) precisa da função de cálculo especializada, porque o
  // MIP muda a cada mês (idade avança, período 0–120/121+ muda a tabela) e porque o banco
  // soma pré-pagamento no mês 0, zera seguros na última parcela, cobra DFI sobre o valor de
  // avaliação (não do imóvel) e pode incorporar ITBI ao saldo financiado.
  let calc: ResultadoCalculo
  let valorFinanciadoEfetivo = valorFinanciado
  if (criteria.seguro.mip.tipo === 'periodo-e-idade') {
    const valorAvaliacao = criteria.seguro.dfi.base === 'valor-avaliacao'
      ? (input.valorAvaliacao ?? input.valorImovel)
      : input.valorImovel
    const valorItbi = (criteria.itbi?.permiteIncorporar && input.incorporarItbi)
      ? input.valorImovel * (input.percentualItbi ?? criteria.itbi.percentualPadrao)
      : 0
    valorFinanciadoEfetivo = valorFinanciado + valorItbi
    const dataBase = input.dataContratacao ? new Date(input.dataContratacao) : undefined
    calc = input.tipoAmortizacao === 'SAC'
      ? calcularSACPeriodoIdade(valorFinanciadoEfetivo, valorAvaliacao, taxaMensal, prazo, input.dataNascimento, criteria.seguro.mip.periodos, dfiRate, dataBase)
      : calcularPRICEPeriodoIdade(valorFinanciadoEfetivo, valorAvaliacao, taxaMensal, prazo, input.dataNascimento, criteria.seguro.mip.periodos, dfiRate, dataBase)
  } else if (!criteria.seguro.incluirNaUltimaParcela) {
    // Caixa (Fase 4): MIP/DFI zerados na última parcela + tarifa de administração mensal
    // fixa somada em toda parcela (ver criteria-resolver.ts, comentário de topo, Fase 4).
    const mip = resolverTaxaMip(criteria.seguro.mip, idadeAnos)
    calc = input.tipoAmortizacao === 'SAC'
      ? calcularSACComTarifaMensalFixa(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate, criteria.tarifaAdministracaoMensal)
      : calcularPRICEComTarifaMensalFixa(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate, criteria.tarifaAdministracaoMensal)
  } else {
    const mip = resolverTaxaMip(criteria.seguro.mip, idadeAnos)
    calc = input.tipoAmortizacao === 'SAC'
      ? calcularSAC(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate)
      : calcularPRICE(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate)
  }

  const comprometimentoMax = (input.tipoAmortizacao === 'PRICE' && criteria.comprometimentoRenda.price)
    ? criteria.comprometimentoRenda.price
    : criteria.comprometimentoRenda.sac
  // Sem renda informada, não há como avaliar comprometimento — não sinalizar aviso.
  const avisoRenda = input.rendaInformada !== false
    && calc.primeiraParcela > input.rendaMensal * comprometimentoMax

  return {
    ...baseResult(cfg, valorFinanciadoEfetivo, input, criteria.programa, taxaAnual, taxaMensal, prazo, maxFinanciavel30, calc, resultadoId),
    elegivel: true,
    avisoRenda,
  }
}

// Núcleo do cálculo: recebe taxa e programa já resolvidos.
// Fase 4 completou a migração de todos os 7 bancos para o caminho de critérios — esta
// função virou um wrapper fino: `taxaAnual`/`programa`/`mipOverride` não são mais lidos
// (o critério recalcula tudo a partir de `cfg`+`overrides`, sempre chegando ao mesmo
// resultado que os chamadores já esperavam obter passando esses parâmetros). Assinatura
// mantida por compatibilidade com os chamadores existentes (`simularBanco`, que ainda
// monta `taxaAnual`/`programa` para os bancos fora do caminho especial da Caixa).
function simularBancoComTaxa(
  cfg: BancoConfig,
  input: InputFinanciamento,
  _taxaAnual: number,
  _programa: string,
  resultadoId: string,
  _mipOverride?: number,
  overrides?: BancoSimOverrides,
): ResultadoBanco {
  const criteria = resolverCriterios(cfg.id, overrides)
  return simularComCriterios(cfg, criteria, input, resultadoId)
}

export function simularBanco(
  bancoId: BancoId,
  input: InputFinanciamento,
  overrides?: BancoSimOverrides,
): ResultadoBanco {
  const cfg = BANCOS_CONFIG[bancoId]

  // Caixa (Fase 4): programa único (Pró-Cotista ou MCMV, senão SBPE) — mesma precedência
  // de sempre (MCMV vence sobre Pró-Cotista se ambos se aplicarem: o `if` de baixo executa
  // por último e sobrescreve). A variação de programa é montada localmente sobre o mesmo
  // critério base — só taxa/programa mudam, LTV/prazo/DFI/tarifa/estratégia de MIP
  // continuam os do critério padrão (mesmo comportamento do código hardcoded original,
  // que também não trocava o MIP para Pró-Cotista/MCMV neste caminho — só em
  // `simularCaixaDuplo`, ver abaixo).
  if (bancoId === 'caixa') {
    const criteriaBase = resolverCriterios('caixa', overrides)
    let criteria: SimulationCriteria = criteriaBase
    if (input.valorImovel <= CAIXA_PRO_COTISTA.maxValorImovel && input.usaFgts !== false) {
      criteria = {
        ...criteriaBase,
        taxaAnualBase: CAIXA_PRO_COTISTA.taxaAnual,
        taxaAnualCorrentista: CAIXA_PRO_COTISTA.taxaAnual,
        programa: CAIXA_PRO_COTISTA.programa,
      }
    }
    // Sem renda informada, `rendaMensal` fica em 0 só por ausência de dado — isso nunca
    // pode "qualificar" o cliente para a faixa MCMV mais subsidiada (0 <= qualquer teto).
    const faixaMcmv = input.rendaInformada === false ? [] : MCMV_FAIXAS.filter(
      (f) => input.rendaMensal <= f.rendaMax && input.valorImovel <= f.tetoImovel
    )
    if (faixaMcmv.length > 0) {
      const f = faixaMcmv[0]
      criteria = { ...criteriaBase, taxaAnualBase: f.taxaAnual, taxaAnualCorrentista: f.taxaAnual, programa: f.programa }
    }
    return simularComCriterios(cfg, criteria, input, bancoId)
  }

  const programa = cfg.programa
  const taxaAnual = overrides?.taxaAnual
    ?? (input.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase)

  return simularBancoComTaxa(cfg, input, taxaAnual, programa, bancoId, undefined, overrides)
}

// Comparação de Cenários: gera N resultados REAIS do motor (um simularComCriterios por
// cenário da lista) para o mesmo critério base — nunca um cálculo paralelo. Só inclui no
// array o que for elegível: se um cenário não qualificar, é omitido por completo (decisão
// de produto — ver docs/calibracao-simuladores/migracao-motor-agnostico-fase-4-caixa.md).
// Genérico de propósito: não sabe nada sobre "SAC"/"PRICE" nem sobre "Caixa" — só sabe
// aplicar uma lista de patches de input e filtrar por elegibilidade. Hoje só a Caixa passa
// uma lista com mais de 1 item (`construirCenariosCaixa`); qualquer outro banco continua
// com exatamente 1 cenário implícito (o `tipoAmortizacao` que já vinha no input), então
// nada muda para eles.
function gerarCenariosComparativos(
  results: ResultadoBanco[],
  cfg: BancoConfig,
  criteria: SimulationCriteria,
  input: InputFinanciamento,
  resultadoIdBase: string,
  cenarios: CenarioComparativo[],
): void {
  for (const cenario of cenarios) {
    const resultado = simularComCriterios(
      cfg, criteria, { ...input, ...cenario.patchInput }, `${resultadoIdBase}-${cenario.sufixoId}`,
    )
    if (resultado.elegivel) {
      if (cenario.observacaoExtra) resultado.observacao = cenario.observacaoExtra
      results.push(resultado)
    }
  }
}

// Cenários comparativos da Caixa: SAC sempre com a entrada informada; PRICE com a entrada
// ajustada para cima quando a informada não atinge o mínimo do teto de LTV da modalidade
// (ex.: 70% → entrada mínima 30%) — reproduz o comportamento do simulador oficial da Caixa,
// que NUNCA rejeita o PRICE por LTV insuficiente: ele recalcula a entrada/financiado para
// caber exatamente no teto, em vez de declarar inelegível. Sem isso, PRICE ficaria
// "impossível na prática" sempre que o comercial informasse uma entrada pensada para SAC
// (teto 80%), que quase nunca atinge os 30% mínimos do PRICE.
function construirCenariosCaixa(input: InputFinanciamento, criteria: SimulationCriteria): CenarioComparativo[] {
  const cenarios: CenarioComparativo[] = [{ sufixoId: 'sac', patchInput: { tipoAmortizacao: 'SAC' } }]

  const maxLtvPrice = criteria.ltv.price
  if (maxLtvPrice == null) {
    cenarios.push({ sufixoId: 'price', patchInput: { tipoAmortizacao: 'PRICE' } })
    return cenarios
  }

  // Arredonda ao centavo antes de comparar — "1 - maxLtvPrice" (ex. 1 - 0.7) pode gerar
  // erro de ponto flutuante (0.30000000000000004), fazendo uma entrada já exatamente no
  // teto parecer "abaixo" por uma fração de centavo e disparar um ajuste espúrio.
  const entradaMinimaPrice = Math.round(input.valorImovel * (1 - maxLtvPrice) * 100) / 100
  const entradaAjustada = Math.max(input.valorEntrada, entradaMinimaPrice)
  const foiAjustada = entradaAjustada > input.valorEntrada

  cenarios.push({
    sufixoId: 'price',
    patchInput: foiAjustada
      ? { tipoAmortizacao: 'PRICE', valorEntrada: entradaAjustada }
      : { tipoAmortizacao: 'PRICE' },
    observacaoExtra: foiAjustada
      ? `Entrada ajustada de ${fmtMoeda(input.valorEntrada)} para ${fmtMoeda(entradaAjustada)} ` +
        `(${Math.round((1 - maxLtvPrice) * 100)}% do imóvel) para viabilizar a modalidade PRICE — ` +
        `teto de financiamento de ${Math.round(maxLtvPrice * 100)}%.`
      : undefined,
  })
  return cenarios
}

// Caixa retorna múltiplos resultados: Pró-Cotista + MCMV (se elegível) + SBPE (sempre),
// cada um deles agora expandido em uma Comparação de Cenários (SAC/PRICE) via
// `gerarCenariosComparativos`. Migrado para o caminho de critérios na Fase 4 — cada
// variante é o mesmo critério base da Caixa (`resolverCriterios('caixa', overrides)`), só
// com taxaAnual/programa/estratégia de MIP trocados pontualmente (ver criteria-resolver.ts,
// comentário de topo, Fase 4).
function simularCaixaDuplo(input: InputFinanciamento, overrides?: BancoSimOverrides, op?: TipoOperacao): ResultadoBanco[] {
  const cfg = BANCOS_CONFIG['caixa']
  const criteriaBase = resolverCriterios('caixa', overrides)
  const results: ResultadoBanco[] = []

  // Entrada ajustada para PRICE (se necessário) é a mesma em todos os programas — LTV não
  // é sobrescrito por Pró-Cotista/MCMV, só taxaAnual/programa/seguro.
  const cenariosCaixa = construirCenariosCaixa(input, criteriaBase)

  // Lote urbanizado: apenas SBPE (MO43000271 §3.1.2 — MCMV/Pró-Cotista não contemplam lote isolado)
  // Comercial: finalidade='comercial' já bloqueia MCMV/Pró-Cotista via podeAcessarMcmv
  const podeMcmvProcotista = op !== 'lote_urbanizado' && input.finalidade !== 'comercial' && !input.jaRecebeuSubsidio

  // Pró-Cotista (imóveis até R$350k, FGTS 3+ anos)
  if (podeMcmvProcotista && input.valorImovel <= CAIXA_PRO_COTISTA.maxValorImovel && input.usaFgts !== false) {
    const criteriaProCotista: SimulationCriteria = {
      ...criteriaBase,
      taxaAnualBase: CAIXA_PRO_COTISTA.taxaAnual,
      taxaAnualCorrentista: CAIXA_PRO_COTISTA.taxaAnual,
      programa: CAIXA_PRO_COTISTA.programa,
      seguro: { ...criteriaBase.seguro, mip: { tipo: 'flat', taxa: MIP_RATE_MCMV } },
    }
    gerarCenariosComparativos(results, cfg, criteriaProCotista, input, 'caixa-procotista', cenariosCaixa)
  }

  // MCMV (se renda e imóvel se enquadram)
  if (podeMcmvProcotista) {
    // Sem renda informada, `rendaMensal` fica em 0 só por ausência de dado — isso nunca
    // pode "qualificar" o cliente para a faixa MCMV mais subsidiada (0 <= qualquer teto).
    const faixaMcmv = input.rendaInformada === false ? [] : MCMV_FAIXAS.filter(
      (f) => input.rendaMensal <= f.rendaMax && input.valorImovel <= f.tetoImovel
    )
    if (faixaMcmv.length > 0) {
      const f = faixaMcmv[0]
      const criteriaMcmv: SimulationCriteria = {
        ...criteriaBase,
        taxaAnualBase: f.taxaAnual,
        taxaAnualCorrentista: f.taxaAnual,
        programa: f.programa,
        seguro: f.mipSubsidizado
          ? { ...criteriaBase.seguro, mip: { tipo: 'flat', taxa: MIP_RATE_MCMV } }
          : criteriaBase.seguro,
      }
      gerarCenariosComparativos(results, cfg, criteriaMcmv, input, 'caixa-mcmv', cenariosCaixa)
    }
  }

  // SBPE — sempre presente como alternativa (é o próprio critério base, sem variação pontual)
  gerarCenariosComparativos(results, cfg, criteriaBase, input, 'caixa-sbpe', cenariosCaixa)

  return results
}

function baseResult(
  cfg: BancoConfig,
  valorFinanciado: number,
  input: InputFinanciamento,
  programa: string,
  taxaAnual: number,
  taxaMensal: number,
  prazo: number,
  maxFinanciavel30: number,
  calc: ResultadoCalculo,
  resultadoId: string,
): ResultadoBanco {
  return {
    resultadoId,
    bancoId: cfg.id,
    bancoNome: cfg.nome,
    corBanco: cfg.cor,
    programa,
    valorFinanciado,
    maxFinanciavel30,
    parcelas: prazo,
    primeiraParcela: calc.primeiraParcela,
    ultimaParcela: calc.ultimaParcela,
    taxaMensal,
    taxaAnual,
    totalJuros: calc.totalJuros,
    totalSeguros: calc.totalSeguros,
    totalPago: valorFinanciado + calc.totalJuros + calc.totalSeguros,
    tipoAmortizacao: input.tipoAmortizacao,
    elegivel: true,
  }
}

function inelegivel(
  cfg: BancoConfig,
  valorFinanciado: number,
  input: InputFinanciamento,
  taxaAnual: number,
  programa: string,
  prazo: number,
  resultadoId: string,
  motivoInelegivel: string
): ResultadoBanco {
  return {
    resultadoId,
    bancoId: cfg.id,
    bancoNome: cfg.nome,
    corBanco: cfg.cor,
    programa,
    valorFinanciado,
    maxFinanciavel30: 0,
    parcelas: prazo,
    primeiraParcela: 0,
    ultimaParcela: 0,
    taxaMensal: 0,
    taxaAnual,
    totalJuros: 0,
    totalSeguros: 0,
    totalPago: valorFinanciado,
    tipoAmortizacao: input.tipoAmortizacao,
    elegivel: false,
    motivoInelegivel,
  }
}

function fmtMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function simularTodosBancos(
  input: InputFinanciamento,
  overridesMap?: Partial<Record<string, BancoSimOverrides>>,
): ResultadoBanco[] {
  const op: TipoOperacao = input.tipoOperacao ?? 'aquisicao'

  // Para construção, valorImovel = terreno + obra
  let inputNorm = input
  if (op === 'construcao_terreno_proprio' || op === 'terreno_mais_construcao') {
    const base = (input.valorTerreno ?? 0) + (input.valorObra ?? 0)
    if (base > 0) inputNorm = { ...input, valorImovel: base }
  }
  // Comercial: garante finalidade='comercial' mesmo que o formulário não tenha setado
  if (op === 'comercial') {
    inputNorm = { ...inputNorm, finalidade: 'comercial' }
  }
  // Lote: tipoImovel não se aplica (lote não é "novo" nem "usado" no sentido habitacional).
  // Deixamos undefined para que o motor não aplique a penalidade de imóvel usado da Caixa.
  if (op === 'lote_urbanizado') {
    inputNorm = { ...inputNorm, tipoImovel: undefined }
  }

  const observacao = op !== 'aquisicao' ? OBSERVACOES_MODALIDADE[op] : ''

  const todos: ResultadoBanco[] = []

  for (const id of inputNorm.bancosIds) {
    const ov = overridesMap?.[id]

    // ── Bloqueios por modalidade ──────────────────────────────────────────────
    // Lote e construção: somente Caixa opera nesta etapa
    if (id !== 'caixa' && (op === 'lote_urbanizado' || op === 'construcao_terreno_proprio' || op === 'terreno_mais_construcao')) {
      todos.push({
        ...makeInelegivelModalidade(id, inputNorm, 'Para esta modalidade, a Caixa é o banco operador padrão nesta etapa. Consulte nossa equipe para outras instituições.'),
        observacao,
      })
      continue
    }
    // Comercial: apenas Caixa opera — outros bancos sempre inelegíveis
    if (id !== 'caixa' && op === 'comercial') {
      todos.push({
        ...makeInelegivelModalidade(id, inputNorm, 'Imóvel comercial: banco não parametrizado para esta modalidade. Consulte nossa equipe para verificar condições.'),
        observacao,
      })
      continue
    }

    // Amortização específica deste banco (ex.: "Itaú sac, Caixa sac e price") — a Caixa
    // ignora isso porque `simularCaixaDuplo` já sempre gera SAC+PRICE independentemente.
    const amortizacaoDoBanco = inputNorm.amortizacaoPorBanco?.[id] ?? inputNorm.tipoAmortizacao
    const inputBanco = amortizacaoDoBanco === inputNorm.tipoAmortizacao
      ? inputNorm
      : { ...inputNorm, tipoAmortizacao: amortizacaoDoBanco }

    if (id === 'caixa') {
      // Não sobrescrever: cada cenário da Caixa pode já ter sua própria observação (ex.:
      // aviso de entrada ajustada para PRICE, ver construirCenariosCaixa) — combina com a
      // observação de modalidade em vez de substituí-la.
      todos.push(...simularCaixaDuplo(inputNorm, ov, op).map(r => ({
        ...r,
        observacao: [r.observacao, observacao].filter(Boolean).join(' ') || undefined,
      })))
    } else {
      todos.push({ ...simularBanco(id, inputBanco, ov), observacao })
    }
  }

  return todos.sort((a, b) => {
    if (a.elegivel && !b.elegivel) return -1
    if (!a.elegivel && b.elegivel) return 1
    return a.primeiraParcela - b.primeiraParcela
  })
}

function makeInelegivelModalidade(bancoId: BancoId, input: InputFinanciamento, motivoInelegivel: string): ResultadoBanco {
  const cfg = BANCOS_CONFIG[bancoId]
  const valorFinanciado = Math.max(0, input.valorImovel - input.valorEntrada)
  return {
    resultadoId: `${bancoId}-modalidade`,
    bancoId: cfg.id,
    bancoNome: cfg.nome,
    corBanco: cfg.cor,
    programa: cfg.programa,
    valorFinanciado,
    maxFinanciavel30: 0,
    parcelas: 0,
    primeiraParcela: 0,
    ultimaParcela: 0,
    taxaMensal: 0,
    taxaAnual: cfg.taxaAnualBase,
    totalJuros: 0,
    totalSeguros: 0,
    totalPago: valorFinanciado,
    tipoAmortizacao: input.tipoAmortizacao,
    elegivel: false,
    motivoInelegivel,
  }
}

export function calcularAnalise(
  input: InputFinanciamento,
  resultados: ResultadoBanco[]
): AnalisePredicativa {
  const elegiveis = resultados.filter((r) => r.elegivel)
  const melhor = elegiveis[0]

  // Para métricas de display, usa banco elegível, senão banco com parcela calculada (bloqueado por renda),
  // senão o primeiro resultado disponível
  const melhorParaMetricas = elegiveis[0]
    ?? resultados.find((r) => !r.elegivel && r.maxFinanciavel30 > 0)
    ?? resultados[0]

  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const ltv = (input.valorImovel - input.valorEntrada) / input.valorImovel

  // Renda ausente (não informada) não é o mesmo que renda = 0 — sem renda real, não dá
  // para calcular comprometimento/máximo financiável por renda (evita divisão por zero
  // e o "Infinity%"/"R$ 0,00" enganosos que apareciam no PDF).
  const rendaInformada = input.rendaInformada !== false

  const comprometimentoRenda = !rendaInformada
    ? null
    : (melhorParaMetricas?.primeiraParcela ?? 0) > 0
      ? (melhorParaMetricas!.primeiraParcela / input.rendaMensal) * 100
      : 100

  const maxFinanciavel = rendaInformada ? (melhorParaMetricas?.maxFinanciavel30 ?? 0) : null

  const rendaMinimaNecessaria = (melhorParaMetricas?.primeiraParcela ?? 0) > 0
    ? melhorParaMetricas!.primeiraParcela / 0.30
    : 0

  const fatores: AnalisePredicativa['fatores'] = []
  let score = 50

  // Renda
  if (!rendaInformada) {
    fatores.push({ descricao: 'Renda não informada — comprometimento de renda não avaliado', impacto: 'negativo' })
  } else if (comprometimentoRenda! <= 20) {
    score += 20
    fatores.push({ descricao: 'Comprometimento de renda baixo (≤ 20%)', impacto: 'positivo' })
  } else if (comprometimentoRenda! <= 28) {
    score += 10
    fatores.push({ descricao: `Comprometimento de renda adequado (${comprometimentoRenda!.toFixed(0)}%)`, impacto: 'positivo' })
  } else if (comprometimentoRenda! <= 30) {
    fatores.push({ descricao: `Comprometimento de renda no limite (${comprometimentoRenda!.toFixed(0)}%)`, impacto: 'negativo' })
  } else {
    score -= 30
    fatores.push({ descricao: 'Renda insuficiente para a parcela (> 30%)', impacto: 'critico' })
  }

  // LTV / Entrada
  if (ltv <= 0.60) {
    score += 15
    fatores.push({ descricao: 'Entrada elevada (≥ 40%) — baixo risco ao banco', impacto: 'positivo' })
  } else if (ltv <= 0.75) {
    score += 8
    fatores.push({ descricao: `Entrada adequada — LTV ${(ltv * 100).toFixed(0)}%`, impacto: 'positivo' })
  } else if (ltv > 0.85) {
    score -= 10
    fatores.push({ descricao: `Entrada baixa — LTV ${(ltv * 100).toFixed(0)}% (entrada mínima recomendada: 20%)`, impacto: 'negativo' })
  }

  // Idade
  if (idadeAnos <= 35) {
    score += 10
    fatores.push({ descricao: 'Idade favorável — prazo máximo de 35 anos disponível', impacto: 'positivo' })
  } else if (idadeAnos >= 65) {
    score -= 10
    fatores.push({ descricao: `Idade ${idadeAnos} anos reduz prazo disponível`, impacto: 'negativo' })
  }

  // Nº de bancos elegíveis — conta bancos únicos (não linhas)
  const bancosElegiveis = new Set(elegiveis.map((r) => r.bancoId))
  if (bancosElegiveis.size >= 4) {
    score += 10
    fatores.push({ descricao: `${bancosElegiveis.size} bancos elegíveis — boa capacidade de negociação`, impacto: 'positivo' })
  } else if (elegiveis.length === 0) {
    score = Math.min(score, 20)
    fatores.push({ descricao: 'Nenhum banco elegível com os parâmetros atuais', impacto: 'critico' })
  } else if (bancosElegiveis.size <= 2) {
    score -= 5
    fatores.push({ descricao: `Apenas ${bancosElegiveis.size} banco(s) elegível(is) — opções limitadas`, impacto: 'negativo' })
  }

  // Correntista
  if (input.correntista) {
    score += 5
    fatores.push({ descricao: 'Relacionamento bancário favorece taxa preferencial', impacto: 'positivo' })
  }

  // MCMV elegível (Caixa)
  const temMcmv = elegiveis.some((r) => r.programa.startsWith('MCMV') || r.programa.includes('Cotista'))
  if (temMcmv) {
    score += 10
    fatores.push({ descricao: 'Elegível para MCMV ou Pró-Cotista — taxa subsidiada', impacto: 'positivo' })
  }

  score = Math.max(0, Math.min(100, score))

  let classificacao: AnalisePredicativa['classificacao']
  if (score >= 70) classificacao = 'alta'
  else if (score >= 50) classificacao = 'moderada'
  else if (score >= 30) classificacao = 'baixa'
  else classificacao = 'improvavel'

  return {
    score,
    classificacao,
    fatores,
    comprometimentoRenda,
    maxFinanciavel,
    rendaMinimaNecessaria,
  }
}
