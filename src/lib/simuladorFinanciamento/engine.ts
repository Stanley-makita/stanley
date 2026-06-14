import type { BancoId, InputFinanciamento, ResultadoBanco, AnalisePredicativa } from './tipos'
import { BANCOS_CONFIG, MIP_RATES, DFI_RATE, MCMV_FAIXAS } from './constantes'
import type { BancoConfig } from './constantes'

export function taxaAnualParaMensal(taxaAnual: number): number {
  return Math.pow(1 + taxaAnual, 1 / 12) - 1
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

export function calcularPrazoMaximo(dataNasc: string, tipo: 'SAC' | 'PRICE'): number {
  const idadeMeses = calcularIdadeEmMeses(dataNasc)
  const limiteIdade = 963 - idadeMeses // prazo máximo até completar 80 anos e 6 meses
  const limiteModelo = tipo === 'SAC' ? 420 : 360
  return Math.max(12, Math.min(limiteIdade, limiteModelo))
}

export function getMipRate(idadeAnos: number): number {
  const faixa = MIP_RATES.find((f) => idadeAnos <= f.idadeMax)
  return faixa ? faixa.taxa : MIP_RATES[MIP_RATES.length - 1].taxa
}

interface ResultadoCalculo {
  primeiraParcela: number
  ultimaParcela: number
  totalJuros: number
  totalSeguros: number
}

export function calcularSAC(
  principal: number,
  taxaMensal: number,
  prazo: number,
  mip: number,
  dfi: number
): ResultadoCalculo {
  const amortizacao = principal / prazo
  let saldoDevedor = principal
  let totalJuros = 0
  let totalSeguros = 0

  let primeiraParcela = 0
  let ultimaParcela = 0

  for (let i = 1; i <= prazo; i++) {
    const juros = saldoDevedor * taxaMensal
    const seguro = saldoDevedor * (mip + dfi)
    const parcela = amortizacao + juros + seguro

    if (i === 1) primeiraParcela = parcela
    if (i === prazo) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += seguro
    saldoDevedor -= amortizacao
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

export function calcularPRICE(
  principal: number,
  taxaMensal: number,
  prazo: number,
  mip: number,
  dfi: number
): ResultadoCalculo {
  // Parcela fixa de capital+juros
  const fator = Math.pow(1 + taxaMensal, prazo)
  const parcelaCJ = principal * (taxaMensal * fator) / (fator - 1)

  let saldoDevedor = principal
  let totalJuros = 0
  let totalSeguros = 0
  let primeiraParcela = 0
  let ultimaParcela = 0

  for (let i = 1; i <= prazo; i++) {
    const juros = saldoDevedor * taxaMensal
    const amort = parcelaCJ - juros
    const seguro = saldoDevedor * (mip + dfi)
    const parcela = parcelaCJ + seguro

    if (i === 1) primeiraParcela = parcela
    if (i === prazo) ultimaParcela = parcela

    totalJuros += juros
    totalSeguros += seguro
    saldoDevedor -= amort
  }

  return { primeiraParcela, ultimaParcela, totalJuros, totalSeguros }
}

export function calcularMaxFinanciavel(
  renda: number,
  taxaMensal: number,
  prazo: number,
  mip: number,
  dfi: number
): number {
  const parcelaMax = renda * 0.30
  // Busca binária: encontra o principal cuja 1ª parcela = parcelaMax
  let lo = 0
  let hi = renda * 200 // teto razoável
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    const { primeiraParcela } = calcularSAC(mid, taxaMensal, prazo, mip, dfi)
    if (primeiraParcela < parcelaMax) lo = mid
    else hi = mid
  }
  return Math.floor((lo + hi) / 2)
}

export function simularBanco(bancoId: BancoId, input: InputFinanciamento): ResultadoBanco {
  const cfg = BANCOS_CONFIG[bancoId]
  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const prazo = calcularPrazoMaximo(input.dataNascimento, input.tipoAmortizacao)
  const mip = getMipRate(idadeAnos)

  const valorFinanciado = input.valorImovel - input.valorEntrada
  const maxLtvValue = input.valorImovel * cfg.maxLtv

  // Verificações de elegibilidade
  if (idadeAnos >= 80) {
    return {
      ...baseResult(cfg, valorFinanciado, input),
      parcelas: prazo,
      elegivel: false,
      motivoInelegivel: 'Idade máxima de 80 anos atingida',
    }
  }

  if (prazo < 12) {
    return {
      ...baseResult(cfg, valorFinanciado, input),
      parcelas: prazo,
      elegivel: false,
      motivoInelegivel: 'Prazo insuficiente (menos de 12 meses)',
    }
  }

  if (valorFinanciado <= 0) {
    return {
      ...baseResult(cfg, valorFinanciado, input),
      parcelas: prazo,
      elegivel: false,
      motivoInelegivel: 'Valor de entrada maior ou igual ao valor do imóvel',
    }
  }

  if (valorFinanciado > maxLtvValue) {
    return {
      ...baseResult(cfg, valorFinanciado, input),
      parcelas: prazo,
      elegivel: false,
      motivoInelegivel: `Financiamento excede ${Math.round(cfg.maxLtv * 100)}% do valor do imóvel`,
    }
  }

  // Verificar MCMV (só Caixa)
  let programa = cfg.programa
  let taxaAnual = input.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase

  if (bancoId === 'caixa' && cfg.aceitaMcmv) {
    const faixa = MCMV_FAIXAS.filter((f) => input.rendaMensal <= f.rendaMax)
    if (faixa.length > 0) {
      const melhorFaixa = faixa[faixa.length - 1]
      taxaAnual = melhorFaixa.taxaAnual
      programa = melhorFaixa.programa
    }
  }

  const taxaMensal = taxaAnualParaMensal(taxaAnual)
  const maxFinanciavel30 = calcularMaxFinanciavel(input.rendaMensal, taxaMensal, prazo, mip, DFI_RATE)

  const calc =
    input.tipoAmortizacao === 'SAC'
      ? calcularSAC(valorFinanciado, taxaMensal, prazo, mip, DFI_RATE)
      : calcularPRICE(valorFinanciado, taxaMensal, prazo, mip, DFI_RATE)

  // Verificar comprometimento de renda (30%)
  if (calc.primeiraParcela > input.rendaMensal * 0.30) {
    return {
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
      elegivel: false,
      motivoInelegivel: `Parcela (${fmtMoeda(calc.primeiraParcela)}) excede 30% da renda`,
    }
  }

  return {
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

function baseResult(
  cfg: BancoConfig,
  valorFinanciado: number,
  input: InputFinanciamento
) {
  return {
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
    taxaAnual: input.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase,
    totalJuros: 0,
    totalSeguros: 0,
    totalPago: valorFinanciado,
    tipoAmortizacao: input.tipoAmortizacao,
    elegivel: false,
  }
}

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v)
}

export function simularTodosBancos(input: InputFinanciamento) {
  return input.bancosIds
    .map((id) => simularBanco(id, input))
    .sort((a, b) => {
      // Elegíveis primeiro, depois por menor 1ª parcela
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

  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const ltv = (input.valorImovel - input.valorEntrada) / input.valorImovel
  const comprometimentoRenda = melhor
    ? (melhor.primeiraParcela / input.rendaMensal) * 100
    : 100

  const maxFinanciavel = melhor?.maxFinanciavel30 ?? 0
  const taxaMensal = melhor
    ? melhor.taxaMensal
    : taxaAnualParaMensal(0.1099)
  const prazo = melhor?.parcelas ?? 360
  const mip = getMipRate(idadeAnos)
  const rendaMinimaNecessaria = melhor
    ? (melhor.primeiraParcela / 0.30)
    : calcularMaxFinanciavel(input.rendaMensal, taxaMensal, prazo, mip, DFI_RATE) / 0.30

  const fatores: AnalisePredicativa['fatores'] = []
  let score = 50

  // Renda
  if (comprometimentoRenda <= 20) {
    score += 20
    fatores.push({ descricao: 'Comprometimento de renda baixo (≤20%)', impacto: 'positivo' })
  } else if (comprometimentoRenda <= 28) {
    score += 10
    fatores.push({ descricao: `Comprometimento de renda adequado (${comprometimentoRenda.toFixed(0)}%)`, impacto: 'positivo' })
  } else if (comprometimentoRenda <= 30) {
    fatores.push({ descricao: `Comprometimento de renda no limite (${comprometimentoRenda.toFixed(0)}%)`, impacto: 'negativo' })
  } else {
    score -= 30
    fatores.push({ descricao: 'Renda insuficiente para a parcela', impacto: 'critico' })
  }

  // LTV
  if (ltv <= 0.60) {
    score += 15
    fatores.push({ descricao: 'Entrada elevada — baixo risco de inadimplência', impacto: 'positivo' })
  } else if (ltv <= 0.75) {
    score += 5
    fatores.push({ descricao: 'Entrada adequada (LTV ≤ 75%)', impacto: 'positivo' })
  } else if (ltv > 0.90) {
    score -= 10
    fatores.push({ descricao: 'Entrada muito baixa (LTV > 90%)', impacto: 'negativo' })
  }

  // Idade
  if (idadeAnos < 35) {
    score += 10
    fatores.push({ descricao: 'Idade favorável — prazo máximo disponível', impacto: 'positivo' })
  } else if (idadeAnos >= 65) {
    score -= 10
    fatores.push({ descricao: 'Idade avançada reduz o prazo disponível', impacto: 'negativo' })
  }

  // Bancos elegíveis
  if (elegiveis.length >= 4) {
    score += 10
    fatores.push({ descricao: `${elegiveis.length} bancos elegíveis — boa capacidade de negociação`, impacto: 'positivo' })
  } else if (elegiveis.length === 0) {
    score = Math.min(score, 20)
    fatores.push({ descricao: 'Nenhum banco elegível com os parâmetros atuais', impacto: 'critico' })
  } else if (elegiveis.length <= 2) {
    score -= 5
    fatores.push({ descricao: `Apenas ${elegiveis.length} banco(s) elegível(is)`, impacto: 'negativo' })
  }

  // Correntista
  if (input.correntista) {
    score += 5
    fatores.push({ descricao: 'Relacionamento bancário favorece taxa preferencial', impacto: 'positivo' })
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
