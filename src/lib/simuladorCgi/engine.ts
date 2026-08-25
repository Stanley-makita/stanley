/**
 * Motor de cálculo do Simulador Preliminar de CGI / Home Equity.
 *
 * Isolado do motor de financiamento imobiliário — reaproveita apenas funções puras
 * (conversão de taxa anual→mensal, cálculo de IOF), sem importar `BANCOS_CONFIG`/
 * `BancoId` do financiamento (ver constantes.ts para o porquê do isolamento).
 *
 * V1 preliminar e comparativa: nunca rejeita um banco, só limita (LTV/prazo) e explica.
 */

import { taxaAnualParaMensal, calcularIdadeEmMeses } from '@/lib/simuladorFinanciamento/engine'
import { calcularIof } from '@/lib/simulador/calcular'
import { BANCOS_CGI_CONFIG, PRAZO_MAXIMO_CGI_MESES, TODOS_BANCOS_CGI, LIMITE_IDADE_PRAZO_CGI_MESES } from './constantes'
import type { BancoCgiConfig } from './constantes'
import type { BancoCgiId, InputCgi, ResultadoBancoCgi, ResultadoCgiCompleto } from './tipos'

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// 1ª parcela SAC: amortização constante + juros sobre o saldo devedor (mês 1).
export function calcularPrestacaoSacCgi(principal: number, taxaMensal: number, prazoMeses: number): number {
  if (prazoMeses <= 0) return 0
  const amortizacao = principal / prazoMeses
  return round2(amortizacao + principal * taxaMensal)
}

// Parcela fixa PRICE (Tabela Price clássica).
export function calcularPrestacaoPriceCgi(principal: number, taxaMensal: number, prazoMeses: number): number {
  if (prazoMeses <= 0) return 0
  if (taxaMensal === 0) return round2(principal / prazoMeses)
  const fator = Math.pow(1 + taxaMensal, prazoMeses)
  return round2(principal * (taxaMensal * fator) / (fator - 1))
}

function calcularPrestacaoCgi(cfg: BancoCgiConfig, principal: number, taxaMensal: number, prazoMeses: number): number {
  return cfg.sistemaAmortizacao === 'PRICE'
    ? calcularPrestacaoPriceCgi(principal, taxaMensal, prazoMeses)
    : calcularPrestacaoSacCgi(principal, taxaMensal, prazoMeses)
}

export function simularBancoCgi(bancoId: BancoCgiId, input: InputCgi, cfg: BancoCgiConfig = BANCOS_CGI_CONFIG[bancoId]): ResultadoBancoCgi {
  const valorMaximoPeloImovel = round2(input.valorImovel * cfg.ltvMax)
  const valorSolicitado = input.valorDesejado
  const valorSimulado = Math.min(valorSolicitado, valorMaximoPeloImovel)
  const limitadoPeloLtv = valorSolicitado > valorMaximoPeloImovel

  const prazoSolicitado = input.prazoMeses ?? PRAZO_MAXIMO_CGI_MESES
  const prazoMaximoBanco = cfg.prazoMaximoMeses
  const limitadoPeloPrazoBanco = prazoSolicitado > prazoMaximoBanco

  const dataNascimentoUsada = input.dataNascimento ?? null
  const idadeMeses = dataNascimentoUsada ? calcularIdadeEmMeses(dataNascimentoUsada) : null
  const prazoMaximoPorIdade = idadeMeses != null ? LIMITE_IDADE_PRAZO_CGI_MESES - idadeMeses : null

  // Único critério de inelegibilidade por idade: sem nenhum prazo positivo disponível.
  // Não há prazo mínimo operacional de CGI documentado — não inventar um piso (diferente
  // do financiamento imobiliário, que tem seu próprio piso de 12 meses por regra distinta).
  const semPrazoValidoPorIdade = prazoMaximoPorIdade != null && prazoMaximoPorIdade <= 0

  const prazoAposBanco = Math.min(prazoSolicitado, prazoMaximoBanco)
  let prazoConsiderado = prazoAposBanco
  let limitadoPelaIdade = false
  if (!semPrazoValidoPorIdade && prazoMaximoPorIdade != null && prazoMaximoPorIdade < prazoAposBanco) {
    prazoConsiderado = prazoMaximoPorIdade
    limitadoPelaIdade = true
  }
  if (semPrazoValidoPorIdade) prazoConsiderado = 0

  const elegivel = !semPrazoValidoPorIdade
  const motivoInelegivel = semPrazoValidoPorIdade
    ? 'Sem prazo disponível pela regra etária (idade + prazo não pode ultrapassar 80 anos e 3 meses).'
    : undefined

  const taxaMensal = taxaAnualParaMensal(cfg.taxaAnualBase)

  const iofEstimado = calcularIof(valorSimulado)
  const valorTotalAposIof = round2(valorSimulado + iofEstimado)

  // IOF pago à parte — a prestação é calculada sobre o crédito liberado (valorSimulado),
  // nunca sobre valorTotalAposIof (decisão confirmada com o usuário).
  const prestacaoEstimada = calcularPrestacaoCgi(cfg, valorSimulado, taxaMensal, prazoConsiderado)

  return {
    bancoId,
    bancoNome: cfg.nome,
    cor: cfg.cor,
    corTexto: cfg.corTexto,
    sistemaAmortizacao: cfg.sistemaAmortizacao,
    indexadoIpca: cfg.indexadoIpca,
    valorImovel: input.valorImovel,
    valorSolicitado,
    valorMaximoPeloImovel,
    valorSimulado,
    percentualFinanciado: input.valorImovel > 0 ? valorSimulado / input.valorImovel : 0,
    limitadoPeloLtv,
    taxaAnualReferencia: cfg.taxaAnualBase,
    taxaMensal,
    prazoSolicitado,
    dataNascimentoUsada,
    prazoMaximoBanco,
    prazoMaximoPorIdade,
    prazoConsiderado,
    limitadoPeloPrazoBanco,
    limitadoPelaIdade,
    iofEstimado,
    valorTotalAposIof,
    prestacaoEstimada,
    elegivel,
    motivoInelegivel,
  }
}

export function resolverBancosCgi(bancosSolicitados: BancoCgiId[]): BancoCgiId[] {
  return bancosSolicitados.length > 0 ? bancosSolicitados : TODOS_BANCOS_CGI
}

export function simularTodosBancosCgi(input: InputCgi, bancosIds: BancoCgiId[]): ResultadoBancoCgi[] {
  return bancosIds.map((id) => simularBancoCgi(id, input))
}

// Critério: elegível primeiro, depois menor prestação — mesmo critério do motor de
// financiamento (simuladorFinanciamento/engine.ts). Rotulado como "menor prestação
// estimada nesta simulação", nunca como "melhor cenário" (comparação mistura SAC/PRICE/
// taxa fixa/pós-fixada sem IPCA projetado — não é uma recomendação de melhor negócio).
export function resolverMenorPrestacaoCgi(bancos: ResultadoBancoCgi[]): BancoCgiId | null {
  if (bancos.length === 0) return null
  const ordenados = [...bancos].sort((a, b) => {
    if (a.elegivel && !b.elegivel) return -1
    if (!a.elegivel && b.elegivel) return 1
    return a.prestacaoEstimada - b.prestacaoEstimada
  })
  // Se nenhum banco é elegível (ex.: todos sem prazo disponível pela idade), não há
  // "menor prestação" — retornar null em vez de apontar um banco inelegível.
  return ordenados[0].elegivel ? ordenados[0].bancoId : null
}

export function executarSimulacaoCgi(input: InputCgi): ResultadoCgiCompleto {
  const bancosIds = resolverBancosCgi(input.bancosIds)
  const bancos = simularTodosBancosCgi(input, bancosIds)
  return {
    input,
    bancos,
    bancoMenorPrestacaoId: resolverMenorPrestacaoCgi(bancos),
    dataSimulacao: new Date().toISOString(),
  }
}
