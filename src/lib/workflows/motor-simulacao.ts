/**
 * Motor de Simulação — única implementação de regra de negócio de simulação de crédito.
 *
 * Usado por workflow-consulta.ts (*simula) e workflow-captacao.ts (*cria cliente).
 * Nenhuma regra de validação, cálculo de capacidade, tratamento de renda/prazo ou
 * composição de resposta deve existir fora daqui — os workflows apenas orquestram
 * (Pessoa/Lead/Documentos/PDF/persistência) e chamam este módulo para tudo o mais.
 *
 * Não interpreta texto (isso é do Parser) e não decide se cria Pessoa/Lead (isso é do Workflow).
 */

import type { DadosCaptacaoNormalizados } from './normalizador-captacao'
import {
  simularTodosBancos, calcularAnalise,
  calcularMaxFinanciavel, calcularIdadeEmAnos, calcularPrazoMaximo, getMipRate, taxaAnualParaMensal,
} from '@/lib/simuladorFinanciamento/engine'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
import type { BancoId, InputFinanciamento, ResultadoBanco, AnalisePredicativa } from '@/lib/simuladorFinanciamento/tipos'
import { TODOS_BANCOS, BANCOS_CONFIG, BANCOS_PRICE } from '@/lib/simuladorFinanciamento/constantes'

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// ── Validação mínima para acionar o Motor de Crédito ──────────────────────────
// Renda NUNCA bloqueia a simulação — sua ausência é tratada como diagnóstico
// (renda necessária estimada), não como impeditivo.
// Nome não entra aqui: é pré-requisito de quem cria Pessoa/Lead, não do cálculo.

export interface ResultadoValidacaoSimulacao {
  valido: boolean
  camposFaltantes: string[]
}

export function validarParaSimulacao(dados: DadosCaptacaoNormalizados): ResultadoValidacaoSimulacao {
  const camposFaltantes: string[] = []

  if (!dados.data_nascimento) {
    camposFaltantes.push('Data de nascimento')
  }
  // valor_imovel é opcional apenas quando a pergunta é "quanto essa renda comporta" (sem referência de imóvel)
  if (dados.valor_imovel === null && dados.modo_calculo !== 'VALOR_MAXIMO_PELA_RENDA') {
    camposFaltantes.push('Valor do imóvel')
  }

  return { valido: camposFaltantes.length === 0, camposFaltantes: camposFaltantes }
}

// ── Resolução de bancos ────────────────────────────────────────────────────────

export function resolverBancos(dados: DadosCaptacaoNormalizados): BancoId[] {
  let bancosIds: BancoId[] =
    dados.todos_bancos || dados.bancos_ids.length === 0
      ? (TODOS_BANCOS as BancoId[])
      : (dados.bancos_ids as BancoId[])

  // PRICE sem banco específico → usar apenas bancos habilitados para PRICE
  if (dados.tipo_amortizacao === 'PRICE' && (dados.todos_bancos || dados.bancos_ids.length === 0)) {
    bancosIds = BANCOS_PRICE as BancoId[]
  }
  return bancosIds
}

// ── Resultado unificado ────────────────────────────────────────────────────────

export interface ItemCapacidade {
  bancoId: BancoId
  bancoNome: string
  maxFinanciavel: number
  entradaMinima: number | null
  prazoUsado: number
  taxaAnual: number
}

export type ModoResultadoSimulacao = 'NORMAL' | 'CAPACIDADE_MAXIMA'

export interface ResultadoSimulacaoUnificado {
  modo: ModoResultadoSimulacao
  dados: DadosCaptacaoNormalizados
  bancosIds: BancoId[]
  prazoLabel: string
  rendaMensal: number
  semRenda: boolean
  // modo NORMAL
  input?: InputFinanciamento
  bancosResult?: ResultadoBanco[]
  analise?: AnalisePredicativa
  // modo CAPACIDADE_MAXIMA (sem valor_imovel informado)
  capacidade?: ItemCapacidade[]
}

// ── Execução ────────────────────────────────────────────────────────────────────

export async function executarSimulacao(
  dadosEntrada: DadosCaptacaoNormalizados,
  overridesBanco: Partial<Record<string, BancoSimOverrides>>,
): Promise<ResultadoSimulacaoUnificado> {
  const dados = { ...dadosEntrada }
  const bancosIds = resolverBancos(dados)
  const rendaMensal = (dados.renda_formal ?? 0) + (dados.renda_informal ?? 0)
  const semRenda = rendaMensal === 0

  // "Valor máximo financiamento" sem imóvel de referência → tabela de capacidade por banco
  if (dados.modo_calculo === 'VALOR_MAXIMO_PELA_RENDA' && dados.valor_imovel === null) {
    const capacidade = calcularCapacidadeMaxima(dados, bancosIds, overridesBanco, rendaMensal)
    const prazoLabel = dados.prazo_maximo || !dados.prazo_meses
      ? 'prazo máximo por banco'
      : `${dados.prazo_meses} meses`
    return { modo: 'CAPACIDADE_MAXIMA', dados, bancosIds, prazoLabel, rendaMensal, semRenda, capacidade }
  }

  // Modo NORMAL — cobre: simulação direta, e "valor máximo financiamento" quando há
  // imóvel de referência (financiado auto-derivado para o teto de LTV/renda).
  if (dados.valor_entrada === null && dados.valor_financiado === null && dados.valor_imovel !== null) {
    autoDerivarEntradaFinanciado(dados, bancosIds)
  } else if (dados.modo_calculo === 'VALOR_MAXIMO_PELA_RENDA' && dados.valor_imovel !== null) {
    // Financiado/entrada já vieram informados, mas o pedido é pelo máximo — recalcula ignorando-os.
    dados.valor_entrada = null
    dados.valor_financiado = null
    autoDerivarEntradaFinanciado(dados, bancosIds, { ignorarRenda: true })
  }

  // Prazo customizado via override (não aplica quando "prazo máximo" foi pedido — usa o teto do banco)
  const overrides: Partial<Record<string, BancoSimOverrides>> = { ...overridesBanco }
  if (dados.prazo_meses && !dados.prazo_maximo) {
    for (const id of bancosIds) {
      overrides[id] = { ...(overrides[id] ?? {}), prazoMaximoMeses: dados.prazo_meses }
    }
  }

  const input: InputFinanciamento = {
    valorImovel:     dados.valor_imovel!,
    valorEntrada:    dados.valor_entrada!,
    dataNascimento:  dados.data_nascimento!,
    rendaMensal,
    tipoAmortizacao: dados.tipo_amortizacao,
    correntista:     dados.correntista,
    bancosIds,
    nomeCliente:     dados.nome ?? undefined,
    cpfCliente:      dados.cpf ?? undefined,
    tipoImovel:      dados.tipo_imovel ?? undefined,
    finalidade:      dados.finalidade_efetiva,
    tipoOperacao:    dados.tipo_operacao,
    valorTerreno:    dados.valor_terreno ?? undefined,
    valorObra:       dados.valor_obra    ?? undefined,
    usaFgts:         dados.usa_fgts || undefined,
  }

  const bancosResult = simularTodosBancos(input, overrides)
  const analise = calcularAnalise(input, bancosResult)

  const prazoLabel = dados.prazo_meses ? `${dados.prazo_meses} meses` : 'prazo máximo por banco'

  return { modo: 'NORMAL', dados, bancosIds, prazoLabel, rendaMensal, semRenda, input, bancosResult, analise }
}

// Deriva entrada/financiado quando só o imóvel foi informado.
// ignorarRenda: usado quando o pedido é pelo máximo financiamento — o teto vira só LTV, não renda.
function autoDerivarEntradaFinanciado(
  dados: DadosCaptacaoNormalizados,
  bancosIds: BancoId[],
  opts?: { ignorarRenda: boolean },
): void {
  const rendaTotal = (dados.renda_formal ?? 0) + (dados.renda_informal ?? 0)
  const valorImovel = dados.valor_imovel!

  const ltvMin = bancosIds.reduce((acc, id) => {
    const cfg = BANCOS_CONFIG[id]
    return Math.min(acc, dados.correntista ? cfg.maxLtvCorrentista : cfg.maxLtv)
  }, 0.80)
  const maxByLtv = Math.round(valorImovel * ltvMin)

  let maxByRenda = valorImovel
  if (!opts?.ignorarRenda && rendaTotal > 0 && dados.data_nascimento) {
    const idadeCalc = calcularIdadeEmAnos(dados.data_nascimento)
    const mipCalc   = getMipRate(idadeCalc)
    const prazoCalc = dados.prazo_meses ?? 360
    const bancoRef  = bancosIds[0]
    const taxaRef   = bancoRef
      ? (dados.correntista ? BANCOS_CONFIG[bancoRef].taxaAnualCorrentista : BANCOS_CONFIG[bancoRef].taxaAnualBase)
      : 0.10
    maxByRenda = calcularMaxFinanciavel(rendaTotal, valorImovel, taxaAnualParaMensal(taxaRef), prazoCalc, mipCalc)
  }

  dados.valor_financiado = Math.max(0, Math.min(maxByRenda, maxByLtv, valorImovel))
  dados.valor_entrada    = valorImovel - dados.valor_financiado
}

function calcularCapacidadeMaxima(
  dados: DadosCaptacaoNormalizados,
  bancosIds: BancoId[],
  overridesBanco: Partial<Record<string, BancoSimOverrides>>,
  rendaMensal: number,
): ItemCapacidade[] {
  const idadeAnos = calcularIdadeEmAnos(dados.data_nascimento!)
  const mip = getMipRate(idadeAnos)

  return bancosIds
    .map((bancoId): ItemCapacidade | null => {
      const cfg = BANCOS_CONFIG[bancoId]
      const override = overridesBanco[bancoId] as BancoSimOverrides | undefined

      const taxaAnual  = override?.taxaAnual ?? (dados.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase)
      const taxaMensal = taxaAnualParaMensal(taxaAnual)

      const prazoBase = override?.prazoMaximoMeses ?? cfg.prazoMaximoMeses
      const prazoReq  = dados.prazo_maximo ? prazoBase : (dados.prazo_meses ?? prazoBase)
      const prazoEfetivo = calcularPrazoMaximo(dados.data_nascimento!, prazoReq)
      if (prazoEfetivo < 12) return null // mutuário próximo dos 80 anos

      const valorRef = dados.valor_imovel ?? 5_000_000
      const maxByIncome = calcularMaxFinanciavel(rendaMensal, valorRef, taxaMensal, prazoEfetivo, mip)

      const maxLtv = dados.correntista ? cfg.maxLtvCorrentista : cfg.maxLtv
      const maxByLtv = dados.valor_imovel ? Math.round(dados.valor_imovel * maxLtv) : Infinity
      const maxFinal = Math.max(0, Math.min(maxByIncome, maxByLtv))

      return {
        bancoId,
        bancoNome: cfg.nome,
        maxFinanciavel: maxFinal,
        entradaMinima: dados.valor_imovel ? Math.max(0, dados.valor_imovel - maxFinal) : null,
        prazoUsado: prazoEfetivo,
        taxaAnual,
      }
    })
    .filter((r): r is ItemCapacidade => r !== null)
}

// ── Composição de resposta ────────────────────────────────────────────────────
// Apenas o "corpo": bancos, avisos de renda, prazo, idade aproximada.
// Cabeçalho (Consulta Rápida / Cliente e Lead criados) fica a cargo de cada workflow.

export function montarRespostaSimulacao(
  resultado: ResultadoSimulacaoUnificado,
  opts: { nomeDisplay: string },
): string {
  return resultado.modo === 'CAPACIDADE_MAXIMA'
    ? montarRespostaCapacidadeMaxima(resultado, opts)
    : montarRespostaNormal(resultado, opts)
}

function montarRespostaNormal(
  resultado: ResultadoSimulacaoUnificado,
  opts: { nomeDisplay: string },
): string {
  const { dados, bancosResult = [], semRenda, rendaMensal, prazoLabel } = resultado
  const elegiveis   = bancosResult.filter((b) => b.elegivel)
  const inelegiveis = bancosResult.filter((b) => !b.elegivel)

  const listaBancos = elegiveis.length > 0
    ? elegiveis.map((b) => {
        const prog = b.programa !== b.bancoNome ? ` (${b.programa})` : ''
        let linha = `• ${b.bancoNome}${prog} — 1ª ${fmt.format(b.primeiraParcela)} | Última ${fmt.format(b.ultimaParcela)}`

        if (semRenda) {
          const rendaNecessaria = Math.ceil(b.primeiraParcela / 0.30)
          linha += `\n  _Renda necessária estimada: ~${fmt.format(rendaNecessaria)}/mês_`
        } else if (b.avisoRenda) {
          const rendaNecessaria = Math.ceil(b.primeiraParcela / 0.30)
          const podeFinanciar   = b.maxFinanciavel30 ?? 0
          linha += `\n  ⚠️ *Diagnóstico — renda incompatível com o valor solicitado.*`
          if (podeFinanciar > 0) {
            linha += `\n  Com a renda informada: estimativa de capacidade até ${fmt.format(podeFinanciar)}.`
          }
          linha += `\n  Para financiar ${fmt.format(dados.valor_financiado ?? b.valorFinanciado)}: renda aproximada necessária ${fmt.format(rendaNecessaria)}/mês.`
        }
        return linha
      }).join('\n')
    : null

  const rendaLabel = semRenda ? 'Renda: não informada' : `Renda: ${fmt.format(rendaMensal)}`

  const linhas: string[] = [
    `📊 *Simulação — ${fmt.format(dados.valor_imovel!)} | Entrada ${fmt.format(dados.valor_entrada!)}*`,
    `${rendaLabel} | ${dados.tipo_amortizacao} | ${prazoLabel}`,
  ]

  if (listaBancos) {
    linhas.push('', `🏦 *Bancos:*`, listaBancos)
    if (inelegiveis.length > 0) {
      linhas.push('', `_Os demais bancos não simulam ou não estão parametrizados para este produto._`)
    }
  } else {
    linhas.push('', `Não encontrei simulação válida para os dados informados. Verifique produto, valor do imóvel, valor financiado, renda, idade e modalidade.`)
  }

  if (semRenda) {
    linhas.push('', `ℹ️ _Renda não informada. Valores de renda necessária são estimativas para comprometimento máximo de 30% (SAC)._`)
  } else if (elegiveis.some((b) => b.avisoRenda)) {
    linhas.push('', `ℹ️ _Os valores acima são diagnóstico de capacidade — não representam aprovação. Para o valor solicitado, a renda informada é insuficiente conforme política de crédito dos bancos._`)
  }

  if (dados.usou_idade_aproximada) {
    linhas.push('', `ℹ️ _Usei a idade informada para calcular. Para maior precisão, envie a data de nascimento completa._`)
  }

  return linhas.join('\n')
}

function montarRespostaCapacidadeMaxima(
  resultado: ResultadoSimulacaoUnificado,
  opts: { nomeDisplay: string },
): string {
  const { dados, capacidade = [], rendaMensal, prazoLabel } = resultado

  const linhas: string[] = [
    `📊 *Parâmetros:*`,
    `Renda: ${fmt.format(rendaMensal)} | ${dados.tipo_amortizacao} | ${prazoLabel}`,
  ]

  if (dados.valor_imovel) {
    linhas.push(`Imóvel de referência: ${fmt.format(dados.valor_imovel)}`)
  }

  linhas.push('', `🏦 *Financiamento máximo suportado pela renda:*`)

  if (capacidade.length === 0) {
    linhas.push('• Nenhum banco disponível (idade máxima ou prazo insuficiente)')
  } else {
    for (const r of capacidade) {
      if (r.maxFinanciavel <= 0) {
        linhas.push(`• ${r.bancoNome} — Renda insuficiente para este banco`)
        continue
      }
      const entradaStr = r.entradaMinima !== null ? ` | Entrada mín. ${fmt.format(r.entradaMinima)}` : ''
      const taxaStr = (r.taxaAnual * 100).toFixed(2).replace('.', ',')
      linhas.push(`• ${r.bancoNome} — até ${fmt.format(r.maxFinanciavel)}${entradaStr} | ${r.prazoUsado} m | ${taxaStr}% a.a.`)
    }
  }

  if (dados.usou_idade_aproximada) {
    linhas.push('', `ℹ️ _Usei a idade informada para calcular. Para maior precisão, envie a data de nascimento completa._`)
  }

  return linhas.join('\n')
}

// ── PDF ────────────────────────────────────────────────────────────────────────

export async function gerarPdfSimulacao(
  resultado: ResultadoSimulacaoUnificado,
  opts: { clienteNome?: string; responsavelNome: string; cpfCliente?: string | null; tipoVinculo?: 'AVULSA_SEM_CPF' },
): Promise<Buffer> {
  if (resultado.modo === 'CAPACIDADE_MAXIMA') {
    const { gerarPDFCapacidadeMaximaBuffer } = await import('@/lib/simuladorFinanciamento/gerarPDFBuffer')
    const { dados, capacidade = [], rendaMensal, prazoLabel } = resultado
    return gerarPDFCapacidadeMaximaBuffer({
      rendaMensal,
      idadeAnos: calcularIdadeEmAnos(dados.data_nascimento!),
      tipoAmortizacao: dados.tipo_amortizacao,
      prazoLabel,
      nomeCliente: dados.nome,
      cpfCliente: opts.tipoVinculo === 'AVULSA_SEM_CPF' ? null : (opts.cpfCliente ?? dados.cpf),
      valorImovelRef: dados.valor_imovel,
      cidadeImovel: dados.cidade_imovel,
      tipoImovel: dados.tipo_imovel,
      dataSimulacao: new Date().toISOString(),
      tipoVinculo: opts.tipoVinculo,
      bancos: capacidade,
    }, { responsavelNome: opts.responsavelNome })
  }

  const { gerarPDFFinanciamentoBuffer } = await import('@/lib/simuladorFinanciamento/gerarPDFBuffer')
  const resultadoCompleto = {
    input: resultado.input!,
    bancos: resultado.bancosResult!,
    analise: resultado.analise!,
    dataSimulacao: new Date().toISOString(),
  }
  return gerarPDFFinanciamentoBuffer(resultadoCompleto, {
    clienteNome: opts.clienteNome,
    responsavelNome: opts.responsavelNome,
  })
}

export function tipoSimulacaoParaPersistencia(resultado: ResultadoSimulacaoUnificado): 'consulta' | 'capacidade_maxima' {
  return resultado.modo === 'CAPACIDADE_MAXIMA' ? 'capacidade_maxima' : 'consulta'
}
