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
  calcularMaxFinanciavel, calcularIdadeEmAnos, calcularIdadeEmMeses, calcularPrazoMaximo, getMipRate, taxaAnualParaMensal,
  LIMITE_IDADE_PRAZO_MESES, resolverLtvEfetivoCaixa,
} from '@/lib/simuladorFinanciamento/engine'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
import type { BancoId, InputFinanciamento, ResultadoBanco, AnalisePredicativa } from '@/lib/simuladorFinanciamento/tipos'
import { TODOS_BANCOS, BANCOS_CONFIG, BANCOS_PRICE, IDADE_JOVEM_ASSUMIDA_ANOS } from '@/lib/simuladorFinanciamento/constantes'

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// ── Validação mínima para acionar o Motor de Crédito ──────────────────────────
// Renda NUNCA bloqueia a simulação — sua ausência é tratada como diagnóstico
// (renda necessária estimada), não como impeditivo.
// Nome não entra aqui: é pré-requisito de quem cria Pessoa/Lead, não do cálculo.

export interface ResultadoValidacaoSimulacao {
  valido: boolean
  camposFaltantes: string[]
  // Bloqueio definitivo (não retomável via pendência) — data implausível/futura ou
  // idade incompatível com o prazo mínimo de financiamento.
  bloqueioIdade?: { motivo: string; idadeCalculada: number | null }
}

// Aceita um subconjunto dos dados normalizados de propósito: este é o único critério de
// prontidão para simular em todo o sistema — usado com o resultado completo do normalizador
// (workflow-consulta/workflow-captacao) e também com dados parcialmente mesclados ao longo
// de uma conversa (fluxo de pendência do *simula / *cria cliente).
export function validarParaSimulacao(
  dados: Partial<Pick<DadosCaptacaoNormalizados, 'data_nascimento' | 'valor_imovel' | 'modo_calculo' | 'prazo_maximo'>>,
): ResultadoValidacaoSimulacao {
  const camposFaltantes: string[] = []

  if (!dados.data_nascimento) {
    // "Prazo máximo" sem nascimento não bloqueia: o Motor assume uma idade compatível
    // com o maior prazo entre os bancos resolvidos (ver executarSimulacao) e avisa na
    // resposta. Sem "prazo máximo", nascimento continua obrigatório como antes.
    if (!dados.prazo_maximo) {
      camposFaltantes.push('Data de nascimento')
    }
  } else {
    const nasc = new Date(dados.data_nascimento)
    const hoje = new Date()
    if (isNaN(nasc.getTime()) || nasc > hoje) {
      return { valido: false, camposFaltantes: [],
        bloqueioIdade: { motivo: 'Data de nascimento inválida ou no futuro.', idadeCalculada: null } }
    }
    // Regra oficial: idade + prazo de financiamento ≤ 80 anos e 6 meses. Cálculo em
    // meses reais (não idadeAnos*12, que perde granularidade de até 11 meses).
    const idadeMeses = calcularIdadeEmMeses(dados.data_nascimento)
    const prazoResidualMeses = LIMITE_IDADE_PRAZO_MESES - idadeMeses
    if (prazoResidualMeses < 12) {
      const idadeAnos = calcularIdadeEmAnos(dados.data_nascimento)
      return { valido: false, camposFaltantes: [],
        bloqueioIdade: { motivo: 'Idade incompatível com o prazo mínimo de financiamento (80 anos e 6 meses no total).', idadeCalculada: idadeAnos } }
    }
  }
  // valor_imovel é opcional apenas quando a pergunta é "quanto essa renda comporta" (sem referência de imóvel)
  if (dados.valor_imovel === null && dados.modo_calculo !== 'VALOR_MAXIMO_PELA_RENDA') {
    camposFaltantes.push('Valor do imóvel')
  }

  return { valido: camposFaltantes.length === 0, camposFaltantes: camposFaltantes }
}

// ── Decisão de intenção de simular ────────────────────────────────────────────
// Separado deliberadamente de validarParaSimulacao: aqui decidimos SE o usuário quer
// simular; validarParaSimulacao só roda depois, para checar se os dados são suficientes.
// Usado pelos 3 pontos de entrada (workflow-captacao, workflow-consulta, resposta a
// pendência) e pelo gatilho de conversa natural — nenhum deles deve reimplementar esta
// regra por conta própria.
export interface DecisaoIntencaoSimulacao {
  deveSimular: boolean
  motivo: 'palavra_chave' | 'dados_completos' | 'forcar_contexto' | 'nenhum'
}

export function deveDispararSimulacao(
  dados: Pick<DadosCaptacaoNormalizados,
    'solicitar_simulacao' | 'valor_imovel' | 'valor_financiado' | 'renda_formal' | 'renda_informal'
    | 'modo_calculo' | 'prazo_maximo'>,
  ctxFlags?: { forcarSimulacao?: boolean },
): DecisaoIntencaoSimulacao {
  if (ctxFlags?.forcarSimulacao) return { deveSimular: true, motivo: 'forcar_contexto' }
  if (dados.solicitar_simulacao) return { deveSimular: true, motivo: 'palavra_chave' }
  if (dados.modo_calculo === 'VALOR_MAXIMO_PELA_RENDA') return { deveSimular: true, motivo: 'palavra_chave' }

  const temImovel = dados.valor_imovel != null
  const temFinanciamentoOuRenda = dados.valor_financiado != null
    || (dados.renda_formal ?? 0) > 0 || (dados.renda_informal ?? 0) > 0

  // "prazo máximo" só conta como intenção quando já vem junto de dados financeiros
  // suficientes — nunca sozinho (regra de negócio explícita).
  if (dados.prazo_maximo && temImovel && temFinanciamentoOuRenda) {
    return { deveSimular: true, motivo: 'palavra_chave' }
  }
  if (temImovel && temFinanciamentoOuRenda) return { deveSimular: true, motivo: 'dados_completos' }

  return { deveSimular: false, motivo: 'nenhum' }
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

export type ModoResultadoSimulacao = 'NORMAL' | 'CAPACIDADE_MAXIMA' | 'COMPARACAO_PRAZOS'

// Um prazo pedido pelo operador, com o resultado por banco naquele prazo.
export interface ItemComparativoPrazo {
  prazoMeses: number
  bancosResult: ResultadoBanco[]
}

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
  // modo COMPARACAO_PRAZOS (múltiplos prazos pedidos na mesma mensagem)
  comparativoPrazos?: ItemComparativoPrazo[]
}

// Renda mensal aproximada necessária para comportar uma parcela dentro do
// comprometimento máximo de 30% (regra usada em toda a composição de resposta).
export function calcularRendaNecessaria(parcela: number): number {
  return Math.ceil(parcela / 0.30)
}

// ── Execução ────────────────────────────────────────────────────────────────────

// Data de nascimento sintética (ISO) para uma idade de exatamente `idadeMeses` hoje.
function dataNascimentoParaIdadeEmMeses(idadeMeses: number): string {
  const hoje = new Date()
  const data = new Date(hoje.getFullYear(), hoje.getMonth() - idadeMeses, hoje.getDate())
  return data.toISOString().slice(0, 10)
}

export async function executarSimulacao(
  dadosEntrada: DadosCaptacaoNormalizados,
  overridesBanco: Partial<Record<string, BancoSimOverrides>>,
): Promise<ResultadoSimulacaoUnificado> {
  const dados = { ...dadosEntrada }
  const bancosIds = resolverBancos(dados)

  // "Prazo máximo" pedido sem data de nascimento: assume uma idade jovem fixa
  // (IDADE_JOVEM_ASSUMIDA_ANOS) em vez da mais velha ainda compatível com o maior prazo
  // entre os bancos. Uma idade jovem nunca trunca prazo de nenhum banco (25 anos + até 35
  // anos de prazo fica bem dentro do limite de 80a6m) e produz parcela/MIP realistas —
  // comparáveis ao simulador oficial — em vez de superestimados por uma idade "pior caso".
  // O aviso "Idade estimada" (idadeEstimada) já comunica ao operador que o valor pode
  // mudar após confirmação da data de nascimento real. Nunca deixa data_nascimento ausente
  // chegar no motor (engine.ts trataria como NaN silenciosamente — ver calcularPrazoMaximo).
  if (!dados.data_nascimento && dados.prazo_maximo) {
    dados.data_nascimento = dataNascimentoParaIdadeEmMeses(IDADE_JOVEM_ASSUMIDA_ANOS * 12)
    dados.idade_assumida_prazo_maximo = true
  }

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
  let financiandoValorMaximo = false
  if (dados.valor_entrada === null && dados.valor_financiado === null && dados.valor_imovel !== null) {
    autoDerivarEntradaFinanciado(dados, bancosIds)
    financiandoValorMaximo = true
  } else if (dados.modo_calculo === 'VALOR_MAXIMO_PELA_RENDA' && dados.valor_imovel !== null) {
    // Financiado/entrada já vieram informados, mas o pedido é pelo máximo — recalcula ignorando-os.
    dados.valor_entrada = null
    dados.valor_financiado = null
    autoDerivarEntradaFinanciado(dados, bancosIds, { ignorarRenda: true })
    financiandoValorMaximo = true
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
    rendaInformada: !semRenda,
    idadeEstimada: dados.usou_idade_aproximada || dados.idade_assumida_prazo_maximo,
    tipoAmortizacao: dados.tipo_amortizacao,
    amortizacaoPorBanco: Object.keys(dados.amortizacao_por_banco).length > 0
      ? dados.amortizacao_por_banco
      : undefined,
    correntista:     dados.correntista,
    bancosIds,
    nomeCliente:     dados.nome ?? undefined,
    cpfCliente:      dados.cpf ?? undefined,
    tipoImovel:      dados.tipo_imovel ?? undefined,
    finalidade:      dados.finalidade_efetiva,
    tipoOperacao:    dados.tipo_operacao,
    valorTerreno:    dados.valor_terreno ?? undefined,
    valorObra:       dados.valor_obra    ?? undefined,
    // Bug real corrigido jul/2026: `dados.usa_fgts || undefined` transformava `false`
    // (cliente sem FGTS, valor determinístico do parser) em `undefined` — e o motor trata
    // `undefined` como "elegível" (`input.usaFgts !== false`), então todo cliente sem FGTS
    // acabava oferecido o Pró-Cotista por engano. `dados.usa_fgts` já é sempre um boolean
    // definitivo (nunca null/undefined), então repassar direto basta.
    usaFgts:         dados.usa_fgts,
    financiandoValorMaximo,
  }

  const bancosResult = simularTodosBancos(input, overrides)
  const analise = calcularAnalise(input, bancosResult)

  const prazoLabel = dados.prazo_meses ? `${dados.prazo_meses} meses` : 'prazo máximo por banco'

  return { modo: 'NORMAL', dados, bancosIds, prazoLabel, rendaMensal, semRenda, input, bancosResult, analise }
}

// Executa o Motor uma vez por prazo pedido (ex.: "5 anos, 10 anos, 15 anos" na mesma
// mensagem) e agrega os resultados por banco em vez de rejeitar o pedido — reaproveita
// integralmente executarSimulacao (derivação de entrada/financiado, overrides, elegibilidade
// por banco) para nenhuma regra de negócio ficar duplicada entre simulação simples e comparativa.
export async function executarSimulacaoComparativaPrazos(
  dadosEntrada: DadosCaptacaoNormalizados,
  prazosMeses: number[],
  overridesBanco: Partial<Record<string, BancoSimOverrides>>,
): Promise<ResultadoSimulacaoUnificado> {
  const comparativoPrazos: ItemComparativoPrazo[] = []
  let ultimoResultado: ResultadoSimulacaoUnificado | null = null

  for (const prazoMeses of prazosMeses) {
    const resultadoPrazo = await executarSimulacao(
      { ...dadosEntrada, prazo_meses: prazoMeses, prazo_maximo: false },
      overridesBanco,
    )
    comparativoPrazos.push({ prazoMeses, bancosResult: resultadoPrazo.bancosResult ?? [] })
    ultimoResultado = resultadoPrazo
  }

  const base = ultimoResultado ?? await executarSimulacao(dadosEntrada, overridesBanco)

  return {
    modo: 'COMPARACAO_PRAZOS',
    dados: base.dados,
    bancosIds: base.bancosIds,
    prazoLabel: `comparação entre ${prazosMeses.length} prazos`,
    rendaMensal: base.rendaMensal,
    semRenda: base.semRenda,
    comparativoPrazos,
  }
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

  // Caixa: usa o LTV do programa que o cliente realmente vai cair (Pró-Cotista/MCMV/SBPE),
  // não o LTV genérico do SBPE (`cfg.maxLtv`) — corrigido jul/2026. Antes, um cliente que
  // acabava caindo no MCMV Classe Média em imóvel usado (teto de 60%, não 80%) recebia uma
  // entrada estimada baixa demais: o PRICE se auto-ajusta depois (`construirCenariosCaixa`,
  // engine.ts), mas o SAC não — então o SAC ficava inelegível/omitido por causa de uma
  // entrada que o próprio Fonti calculou errado, não que o cliente informou. Usa `ltvSac`
  // (o mais restritivo, já que SAC nunca é reajustado) como teto pra este banco.
  const ltvMin = bancosIds.reduce((acc, id) => {
    if (id === 'caixa') {
      const { ltvSac } = resolverLtvEfetivoCaixa({
        valorImovel,
        rendaMensal: rendaTotal,
        rendaInformada: rendaTotal > 0,
        tipoImovel: dados.tipo_imovel ?? undefined,
        usaFgts: dados.usa_fgts,
        tipoOperacao: dados.tipo_operacao,
        finalidade: dados.finalidade_efetiva,
      })
      return Math.min(acc, ltvSac)
    }
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
  if (resultado.modo === 'CAPACIDADE_MAXIMA') return montarRespostaCapacidadeMaxima(resultado, opts)
  if (resultado.modo === 'COMPARACAO_PRAZOS') return montarRespostaComparativaPrazos(resultado)
  return montarRespostaNormal(resultado, opts)
}

function montarRespostaComparativaPrazos(resultado: ResultadoSimulacaoUnificado): string {
  const { dados, comparativoPrazos = [] } = resultado

  const linhas: string[] = [
    `📊 *Comparação de prazos — ${fmt.format(dados.valor_imovel ?? 0)} | Entrada ${fmt.format(dados.valor_entrada ?? 0)}*`,
  ]

  // Reagrupa por banco: cada banco elegível ganha uma seção com uma linha por prazo.
  const bancosNomes = Array.from(new Set(
    comparativoPrazos.flatMap((item) => item.bancosResult.filter((b) => b.elegivel).map((b) => b.bancoNome)),
  ))

  if (bancosNomes.length === 0) {
    linhas.push('', 'Não encontrei banco elegível para os prazos informados.')
    return linhas.join('\n')
  }

  for (const bancoNome of bancosNomes) {
    linhas.push('', `🏦 *${bancoNome}*`)
    for (const item of comparativoPrazos) {
      const b = item.bancosResult.find((r) => r.bancoNome === bancoNome && r.elegivel)
      if (!b) continue
      const rendaNecessaria = calcularRendaNecessaria(b.primeiraParcela)
      linhas.push(`  • ${item.prazoMeses} meses — Parcela ${fmt.format(b.primeiraParcela)} | Renda mín. ${fmt.format(rendaNecessaria)}`)
    }
  }

  return linhas.join('\n')
}

function montarRespostaNormal(
  resultado: ResultadoSimulacaoUnificado,
  opts: { nomeDisplay: string },
): string {
  const { dados, bancosResult = [], semRenda, rendaMensal, prazoLabel } = resultado
  const elegiveis   = bancosResult.filter((b) => b.elegivel)
  const inelegiveis = bancosResult.filter((b) => !b.elegivel)

  // Comparação de Cenários: quantos resultados elegíveis existem por grupo banco+programa
  // — usado só para o aviso "📊 Identifiquei que X permite comparar SAC e PRICE..." abaixo.
  // O rótulo de amortização por linha, por outro lado, é sempre exibido (ver `cenario`
  // logo abaixo): com amortizacaoPorBanco em uso, bancos diferentes podem estar em
  // amortizações diferentes SEM que nenhum deles tenha, sozinho, mais de um resultado —
  // por isso mostrar o rótulo só quando "ambíguo dentro do próprio banco" não bastava.
  const contagemPorGrupo = new Map<string, number>()
  for (const b of elegiveis) {
    const chave = `${b.bancoId}::${b.programa}`
    contagemPorGrupo.set(chave, (contagemPorGrupo.get(chave) ?? 0) + 1)
  }

  const listaBancos = elegiveis.length > 0
    ? elegiveis.map((b) => {
        const prog = b.programa !== b.bancoNome ? ` (${b.programa})` : ''
        let linha = `• ${b.bancoNome}${prog} - ${b.tipoAmortizacao} — 1ª ${fmt.format(b.primeiraParcela)} | Última ${fmt.format(b.ultimaParcela)}`

        if (semRenda) {
          const rendaNecessaria = calcularRendaNecessaria(b.primeiraParcela)
          linha += `\n  _Renda necessária estimada: ~${fmt.format(rendaNecessaria)}/mês_`
        } else if (b.avisoRenda) {
          const rendaNecessaria = calcularRendaNecessaria(b.primeiraParcela)
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
  // Amortização do melhor cenário (resultado vencedor), não o valor global solicitado —
  // pode divergir quando amortizacaoPorBanco está em uso (mesmo ajuste já feito no PDF).
  const amortizacaoCabecalho = elegiveis[0]?.tipoAmortizacao ?? dados.tipo_amortizacao
  // Entrada do melhor cenário, não `dados.valor_entrada` bruto — corrigido jul/2026:
  // desde que "financiando valor máximo" recalcula a entrada por programa e por sistema
  // (cada um com sua própria cota/comprometimento — ver construirCenariosCaixa,
  // engine.ts), o valor genérico deixou de bater com o resultado realmente exibido
  // (mesmo ajuste feito no PDF, gerarPDFBuffer.ts). Sem cenário elegível, mantém o bruto.
  const entradaCabecalho = elegiveis[0]
    ? dados.valor_imovel! - elegiveis[0].valorFinanciado
    : dados.valor_entrada!

  const linhas: string[] = [
    `📊 *Simulação — ${fmt.format(dados.valor_imovel!)} | Entrada ${fmt.format(entradaCabecalho)}*`,
    `${rendaLabel} | ${amortizacaoCabecalho} | ${prazoLabel}`,
  ]

  if (listaBancos) {
    linhas.push('', `🏦 *Bancos:*`, listaBancos)
    if (inelegiveis.length > 0) {
      linhas.push('', `_Os demais bancos não simulam ou não estão parametrizados para este produto._`)
    }
  } else {
    // Nenhum banco elegível — distingue idade (bloqueio já deveria ter ocorrido antes do
    // motor via validarParaSimulacao para casos extremos; aqui cobre idades "no limiar"
    // que passam o guard central mas ficam inelegíveis banco a banco) de renda/LTV
    // (diagnosticável — reaproveita o mesmo cálculo usado quando há avisoRenda acima).
    //
    // `\bidade\b` (limite de palavra), não `.includes('idade')` — corrigido jul/2026: o
    // includes cru dava falso positivo em QUALQUER motivo que mencionasse "modalidade"
    // (ex.: "Não oferece financiamento na modalidade PRICE", de um banco que só não
    // suporta PRICE) — "modalidade" contém "idade" como substring. Isso fazia o Fonti
    // responder "idade do cliente é incompatível" pra um cliente de 39 anos só porque o
    // único banco pedido (ex.: Bradesco) não oferece PRICE, uma mensagem completamente
    // errada e confusa. Achado testando exatamente esse cenário.
    const inelegiveisPorIdade = inelegiveis.filter((b) =>
      /\bidade\b/i.test(b.motivoInelegivel ?? '') ||
      /\bprazo insuficiente\b/i.test(b.motivoInelegivel ?? ''))
    const todosPorIdade = inelegiveis.length > 0 && inelegiveisPorIdade.length === inelegiveis.length

    if (todosPorIdade) {
      linhas.push('', `Não foi possível simular: idade do cliente é incompatível com o prazo mínimo de financiamento em todos os bancos parametrizados.`)
    } else if (dados.valor_imovel && rendaMensal > 0) {
      const bancosIds = resolverBancos(dados)
      const bancoRefId = bancosIds[0]
      const taxaRef = bancoRefId
        ? (dados.correntista ? BANCOS_CONFIG[bancoRefId].taxaAnualCorrentista : BANCOS_CONFIG[bancoRefId].taxaAnualBase)
        : 0.10
      const idadeAnos = calcularIdadeEmAnos(dados.data_nascimento!)
      const mip = getMipRate(idadeAnos)
      const prazoRef = dados.prazo_meses ?? 360
      const capacidadeEstimada = calcularMaxFinanciavel(rendaMensal, dados.valor_imovel, taxaAnualParaMensal(taxaRef), prazoRef, mip)
      linhas.push('',
        '⚠️ *Diagnóstico de capacidade — não representa aprovação.*',
        `Com a renda informada (${fmt.format(rendaMensal)}), a capacidade estimada de financiamento é de até ${fmt.format(capacidadeEstimada)}.`,
        `Para o valor solicitado (${fmt.format(dados.valor_financiado ?? dados.valor_imovel)}), a renda informada é insuficiente conforme política de crédito dos bancos.`)
    } else {
      linhas.push('', `Não encontrei simulação válida para os dados informados. Verifique produto, valor do imóvel, valor financiado, renda, idade e modalidade.`)
    }
  }

  // Aviso de Comparação de Cenários — nomeia o(s) banco(s) que de fato produziram mais de
  // um cenário elegível, em vez de citar "a Caixa" fixo (reaproveita `contagemPorGrupo`).
  const bancosComCenarios = Array.from(new Set(
    elegiveis
      .filter((b) => (contagemPorGrupo.get(`${b.bancoId}::${b.programa}`) ?? 0) >= 2)
      .map((b) => b.bancoNome),
  ))
  if (bancosComCenarios.length > 0) {
    const verbo = bancosComCenarios.length > 1 ? 'permitem' : 'permite'
    linhas.push('', `📊 Identifiquei que ${bancosComCenarios.join(', ')} ${verbo} comparar SAC e PRICE para esta operação. Gerei os cenários no mesmo PDF.`)
  }

  if (semRenda) {
    linhas.push('', `ℹ️ _Renda não informada. Valores de renda necessária são estimativas para comprometimento máximo de 30% (SAC)._`)
  } else if (elegiveis.some((b) => b.avisoRenda)) {
    linhas.push('', `ℹ️ _Os valores acima são diagnóstico de capacidade — não representam aprovação. Para o valor solicitado, a renda informada é insuficiente conforme política de crédito dos bancos._`)
  }

  if (dados.usou_idade_aproximada) {
    linhas.push('', `ℹ️ _Usei a idade informada para calcular. Para maior precisão, envie a data de nascimento completa._`)
  } else if (dados.idade_assumida_prazo_maximo) {
    linhas.push('', `ℹ️ _Esta simulação foi feita considerando que o cliente tem idade compatível para financiar no prazo máximo. Essa idade assumida também afeta o valor do seguro e da parcela. Caso queira uma simulação em prazo diferente, informe o prazo desejado ou a data de nascimento do cliente._`)
  }

  // Nota de modalidade (lote/construção/comercial) — sem isso, o texto do WhatsApp nunca
  // explicava por que só a Caixa aparece elegível nessas modalidades (o PDF já mostra).
  const observacaoModalidade = bancosResult.find((b) => b.observacao)?.observacao
  if (observacaoModalidade) {
    linhas.push('', `ℹ️ _${observacaoModalidade}_`)
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
  } else if (dados.idade_assumida_prazo_maximo) {
    linhas.push('', `ℹ️ _Esta simulação foi feita considerando que o cliente tem idade compatível para financiar no prazo máximo. Essa idade assumida também afeta o valor do seguro e da parcela. Caso queira uma simulação em prazo diferente, informe o prazo desejado ou a data de nascimento do cliente._`)
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

  if (resultado.modo === 'COMPARACAO_PRAZOS') {
    const { gerarPDFComparacaoPrazosBuffer } = await import('@/lib/simuladorFinanciamento/gerarPDFBuffer')
    const { dados, comparativoPrazos = [] } = resultado
    return gerarPDFComparacaoPrazosBuffer({
      clienteNome: dados.nome,
      cpfCliente: opts.tipoVinculo === 'AVULSA_SEM_CPF' ? null : (opts.cpfCliente ?? dados.cpf),
      valorImovel: dados.valor_imovel,
      valorFinanciado: dados.valor_financiado,
      tipoAmortizacao: dados.tipo_amortizacao,
      dataSimulacao: new Date().toISOString(),
      itens: comparativoPrazos.map((item) => ({
        prazoMeses: item.prazoMeses,
        bancos: item.bancosResult
          .filter((b) => b.elegivel)
          .map((b) => ({
            bancoNome: b.bancoNome,
            parcela: b.primeiraParcela,
            taxaAnual: b.taxaAnual,
            rendaMinima: calcularRendaNecessaria(b.primeiraParcela),
          })),
      })),
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

// tipo_simulacao no banco só aceita 'preliminar' | 'revisada' | 'nova' | 'consulta' (ver
// migração 20260625_110) — o modo real (inclusive COMPARACAO_PRAZOS) já fica registrado
// em resultado_json.modo, então aqui mapeamos tudo que não é capacidade máxima para 'consulta'.
export function tipoSimulacaoParaPersistencia(resultado: ResultadoSimulacaoUnificado): 'consulta' | 'capacidade_maxima' {
  return resultado.modo === 'CAPACIDADE_MAXIMA' ? 'capacidade_maxima' : 'consulta'
}
