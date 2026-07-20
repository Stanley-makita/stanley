/**
 * Workflow de Custas — acionado por *custas / *fonti custas.
 *
 * Q&A fixo e determinístico (ao contrário do *simula, que usa parsing livre
 * via LLM): cada pergunta é conhecida de antemão, então o fluxo só avança
 * um passo por vez, valida a resposta com um parser dedicado e, na última
 * pergunta (banco), calcula, gera o PDF e envia via WhatsApp.
 *
 * Reaproveita o motor de cálculo puro (src/lib/simulador/calcular.ts) e o
 * gerador de PDF server-side (src/lib/simulador/gerarPDFBuffer.ts) — nenhuma
 * regra de negócio vive aqui, só orquestração do canal WhatsApp.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularCustas } from '@/lib/simulador/calcular'
import { gerarPDFCustasBuffer } from '@/lib/simulador/gerarPDFBuffer'
import { enviarPDFUazapi } from './uazapi-helpers'
import {
  salvarCustasPendente, limparCustasPendente,
  type CustasPendente, type PassoCustas,
} from './custas-pendente'
import { parseSimNao, parseMenuOpcao, parseValorReais, parseValorOuZero } from '@/lib/bot/custas-parsers'
import type {
  EntradaSimulador, Modalidade, Produto, TipoImovel,
  SimuladorItbiConfig, SimuladorCustasConfig,
} from '@/types/simulador'

export interface WorkflowCustasContexto {
  empresa_id: string
  usuario_id: string
  usuario_nome: string
  supabase: SupabaseClient
  instancia_token?: string
  telefone_destino?: string
  telefone_operador: string
}

const TIPO_IMOVEL_OPCOES: { valor: TipoImovel; label: string }[] = [
  { valor: 'Residencial', label: 'Residencial' },
  { valor: 'Comercial', label: 'Comercial' },
]

const MODALIDADE_OPCOES: { valor: Modalidade; label: string }[] = [
  { valor: 'aquisicao_pronto', label: 'Aquisição imóvel pronto' },
  { valor: 'terreno_construcao', label: 'Terreno e construção' },
  { valor: 'aquisicao_terreno', label: 'Aquisição de terreno' },
  { valor: 'cgi', label: 'CGI' },
  { valor: 'construcao_proprio', label: 'Construção em terreno próprio' },
]

const PRODUTO_OPCOES: { valor: Produto; label: string }[] = [
  { valor: 'PMCMV', label: 'MCMV' },
  { valor: 'SBPE', label: 'SBPE' },
  { valor: 'Pro_Cotista', label: 'Pró-Cotista' },
]

const BANCO_OPCOES = ['Caixa Econômica Federal', 'Itaú', 'Santander', 'Bradesco', 'Banco do Brasil']

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function menu(opcoes: string[]): string {
  return opcoes.map((o, i) => `${i + 1} - ${o}`).join('\n')
}

function perguntaDoPasso(passo: PassoCustas): string {
  switch (passo) {
    case 'tipo_imovel':
      return `Qual o *tipo de imóvel*?\n${menu(TIPO_IMOVEL_OPCOES.map((o) => o.label))}`
    case 'cidade':
      return 'Qual a *cidade do imóvel*?'
    case 'valor_cv':
      return 'Qual o *valor de compra e venda*? (R$)'
    case 'valor_financiado':
      return 'Qual o *valor financiado*? (R$)'
    case 'modalidade':
      return `Qual a *modalidade*?\n${menu(MODALIDADE_OPCOES.map((o) => o.label))}`
    case 'valor_terreno':
      return 'Informe o *valor do terreno*: (R$)'
    case 'servico_registro':
      return 'Qual o valor do *serviço de registro*? (R$, ou 0 se não houver)'
    case 'valor_certidoes':
      return 'Qual o *valor das certidões*? (R$, ou 0 se não houver)'
    case 'contrato_particular':
      return 'Qual o valor do *contrato particular*? (R$, ou 0 se não houver)'
    case 'primeira_aquisicao':
      return 'É *1ª aquisição*? (sim/não)'
    case 'isento_funrejus':
      return 'É *isento de FunRejus*? (sim/não)'
    case 'produto':
      return `Qual o *produto*?\n${menu(PRODUTO_OPCOES.map((o) => o.label))}`
    case 'banco':
      return `Qual o *banco*?\n${menu(BANCO_OPCOES)}`
  }
}

export async function iniciarFluxoCustas(ctx: WorkflowCustasContexto): Promise<string> {
  const pendente: CustasPendente = { passo: 'tipo_imovel', dados: {} }
  await salvarCustasPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador, pendente)
  return `🧮 *Simulador de Custas*\n\n${perguntaDoPasso('tipo_imovel')}`
}

async function avancarPara(
  passo: PassoCustas,
  dados: Partial<EntradaSimulador>,
  ctx: WorkflowCustasContexto,
  prefixo?: string,
): Promise<string> {
  await salvarCustasPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador, { passo, dados })
  const pergunta = perguntaDoPasso(passo)
  return prefixo ? `${prefixo}\n\n${pergunta}` : pergunta
}

async function repetirPergunta(
  pendente: CustasPendente,
  ctx: WorkflowCustasContexto,
  aviso: string,
): Promise<string> {
  await salvarCustasPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador, pendente)
  return `❓ ${aviso}\n\n${perguntaDoPasso(pendente.passo)}`
}

// Busca config de ITBI/tarifas da empresa — mesmo padrão de carregarOverridesBancos
// (workflow-consulta.ts), só que lendo as tabelas do simulador de custas.
async function carregarConfigCustas(
  supabase: SupabaseClient,
  empresa_id: string,
  cidade: string,
  banco: string,
  tipoImovel: TipoImovel,
): Promise<{ itbi?: SimuladorItbiConfig; custas?: SimuladorCustasConfig }> {
  function normCity(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  }

  const { data: itbiRows } = await supabase
    .from('simulador_itbi_config')
    .select('*')
    .eq('empresa_id', empresa_id)
    .eq('ativo', true)

  const itbiRow = (itbiRows ?? []).find((r: any) => normCity(r.municipio) === normCity(cidade))
  const itbi: SimuladorItbiConfig | undefined = itbiRow ? {
    municipio: itbiRow.municipio,
    aliquota: Number(itbiRow.aliquota),
    temDesconto: itbiRow.tem_desconto,
    aliquotaDesconto: itbiRow.aliquota_desconto ? Number(itbiRow.aliquota_desconto) : undefined,
    limiteDesconto: itbiRow.limite_desconto ? Number(itbiRow.limite_desconto) : undefined,
    formulaComDesconto: (itbiRow.formula_com_desconto as 'percentual' | 'composta' | null) ?? 'percentual',
    aliquotaDescontoFinanciado: itbiRow.aliquota_desconto_financiado ? Number(itbiRow.aliquota_desconto_financiado) : undefined,
    excecaoPrimeiraAquisicao: itbiRow.excecao_primeira_aquisicao ?? false,
  } : undefined

  const tipoNorm = tipoImovel === 'Comercial' ? 'comercial' : 'residencial'
  const { data: custasRows } = await supabase
    .from('simulador_custas_config')
    .select('id, banco_nome, tipo, valor')
    .eq('empresa_id', empresa_id)
    .eq('ativo', true)
    .eq('tipo', tipoNorm)

  const custasRow = (custasRows ?? []).find((r: any) => r.banco_nome.toLowerCase() === banco.toLowerCase())
  const custas: SimuladorCustasConfig | undefined = custasRow ? {
    id: custasRow.id,
    bancoNome: custasRow.banco_nome,
    tipo: custasRow.tipo,
    valor: Number(custasRow.valor ?? 0),
  } : undefined

  return { itbi, custas }
}

async function finalizarSimulacao(
  dados: Partial<EntradaSimulador>,
  ctx: WorkflowCustasContexto,
): Promise<string> {
  const entrada: EntradaSimulador = {
    tipoImovel: dados.tipoImovel!,
    cidade: dados.cidade!,
    valorCV: dados.valorCV!,
    valorFinanciado: dados.valorFinanciado!,
    valorTerreno: dados.valorTerreno ?? 0,
    servicoRegistro: dados.servicoRegistro ?? 0,
    valorCertidoes: dados.valorCertidoes ?? 0,
    contratoParticular: dados.contratoParticular ?? 0,
    primeiraAquisicao: dados.primeiraAquisicao ?? 'perguntar',
    isentoFunRejus: dados.isentoFunRejus ?? 'perguntar',
    banco: dados.banco!,
    modalidade: dados.modalidade!,
    produto: dados.produto!,
    iof: 0,
    iofVisivel: false,
  }

  const { itbi, custas } = await carregarConfigCustas(
    ctx.supabase, ctx.empresa_id, entrada.cidade, entrada.banco, entrada.tipoImovel,
  )

  const resultado = calcularCustas(entrada, itbi, custas)

  await limparCustasPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador)

  const tokenEfetivo = ctx.instancia_token || process.env.UAZAPI_INSTANCE_TOKEN || ''
  const destinoEfetivo = ctx.telefone_destino || ctx.telefone_operador

  let linhaPDF = '⚠️ PDF indisponível — resumo acima é válido.'
  if (tokenEfetivo && destinoEfetivo) {
    try {
      const pdfBuffer = await gerarPDFCustasBuffer(resultado, {
        responsavelNome: ctx.usuario_nome,
        valorAssessoria: entrada.servicoRegistro,
        valorContratoServico: entrada.contratoParticular,
      })
      const hoje = new Date().toISOString().slice(0, 10)
      await enviarPDFUazapi(destinoEfetivo, pdfBuffer, tokenEfetivo, `Estimativa de Custas - ${hoje}.pdf`)
      linhaPDF = '📎 PDF completo enviado acima.'
    } catch (err) {
      console.error('[workflow-custas] PDF falhou:', err instanceof Error ? err.message : err)
    }
  } else {
    console.warn('[workflow-custas] PDF pulado — token ou destino ausente')
  }

  const { error: simErr } = await ctx.supabase
    .from('simulacoes_central')
    .insert({
      empresa_id: ctx.empresa_id,
      tipo: 'custas',
      status: 'concluida',
      banco: entrada.banco,
      responsavel_id: ctx.usuario_id,
      resultado_json: resultado as unknown as Record<string, unknown>,
    })
  if (simErr) console.error('[workflow-custas] Erro ao salvar simulação:', simErr)

  const corpo = [
    `📋 *Estimativa de Custas — ${entrada.cidade}*`,
    '',
    `Total sem desconto: ${BRL.format(resultado.totalSemDesconto)} (${resultado.percentualSemDesconto.toFixed(1)}%)`,
    `Total com desconto: ${BRL.format(resultado.totalComDesconto)} (${resultado.percentualComDesconto.toFixed(1)}%)`,
    '',
    linhaPDF,
    '',
    '⚠️ _Estimativa de custas de contratação. Valores sujeitos a alteração conforme política das instituições e órgãos competentes na data da assinatura._',
  ].join('\n')

  return corpo
}

export async function processarRespostaCustas(
  texto: string,
  pendente: CustasPendente,
  ctx: WorkflowCustasContexto,
): Promise<string> {
  const dados = { ...pendente.dados }
  const textoLower = texto.toLowerCase().trim()

  if (/^(cancela|cancelar|desisti|encerra)/.test(textoLower)) {
    await limparCustasPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador)
    return 'Simulação de custas cancelada. Quando quiser iniciar novamente, envie *custas.'
  }

  switch (pendente.passo) {
    case 'tipo_imovel': {
      const idx = parseMenuOpcao(texto, TIPO_IMOVEL_OPCOES.map((o) => o.label))
      if (idx === null) return repetirPergunta(pendente, ctx, 'Não entendi a opção.')
      dados.tipoImovel = TIPO_IMOVEL_OPCOES[idx].valor
      return avancarPara('cidade', dados, ctx)
    }

    case 'cidade': {
      const cidade = texto.trim()
      if (!cidade) return repetirPergunta(pendente, ctx, 'Informe o nome da cidade.')
      dados.cidade = cidade
      return avancarPara('valor_cv', dados, ctx)
    }

    case 'valor_cv': {
      const v = parseValorReais(texto)
      if (v == null || v <= 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.valorCV = v
      return avancarPara('valor_financiado', dados, ctx)
    }

    case 'valor_financiado': {
      const v = parseValorOuZero(texto)
      if (v == null || v < 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.valorFinanciado = v
      const recursosProprios = Math.max(0, (dados.valorCV ?? 0) - v)
      return avancarPara(
        'modalidade', dados, ctx,
        `💰 Recursos próprios (calculado): ${BRL.format(recursosProprios)}`,
      )
    }

    case 'modalidade': {
      const idx = parseMenuOpcao(texto, MODALIDADE_OPCOES.map((o) => o.label))
      if (idx === null) return repetirPergunta(pendente, ctx, 'Não entendi a opção.')
      dados.modalidade = MODALIDADE_OPCOES[idx].valor
      if (dados.modalidade === 'terreno_construcao') {
        return avancarPara('valor_terreno', dados, ctx)
      }
      dados.valorTerreno = 0
      return avancarPara('servico_registro', dados, ctx)
    }

    case 'valor_terreno': {
      const v = parseValorReais(texto)
      if (v == null || v <= 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.valorTerreno = v
      return avancarPara('servico_registro', dados, ctx)
    }

    case 'servico_registro': {
      const v = parseValorOuZero(texto)
      if (v == null || v < 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.servicoRegistro = v
      return avancarPara('valor_certidoes', dados, ctx)
    }

    case 'valor_certidoes': {
      const v = parseValorOuZero(texto)
      if (v == null || v < 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.valorCertidoes = v
      return avancarPara('contrato_particular', dados, ctx)
    }

    case 'contrato_particular': {
      const v = parseValorOuZero(texto)
      if (v == null || v < 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.contratoParticular = v
      return avancarPara('primeira_aquisicao', dados, ctx)
    }

    case 'primeira_aquisicao': {
      const r = parseSimNao(texto)
      if (r === null) return repetirPergunta(pendente, ctx, 'Responda *sim* ou *não*.')
      dados.primeiraAquisicao = r
      return avancarPara('isento_funrejus', dados, ctx)
    }

    case 'isento_funrejus': {
      const r = parseSimNao(texto)
      if (r === null) return repetirPergunta(pendente, ctx, 'Responda *sim* ou *não*.')
      dados.isentoFunRejus = r
      return avancarPara('produto', dados, ctx)
    }

    case 'produto': {
      const idx = parseMenuOpcao(texto, PRODUTO_OPCOES.map((o) => o.label))
      if (idx === null) return repetirPergunta(pendente, ctx, 'Não entendi a opção.')
      dados.produto = PRODUTO_OPCOES[idx].valor
      return avancarPara('banco', dados, ctx)
    }

    case 'banco': {
      const idx = parseMenuOpcao(texto, BANCO_OPCOES)
      if (idx === null) return repetirPergunta(pendente, ctx, 'Não entendi a opção.')
      dados.banco = BANCO_OPCOES[idx]
      return finalizarSimulacao(dados, ctx)
    }
  }
}
