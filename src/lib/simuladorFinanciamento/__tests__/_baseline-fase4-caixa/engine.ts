/**
 * Cópia EXATA (byte a byte, reconstruída a partir do Read feito no início da sessão da
 * Fase 4, antes de qualquer edição) de `engine.ts` como ele estava ANTES da migração da
 * Caixa — usada só para o teste de equivalência `criteria-migracao-fase4-caixa.test.ts`.
 * Não editar como parte de nenhuma fase futura: este arquivo é congelado no estado
 * "pré-Fase 4" de propósito, para provar que o motor migrado produz exatamente os mesmos
 * resultados que o motor hardcoded que ele substitui.
 */
import type { BancoId, TipoOperacao, InputFinanciamento, ResultadoBanco, AnalisePredicativa } from '../../tipos'
import { BANCOS_CONFIG, MIP_RATES, MIP_RATE_MCMV, DFI_RATE_MENSAL, MCMV_FAIXAS, CAIXA_PRO_COTISTA, CAIXA_MIP_RATES, CAIXA_DFI_RATE, CAIXA_TA_MENSAL, OBSERVACOES_MODALIDADE, LIMITE_IDADE_PRAZO_MESES } from '../../constantes'
import type { BancoConfig } from '../../constantes'
import { resolverCriterios, ehBancoComCriterios } from './criteria-resolver'
import type { SimulationCriteria, EstrategiaSeguroMip, MetodoConversaoTaxa, BancoSimOverrides, PeriodoMip } from '../../criteria'

export { LIMITE_IDADE_PRAZO_MESES }
export type { BancoSimOverrides }

export function taxaAnualParaMensal(taxaAnual: number): number {
  return Math.pow(1 + taxaAnual, 1 / 12) - 1
}

function taxaAnualParaMensalTruncada15Casas(taxaAnual: number): number {
  const raw = Math.pow(1 + taxaAnual, 1 / 12) - 1
  return Math.trunc(raw * 1e15) / 1e15
}

function resolverTaxaMipPorPeriodo(periodos: PeriodoMip[], ageFloor: number, month: number): number {
  const periodo = periodos.find((p) => month >= p.mesInicio && (p.mesFimExclusive == null || month < p.mesFimExclusive))
    ?? periodos[0]
  for (let age = ageFloor; age >= 18; age--) {
    if (periodo.tabelaPorIdade[age] !== undefined) return periodo.tabelaPorIdade[age]
  }
  const tabelaBase = periodos[0].tabelaPorIdade
  const idadeMinimaBase = Math.min(...Object.keys(tabelaBase).map(Number))
  return tabelaBase[idadeMinimaBase] ?? 0.000090
}

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

  const dfiTrunc = Math.trunc(dfiMensal * 100) / 100
  const idadeM0 = idadeDecimalEmMeses(dataNasc, 0, dataBase)
  const mipRateM0 = resolverTaxaMipPorPeriodo(periodosMip, Math.floor(idadeM0), 0)
  const mipM0 = valorFinanciadoTotal * mipRateM0
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

function getCaixaMipRate(idadeAnos: number): number {
  for (const faixa of CAIXA_MIP_RATES) {
    if (idadeAnos <= faixa.maxAge) return faixa.taxa
  }
  return CAIXA_MIP_RATES[CAIXA_MIP_RATES.length - 1].taxa
}

function calcularSACCaixa(
  principal: number,
  valorImovel: number,
  taxaMensal: number,
  prazo: number,
  mipRate: number,
): ResultadoCalculo {
  const amortizacao = principal / prazo
  const dfiMensal = valorImovel * CAIXA_DFI_RATE
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
    const parcela = amortizacao + juros + mip + dfi + CAIXA_TA_MENSAL

    if (i === 1) primeiraParcela = parcela
    if (isLast) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += mip + dfi + CAIXA_TA_MENSAL
    saldoDevedor -= amortizacao
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

function calcularPRICECaixa(
  principal: number,
  valorImovel: number,
  taxaMensal: number,
  prazo: number,
  mipRate: number,
): ResultadoCalculo {
  const fator = Math.pow(1 + taxaMensal, prazo)
  const parcelaCJ = principal * (taxaMensal * fator) / (fator - 1)
  const dfiMensal = valorImovel * CAIXA_DFI_RATE

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
    const parcela = parcelaCJ + mip + dfi + CAIXA_TA_MENSAL

    if (i === 1) primeiraParcela = parcela
    if (isLast) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += mip + dfi + CAIXA_TA_MENSAL
    saldoDevedor = Math.max(0, saldoDevedor - amort)
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

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

function resolverTaxaMip(estrategia: EstrategiaSeguroMip, idadeAnos: number): number {
  switch (estrategia.tipo) {
    case 'faixa-etaria': {
      const faixa = estrategia.faixas.find((f) => idadeAnos >= f.idadeMin && idadeAnos <= f.idadeMax)
      return faixa ? faixa.taxa : estrategia.faixas[estrategia.faixas.length - 1].taxa
    }
    case 'teto-idade': {
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

export function simularComCriterios(
  cfg: BancoConfig,
  criteria: SimulationCriteria,
  input: InputFinanciamento,
  resultadoId: string,
): ResultadoBanco {
  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const prazo = calcularPrazoMaximo(input.dataNascimento, criteria.prazoMaximoMeses, criteria.limiteIdadePrazoMeses)

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
  } else {
    const mip = resolverTaxaMip(criteria.seguro.mip, idadeAnos)
    calc = input.tipoAmortizacao === 'SAC'
      ? calcularSAC(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate)
      : calcularPRICE(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate)
  }

  const comprometimentoMax = (input.tipoAmortizacao === 'PRICE' && criteria.comprometimentoRenda.price)
    ? criteria.comprometimentoRenda.price
    : criteria.comprometimentoRenda.sac
  const avisoRenda = calc.primeiraParcela > input.rendaMensal * comprometimentoMax

  return {
    ...baseResult(cfg, valorFinanciadoEfetivo, input, criteria.programa, taxaAnual, taxaMensal, prazo, maxFinanciavel30, calc, resultadoId),
    elegivel: true,
    avisoRenda,
  }
}

function simularBancoComTaxa(
  cfg: BancoConfig,
  input: InputFinanciamento,
  taxaAnual: number,
  programa: string,
  resultadoId: string,
  mipOverride?: number,
  overrides?: BancoSimOverrides,
): ResultadoBanco {
  if (ehBancoComCriterios(cfg.id)) {
    const criteria = resolverCriterios(cfg.id, overrides)
    return simularComCriterios(cfg, criteria, input, resultadoId)
  }

  const prazoMaxUsado   = overrides?.prazoMaximoMeses ?? cfg.prazoMaximoMeses
  const maxLtvUsado     = overrides?.maxLtv           ?? cfg.maxLtv
  const maxLtvCorrUsado = overrides?.maxLtv           ?? cfg.maxLtvCorrentista

  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const prazo = calcularPrazoMaximo(input.dataNascimento, prazoMaxUsado)
  const mip = mipOverride ?? overrides?.mipRate ?? (
    cfg.id === 'caixa' ? getCaixaMipRate(idadeAnos) : getMipRate(idadeAnos)
  )
  const dfiRate = overrides?.dfiRate

  const valorFinanciado = input.valorImovel - input.valorEntrada

  const baseLtv = input.tipoAmortizacao === 'PRICE'
    ? (overrides?.maxLtv ?? cfg.maxLtvPrice ?? cfg.maxLtv)
    : (input.correntista ? maxLtvCorrUsado : maxLtvUsado)
  const maxLtv = (cfg.id === 'caixa' && input.tipoImovel === 'usado') ? baseLtv - 0.10 : baseLtv
  const maxLtvValue = input.valorImovel * maxLtv

  if (input.tipoAmortizacao === 'PRICE' && !cfg.suportaPrice) {
    return inelegivel(cfg, valorFinanciado, input, taxaAnual, programa, prazo, resultadoId,
      'Não oferece financiamento na modalidade PRICE')
  }
  if (idadeAnos >= 80) {
    return inelegivel(cfg, valorFinanciado, input, taxaAnual, programa, prazo, resultadoId, 'Idade máxima de 80 anos atingida')
  }
  if (prazo < 12) {
    return inelegivel(cfg, valorFinanciado, input, taxaAnual, programa, prazo, resultadoId, 'Prazo insuficiente — mutuário muito próximo dos 80 anos')
  }
  if (valorFinanciado <= 0) {
    return inelegivel(cfg, valorFinanciado, input, taxaAnual, programa, prazo, resultadoId, 'Valor de entrada maior ou igual ao valor do imóvel')
  }
  if (valorFinanciado > maxLtvValue) {
    return inelegivel(
      cfg, valorFinanciado, input, taxaAnual, programa, prazo, resultadoId,
      `Financiamento (${fmtMoeda(valorFinanciado)}) excede ${Math.round(maxLtv * 100)}% do imóvel`
    )
  }
  if (cfg.maxValorImovel > 0 && input.valorImovel > cfg.maxValorImovel) {
    return inelegivel(
      cfg, valorFinanciado, input, taxaAnual, programa, prazo, resultadoId,
      `Imóvel acima do teto ${cfg.nome}: ${fmtMoeda(cfg.maxValorImovel)}`
    )
  }

  const taxaMensal = taxaAnualParaMensal(taxaAnual)

  const maxFinanciavel30 = calcularMaxFinanciavel(
    input.rendaMensal, input.valorImovel, taxaMensal, prazo, mip
  )

  const calc = cfg.id === 'caixa'
    ? (input.tipoAmortizacao === 'SAC'
        ? calcularSACCaixa(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip)
        : calcularPRICECaixa(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip))
    : (input.tipoAmortizacao === 'SAC'
        ? calcularSAC(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate)
        : calcularPRICE(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate))

  const comprometimentoMax = (input.tipoAmortizacao === 'PRICE' && cfg.comprometimentoMaxPrice)
    ? cfg.comprometimentoMaxPrice
    : 0.30
  const avisoRenda = calc.primeiraParcela > input.rendaMensal * comprometimentoMax

  return {
    ...baseResult(cfg, valorFinanciado, input, programa, taxaAnual, taxaMensal, prazo, maxFinanciavel30, calc, resultadoId),
    elegivel: true,
    avisoRenda,
  }
}

export function simularBanco(
  bancoId: BancoId,
  input: InputFinanciamento,
  overrides?: BancoSimOverrides,
): ResultadoBanco {
  const cfg = BANCOS_CONFIG[bancoId]
  let programa = cfg.programa
  let taxaAnual = overrides?.taxaAnual
    ?? (input.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase)

  if (bancoId === 'caixa') {
    if (input.valorImovel <= CAIXA_PRO_COTISTA.maxValorImovel) {
      taxaAnual = CAIXA_PRO_COTISTA.taxaAnual
      programa = CAIXA_PRO_COTISTA.programa
    }
    const faixaMcmv = MCMV_FAIXAS.filter(
      (f) => input.rendaMensal <= f.rendaMax && input.valorImovel <= f.tetoImovel
    )
    if (faixaMcmv.length > 0) {
      taxaAnual = faixaMcmv[0].taxaAnual
      programa = faixaMcmv[0].programa
    }
  }

  return simularBancoComTaxa(cfg, input, taxaAnual, programa, bancoId, undefined, overrides)
}

function simularCaixaDuplo(input: InputFinanciamento, overrides?: BancoSimOverrides, op?: TipoOperacao): ResultadoBanco[] {
  const cfg = BANCOS_CONFIG['caixa']
  const results: ResultadoBanco[] = []

  const podeMcmvProcotista = op !== 'lote_urbanizado' && input.finalidade !== 'comercial' && !input.jaRecebeuSubsidio

  if (podeMcmvProcotista && input.valorImovel <= CAIXA_PRO_COTISTA.maxValorImovel && input.usaFgts !== false) {
    results.push(
      simularBancoComTaxa(cfg, input, CAIXA_PRO_COTISTA.taxaAnual, CAIXA_PRO_COTISTA.programa, 'caixa-procotista', MIP_RATE_MCMV, overrides)
    )
  }

  if (podeMcmvProcotista) {
    const faixaMcmv = MCMV_FAIXAS.filter(
      (f) => input.rendaMensal <= f.rendaMax && input.valorImovel <= f.tetoImovel
    )
    if (faixaMcmv.length > 0) {
      const f = faixaMcmv[0]
      results.push(simularBancoComTaxa(cfg, input, f.taxaAnual, f.programa, 'caixa-mcmv', f.mipSubsidizado ? MIP_RATE_MCMV : undefined, overrides))
    }
  }

  const taxaSbpe = overrides?.taxaAnual ?? (input.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase)
  results.push(simularBancoComTaxa(cfg, input, taxaSbpe, 'SBPE', 'caixa-sbpe', undefined, overrides))

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

  let inputNorm = input
  if (op === 'construcao_terreno_proprio' || op === 'terreno_mais_construcao') {
    const base = (input.valorTerreno ?? 0) + (input.valorObra ?? 0)
    if (base > 0) inputNorm = { ...input, valorImovel: base }
  }
  if (op === 'comercial') {
    inputNorm = { ...inputNorm, finalidade: 'comercial' }
  }
  if (op === 'lote_urbanizado') {
    inputNorm = { ...inputNorm, tipoImovel: undefined }
  }

  const observacao = op !== 'aquisicao' ? OBSERVACOES_MODALIDADE[op] : ''

  const todos: ResultadoBanco[] = []

  for (const id of inputNorm.bancosIds) {
    const ov = overridesMap?.[id]

    if (id !== 'caixa' && (op === 'lote_urbanizado' || op === 'construcao_terreno_proprio' || op === 'terreno_mais_construcao')) {
      todos.push({
        ...makeInelegivelModalidade(id, inputNorm, 'Para esta modalidade, a Caixa é o banco operador padrão nesta etapa. Consulte nossa equipe para outras instituições.'),
        observacao,
      })
      continue
    }
    if (id !== 'caixa' && op === 'comercial') {
      todos.push({
        ...makeInelegivelModalidade(id, inputNorm, 'Imóvel comercial: banco não parametrizado para esta modalidade. Consulte nossa equipe para verificar condições.'),
        observacao,
      })
      continue
    }

    if (id === 'caixa') {
      todos.push(...simularCaixaDuplo(inputNorm, ov, op).map(r => ({ ...r, observacao })))
    } else {
      todos.push({ ...simularBanco(id, inputNorm, ov), observacao })
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

  const melhorParaMetricas = elegiveis[0]
    ?? resultados.find((r) => !r.elegivel && r.maxFinanciavel30 > 0)
    ?? resultados[0]

  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const ltv = (input.valorImovel - input.valorEntrada) / input.valorImovel

  const comprometimentoRenda = (melhorParaMetricas?.primeiraParcela ?? 0) > 0
    ? (melhorParaMetricas!.primeiraParcela / input.rendaMensal) * 100
    : 100

  const maxFinanciavel = melhorParaMetricas?.maxFinanciavel30 ?? 0

  const rendaMinimaNecessaria = (melhorParaMetricas?.primeiraParcela ?? 0) > 0
    ? melhorParaMetricas!.primeiraParcela / 0.30
    : 0

  const fatores: AnalisePredicativa['fatores'] = []
  let score = 50

  if (comprometimentoRenda <= 20) {
    score += 20
    fatores.push({ descricao: 'Comprometimento de renda baixo (≤ 20%)', impacto: 'positivo' })
  } else if (comprometimentoRenda <= 28) {
    score += 10
    fatores.push({ descricao: `Comprometimento de renda adequado (${comprometimentoRenda.toFixed(0)}%)`, impacto: 'positivo' })
  } else if (comprometimentoRenda <= 30) {
    fatores.push({ descricao: `Comprometimento de renda no limite (${comprometimentoRenda.toFixed(0)}%)`, impacto: 'negativo' })
  } else {
    score -= 30
    fatores.push({ descricao: 'Renda insuficiente para a parcela (> 30%)', impacto: 'critico' })
  }

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

  if (idadeAnos <= 35) {
    score += 10
    fatores.push({ descricao: 'Idade favorável — prazo máximo de 35 anos disponível', impacto: 'positivo' })
  } else if (idadeAnos >= 65) {
    score -= 10
    fatores.push({ descricao: `Idade ${idadeAnos} anos reduz prazo disponível`, impacto: 'negativo' })
  }

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

  if (input.correntista) {
    score += 5
    fatores.push({ descricao: 'Relacionamento bancário favorece taxa preferencial', impacto: 'positivo' })
  }

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
