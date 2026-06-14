import type { BancoId, InputFinanciamento, ResultadoBanco, AnalisePredicativa } from './tipos'
import { BANCOS_CONFIG, MIP_RATES, DFI_RATE_MENSAL, MCMV_FAIXAS, CAIXA_PRO_COTISTA } from './constantes'
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

interface ResultadoCalculo {
  primeiraParcela: number
  ultimaParcela: number
  totalJuros: number
  totalSeguros: number
}

// DFI: fixo sobre valor do imóvel (não sobre saldo devedor)
// MIP: variável sobre saldo devedor
export function calcularSAC(
  principal: number,
  valorImovel: number,
  taxaMensal: number,
  prazo: number,
  mip: number
): ResultadoCalculo {
  const amortizacao = principal / prazo
  let saldoDevedor = principal
  let totalJuros = 0
  let totalSeguros = 0
  let primeiraParcela = 0
  let ultimaParcela = 0
  const dfiMensal = valorImovel * DFI_RATE_MENSAL

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
  mip: number
): ResultadoCalculo {
  const fator = Math.pow(1 + taxaMensal, prazo)
  const parcelaCJ = principal * (taxaMensal * fator) / (fator - 1)
  const dfiMensal = valorImovel * DFI_RATE_MENSAL

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

export function simularBanco(bancoId: BancoId, input: InputFinanciamento): ResultadoBanco {
  const cfg = BANCOS_CONFIG[bancoId]
  const idadeAnos = calcularIdadeEmAnos(input.dataNascimento)
  const prazo = calcularPrazoMaximo(input.dataNascimento, cfg.prazoMaximoMeses)
  const mip = getMipRate(idadeAnos)

  const valorFinanciado = input.valorImovel - input.valorEntrada
  const maxLtv = input.correntista ? cfg.maxLtvCorrentista : cfg.maxLtv
  const maxLtvValue = input.valorImovel * maxLtv

  // ── Verificações de elegibilidade ────────────────────────────────
  if (idadeAnos >= 80) {
    return inelegivel(cfg, valorFinanciado, input, prazo, 'Idade máxima de 80 anos atingida')
  }
  if (prazo < 12) {
    return inelegivel(cfg, valorFinanciado, input, prazo, 'Prazo insuficiente — mutuário muito próximo dos 80 anos')
  }
  if (valorFinanciado <= 0) {
    return inelegivel(cfg, valorFinanciado, input, prazo, 'Valor de entrada maior ou igual ao valor do imóvel')
  }
  if (valorFinanciado > maxLtvValue) {
    return inelegivel(
      cfg, valorFinanciado, input, prazo,
      `Financiamento (${fmtMoeda(valorFinanciado)}) excede ${Math.round(maxLtv * 100)}% do imóvel`
    )
  }
  if (cfg.maxValorImovel > 0 && input.valorImovel > cfg.maxValorImovel) {
    return inelegivel(
      cfg, valorFinanciado, input, prazo,
      `Imóvel acima do teto ${cfg.nome}: ${fmtMoeda(cfg.maxValorImovel)}`
    )
  }

  // ── Escolha de programa / taxa ────────────────────────────────────
  let programa = cfg.programa
  let taxaAnual = input.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase

  // Caixa: verificar MCMV e Pró-Cotista antes do SBPE padrão
  if (bancoId === 'caixa') {
    // Pró-Cotista (prioridade sobre MCMV para cotistas com renda até R$350k em imóvel elegível)
    if (input.valorImovel <= CAIXA_PRO_COTISTA.maxValorImovel) {
      taxaAnual = CAIXA_PRO_COTISTA.taxaAnual
      programa = CAIXA_PRO_COTISTA.programa
    }

    // MCMV (sobrescreve Pró-Cotista se renda se enquadrar na faixa)
    const faixaMcmv = MCMV_FAIXAS.filter(
      (f) => input.rendaMensal <= f.rendaMax && input.valorImovel <= f.tetoImovel
    )
    if (faixaMcmv.length > 0) {
      const melhor = faixaMcmv[0] // menor renda = melhor taxa
      taxaAnual = melhor.taxaAnual
      programa = melhor.programa
    }
  }

  const taxaMensal = taxaAnualParaMensal(taxaAnual)
  const maxFinanciavel30 = calcularMaxFinanciavel(
    input.rendaMensal, input.valorImovel, taxaMensal, prazo, mip
  )

  const calc =
    input.tipoAmortizacao === 'SAC'
      ? calcularSAC(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip)
      : calcularPRICE(valorFinanciado, input.valorImovel, taxaMensal, prazo, mip)

  // Verificar comprometimento de renda (30%)
  if (calc.primeiraParcela > input.rendaMensal * 0.30) {
    return {
      ...baseResult(cfg, valorFinanciado, input, programa, taxaAnual, taxaMensal, prazo, maxFinanciavel30, calc),
      elegivel: false,
      motivoInelegivel: `1ª parcela (${fmtMoeda(calc.primeiraParcela)}) > 30% da renda (${fmtMoeda(input.rendaMensal * 0.30)})`,
    }
  }

  return {
    ...baseResult(cfg, valorFinanciado, input, programa, taxaAnual, taxaMensal, prazo, maxFinanciavel30, calc),
    elegivel: true,
  }
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
  calc: ResultadoCalculo
): ResultadoBanco {
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

function inelegivel(
  cfg: BancoConfig,
  valorFinanciado: number,
  input: InputFinanciamento,
  prazo: number,
  motivoInelegivel: string
): ResultadoBanco {
  const taxaAnual = input.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase
  return {
    bancoId: cfg.id,
    bancoNome: cfg.nome,
    corBanco: cfg.cor,
    programa: cfg.programa,
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

export function simularTodosBancos(input: InputFinanciamento): ResultadoBanco[] {
  return input.bancosIds
    .map((id) => simularBanco(id, input))
    .sort((a, b) => {
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

  // Nº de bancos elegíveis
  if (elegiveis.length >= 4) {
    score += 10
    fatores.push({ descricao: `${elegiveis.length} bancos elegíveis — boa capacidade de negociação`, impacto: 'positivo' })
  } else if (elegiveis.length === 0) {
    score = Math.min(score, 20)
    fatores.push({ descricao: 'Nenhum banco elegível com os parâmetros atuais', impacto: 'critico' })
  } else if (elegiveis.length <= 2) {
    score -= 5
    fatores.push({ descricao: `Apenas ${elegiveis.length} banco(s) elegível(is) — opções limitadas`, impacto: 'negativo' })
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
