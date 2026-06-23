import type { BancoId, InputFinanciamento, ResultadoBanco, AnalisePredicativa } from './tipos'
import { BANCOS_CONFIG, MIP_RATES, MIP_RATE_MCMV, DFI_RATE_MENSAL, MCMV_FAIXAS, CAIXA_PRO_COTISTA, ITAU_MIP_P1, ITAU_MIP_P2, ITAU_DFI_RATE, CAIXA_MIP_RATES, CAIXA_DFI_RATE, CAIXA_TA_MENSAL, INTER_MIP_SOMPO, INTER_DFI_RATE, DAYCOVAL_MIP_RATE, DAYCOVAL_DFI_RATE } from './constantes'
import type { BancoConfig } from './constantes'

// Overrides por banco, vindos do banco de dados (Configurações > Bancos)
// Campos opcionais — se null/undefined, usa o valor fixado em constantes.ts
export interface BancoSimOverrides {
  taxaAnual?: number       // ex: 0.1190 = 11,90% a.a.
  maxLtv?: number          // ex: 0.80 = 80%
  prazoMaximoMeses?: number
  mipRate?: number         // alíquota MIP mensal (decimal) sobre saldo devedor
  dfiRate?: number         // alíquota DFI mensal (decimal) sobre valor do imóvel
  taxaAdmin?: number       // tarifa mensal fixa em R$ (somente Caixa)
}

export function taxaAnualParaMensal(taxaAnual: number): number {
  return Math.pow(1 + taxaAnual, 1 / 12) - 1
}

// Itaú usa TRUNC com 15 casas decimais na conversão de taxa anual → mensal
function taxaAnualParaMensalItau(taxaAnual: number): number {
  const raw = Math.pow(1 + taxaAnual, 1 / 12) - 1
  return Math.trunc(raw * 1e15) / 1e15
}

// Retorna a alíquota MIP mensal Itaú (nova alíquota / Seguradora Itaú)
// ageFloor = idade inteira (anos completados) no mês em questão
// month = número do mês de pagamento (0 = pré-pagamento de assinatura)
function getItauMipRate(ageFloor: number, month: number): number {
  const table = month > 120 ? ITAU_MIP_P2 : ITAU_MIP_P1
  for (let age = ageFloor; age >= 18; age--) {
    if (table[age] !== undefined) return table[age]
  }
  return ITAU_MIP_P1[18] ?? 0.000090
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

// SAC com MIP variável por idade — exclusivo Itaú
// A "1ª parcela" inclui pré-pagamento de seguros no mês 0 (comportamento do simulador oficial)
function calcularSACItau(
  valorFinanciadoTotal: number,
  valorAvaliacao: number,
  taxaMensal: number,
  prazo: number,
  dataNasc: string,
  dataBase?: Date,
): ResultadoCalculo {
  const amortizacao = valorFinanciadoTotal / prazo
  const dfiMensal = valorAvaliacao * ITAU_DFI_RATE

  // Mês 0: pré-pagamento de seguros (sem amortização nem juros)
  // Nota: MIP não usa TRUNC (valor raw); DFI usa TRUNC(val, 2) conforme simulador Itaú
  const dfiTrunc = Math.trunc(dfiMensal * 100) / 100
  const idadeM0 = idadeDecimalEmMeses(dataNasc, 0, dataBase)
  const mipRateM0 = getItauMipRate(Math.floor(idadeM0), 0)
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
    const mipRate = getItauMipRate(Math.floor(idadeI), i)
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

// PRICE com MIP variável — exclusivo Itaú
function calcularPRICEItau(
  valorFinanciadoTotal: number,
  valorAvaliacao: number,
  taxaMensal: number,
  prazo: number,
  dataNasc: string,
  dataBase?: Date,
): ResultadoCalculo {
  const fator = Math.pow(1 + taxaMensal, prazo)
  const parcelaCJ = valorFinanciadoTotal * (taxaMensal * fator) / (fator - 1)
  const dfiTrunc = Math.trunc(valorAvaliacao * ITAU_DFI_RATE * 100) / 100

  const idadeM0 = idadeDecimalEmMeses(dataNasc, 0, dataBase)
  const mipRateM0 = getItauMipRate(Math.floor(idadeM0), 0)
  const prePayment = valorFinanciadoTotal * mipRateM0 + dfiTrunc

  let saldoDevedor = valorFinanciadoTotal
  let totalJuros = 0
  let totalSeguros = prePayment
  let primeiraParcela = 0
  let ultimaParcela = 0

  for (let i = 1; i <= prazo; i++) {
    const isLast = i === prazo
    const idadeI = idadeDecimalEmMeses(dataNasc, i, dataBase)
    const mipRate = getItauMipRate(Math.floor(idadeI), i)
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

function calcularIdadeEmMeses(dataNasc: string): number {
  const nasc = new Date(dataNasc)
  const hoje = new Date()
  return (
    (hoje.getFullYear() - nasc.getFullYear()) * 12 +
    (hoje.getMonth() - nasc.getMonth())
  )
}

// Prazo máximo: min(prazo do banco, limite de idade = 963 meses de vida - idade atual em meses)
export function calcularPrazoMaximo(
  dataNasc: string,
  prazoMaxBanco: number
): number {
  const idadeMeses = calcularIdadeEmMeses(dataNasc)
  const limiteIdade = 963 - idadeMeses // 80 anos e 6 meses = 966 meses de vida
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

function getCaixaMipRate(idadeAnos: number): number {
  for (const faixa of CAIXA_MIP_RATES) {
    if (idadeAnos <= faixa.maxAge) return faixa.taxa
  }
  return CAIXA_MIP_RATES[CAIXA_MIP_RATES.length - 1].taxa
}

function getInterMipRate(idadeAnos: number): number {
  for (const faixa of INTER_MIP_SOMPO) {
    if (idadeAnos <= faixa.maxAge) return faixa.taxa
  }
  return INTER_MIP_SOMPO[INTER_MIP_SOMPO.length - 1].taxa
}

// SAC Caixa — MIP fixo na contratação, DFI sobre valor do imóvel, TA R$25/mês
// Última parcela: amort + juros + TA (sem MIP, sem DFI — verificado simulador oficial)
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

// PRICE Caixa — mesmas regras de seguros que SAC Caixa
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

// Núcleo do cálculo: recebe taxa e programa já resolvidos
function simularBancoComTaxa(
  cfg: BancoConfig,
  input: InputFinanciamento,
  taxaAnual: number,
  programa: string,
  resultadoId: string,
  mipOverride?: number,
  overrides?: BancoSimOverrides,
): ResultadoBanco {
  // Aplica overrides do banco de dados sobre os valores de constantes.ts
  const prazoMaxUsado   = overrides?.prazoMaximoMeses ?? cfg.prazoMaximoMeses
  const maxLtvUsado     = overrides?.maxLtv           ?? cfg.maxLtv
  const maxLtvCorrUsado = overrides?.maxLtv           ?? cfg.maxLtvCorrentista

  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const prazo = calcularPrazoMaximo(input.dataNascimento, prazoMaxUsado)
  const mip = mipOverride ?? overrides?.mipRate ?? (
    cfg.id === 'caixa'     ? getCaixaMipRate(idadeAnos) :
    cfg.id === 'inter'     ? getInterMipRate(idadeAnos) :
    cfg.id === 'daycoval'  ? DAYCOVAL_MIP_RATE          :
    getMipRate(idadeAnos)
  )
  const dfiRate = overrides?.dfiRate
    ?? (cfg.id === 'inter'    ? INTER_DFI_RATE
      : cfg.id === 'daycoval' ? DAYCOVAL_DFI_RATE
      : undefined)

  const valorFinanciado = input.valorImovel - input.valorEntrada

  // LTV: Caixa PRICE = 70%; imóvel usado reduz 10pp; override do DB tem prioridade
  const baseLtv = input.tipoAmortizacao === 'PRICE'
    ? (overrides?.maxLtv ?? cfg.maxLtvPrice ?? cfg.maxLtv)
    : (input.correntista ? maxLtvCorrUsado : maxLtvUsado)
  const maxLtv = (cfg.id === 'caixa' && input.tipoImovel === 'usado') ? baseLtv - 0.10 : baseLtv
  const maxLtvValue = input.valorImovel * maxLtv

  // ── Verificações de elegibilidade ────────────────────────────────
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

  // Itaú: taxa mensal com TRUNC 15 casas (fidelidade ao simulador oficial)
  const taxaMensal = cfg.id === 'itau'
    ? taxaAnualParaMensalItau(taxaAnual)
    : taxaAnualParaMensal(taxaAnual)

  // Itaú: ITBI pode ser incorporado; DFI sobre valorAvaliacao; MIP varia com idade
  const valorAvaliacao = input.valorAvaliacao ?? input.valorImovel
  const valorItbi = cfg.id === 'itau' && input.incorporarItbi
    ? input.valorImovel * (input.percentualItbi ?? 0.05)
    : 0
  const valorFinanciadoTotal = valorFinanciado + valorItbi

  const maxFinanciavel30 = calcularMaxFinanciavel(
    input.rendaMensal, input.valorImovel, taxaMensal, prazo, mip
  )

  const dataBase = input.dataContratacao ? new Date(input.dataContratacao) : undefined
  const calc = cfg.id === 'itau'
    ? (input.tipoAmortizacao === 'SAC'
        ? calcularSACItau(valorFinanciadoTotal, valorAvaliacao, taxaMensal, prazo, input.dataNascimento, dataBase)
        : calcularPRICEItau(valorFinanciadoTotal, valorAvaliacao, taxaMensal, prazo, input.dataNascimento, dataBase))
    : cfg.id === 'caixa'
      ? (input.tipoAmortizacao === 'SAC'
          ? calcularSACCaixa(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip)
          : calcularPRICECaixa(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip))
      : (input.tipoAmortizacao === 'SAC'
          ? calcularSAC(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate)
          : calcularPRICE(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip, dfiRate))

  const vf = cfg.id === 'itau' ? valorFinanciadoTotal : valorFinanciado

  // Comprometimento de renda: Caixa PRICE = 25%, demais = 30%
  const comprometimentoMax = (input.tipoAmortizacao === 'PRICE' && cfg.comprometimentoMaxPrice)
    ? cfg.comprometimentoMaxPrice
    : 0.30
  const avisoRenda = calc.primeiraParcela > input.rendaMensal * comprometimentoMax

  return {
    ...baseResult(cfg, vf, input, programa, taxaAnual, taxaMensal, prazo, maxFinanciavel30, calc, resultadoId),
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
  // Override de taxa: DB > correntista > base
  let taxaAnual = overrides?.taxaAnual
    ?? (input.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase)

  // Caixa: programa único (Pró-Cotista ou MCMV) — SBPE é tratado por simularCaixaDuplo
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

// Caixa retorna múltiplos resultados: Pró-Cotista + MCMV (se elegível) + SBPE (sempre)
function simularCaixaDuplo(input: InputFinanciamento, overrides?: BancoSimOverrides): ResultadoBanco[] {
  const cfg = BANCOS_CONFIG['caixa']
  const results: ResultadoBanco[] = []

  // Elegibilidade MCMV/Pró-Cotista: apenas residencial e sem subsídio anterior
  const podeAcessarMcmv = input.finalidade !== 'comercial' && !input.jaRecebeuSubsidio

  // Pró-Cotista (imóveis até R$350k, FGTS 3+ anos)
  if (podeAcessarMcmv && input.valorImovel <= CAIXA_PRO_COTISTA.maxValorImovel && input.usaFgts !== false) {
    results.push(
      simularBancoComTaxa(cfg, input, CAIXA_PRO_COTISTA.taxaAnual, CAIXA_PRO_COTISTA.programa, 'caixa-procotista', MIP_RATE_MCMV, overrides)
    )
  }

  // MCMV (se renda e imóvel se enquadram)
  if (podeAcessarMcmv) {
    const faixaMcmv = MCMV_FAIXAS.filter(
      (f) => input.rendaMensal <= f.rendaMax && input.valorImovel <= f.tetoImovel
    )
    if (faixaMcmv.length > 0) {
      const f = faixaMcmv[0]
      results.push(simularBancoComTaxa(cfg, input, f.taxaAnual, f.programa, 'caixa-mcmv', f.mipSubsidizado ? MIP_RATE_MCMV : undefined, overrides))
    }
  }

  // SBPE — sempre presente como alternativa
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
  const todos: ResultadoBanco[] = []

  for (const id of input.bancosIds) {
    const ov = overridesMap?.[id]
    if (id === 'caixa') {
      todos.push(...simularCaixaDuplo(input, ov))
    } else {
      todos.push(simularBanco(id, input, ov))
    }
  }

  return todos.sort((a, b) => {
    if (a.elegivel && !b.elegivel) return -1
    if (!a.elegivel && b.elegivel) return 1
    return a.primeiraParcela - b.primeiraParcela
  })
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

  const comprometimentoRenda = (melhorParaMetricas?.primeiraParcela ?? 0) > 0
    ? (melhorParaMetricas!.primeiraParcela / input.rendaMensal) * 100
    : 100

  const maxFinanciavel = melhorParaMetricas?.maxFinanciavel30 ?? 0

  const rendaMinimaNecessaria = (melhorParaMetricas?.primeiraParcela ?? 0) > 0
    ? melhorParaMetricas!.primeiraParcela / 0.30
    : 0

  const fatores: AnalisePredicativa['fatores'] = []
  let score = 50

  // Renda
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
