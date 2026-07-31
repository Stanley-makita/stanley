/**
 * Workflow de Consórcio — acionado por *consorcio / *fonti consorcio.
 *
 * Q&A fixo e determinístico (mesmo padrão do *custas, ver workflow-custas.ts)
 * — 8 perguntas, duas delas (valor da carta, % da parcela reduzida) com
 * sugestão editável. Ao final, calcula (mesmo motor puro da tela/PDF,
 * src/lib/simuladorConsorcio/engine.ts) e envia as duas versões da Versão
 * Proposta (Detalhada + Resumida) via WhatsApp. Nenhuma regra de negócio
 * vive aqui, só orquestração do canal.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { simularConsorcio } from '@/lib/simuladorConsorcio/engine'
import { gerarPropostaConsorcioBuffer } from '@/lib/simuladorConsorcio/gerarPropostaBuffer'
import type { InputConsorcio } from '@/lib/simuladorConsorcio/tipos'
import { enviarPDFUazapi } from './uazapi-helpers'
import {
  salvarConsorcioPendente, limparConsorcioPendente,
  type ConsorcioPendente, type PassoConsorcio,
} from './consorcio-pendente'
import { parseValorReais } from '@/lib/bot/custas-parsers'
import { parseInteiro, parsePercentual, parseComSugestao } from '@/lib/bot/consorcio-parsers'

export interface WorkflowConsorcioContexto {
  empresa_id: string
  usuario_id: string
  usuario_nome: string
  supabase: SupabaseClient
  instancia_token?: string
  telefone_destino?: string
  telefone_operador: string
}

// Defaults não perguntados no fluxo do bot — mesmos valores padrão da tela
// (FORM_CONSORCIO_VAZIO em PainelConsorcio.tsx). Nenhum deles aparece nos
// PDFs da Versão Proposta (conferido em gerarProposta.ts/gerarPropostaBuffer.ts
// — a Detalhada não tem box de comparação de patrimônio, só a tela tem).
const DEFAULT_VALOR_DISPONIVEL_LIQUIDO = 0
const DEFAULT_PERCENTUAL_LANCE = 0.40
const DEFAULT_PERCENTUAL_LANCE_EMBUTIDO = 0.30
const DEFAULT_RENDIMENTO_MENSAL = 0.01
const DEFAULT_VALORIZACAO_BEM_ANUAL = 0.06
const SUGESTAO_PARCELA_REDUZIDA = 0.70

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${(v * 100).toFixed(2)}%`

function sugestaoValorCarta(valorBem: number): number {
  return valorBem / (1 - DEFAULT_PERCENTUAL_LANCE_EMBUTIDO)
}

// Rodapé fixo em toda pergunta — dá pro usuário uma saída visível em
// qualquer etapa, sem precisar lembrar a palavra certa ou reiniciar o
// WhatsApp; ver checagem de "sair" no topo de processarRespostaConsorcio.
const DICA_SAIR = '_Digite *sair* para cancelar e recomeçar._'

function perguntaDoPasso(passo: PassoConsorcio, dados: Partial<InputConsorcio>): string {
  const pergunta = (() => {
    switch (passo) {
      case 'valor_bem':
        return 'Qual o *valor do bem*? (R$)'
      case 'valor_carta': {
        const sugestao = sugestaoValorCarta(dados.valorBem ?? 0)
        return `Qual o *valor da carta*? (R$)\n💡 Sugestão: ${BRL.format(sugestao)}\nResponda *sim* pra aceitar ou informe outro valor.`
      }
      case 'mes_contemplacao':
        return 'Em qual *mês* você pretende dar o lance/contemplação?'
      case 'prazo_meses':
        return 'Qual o *prazo em meses* do consórcio?'
      case 'taxa_adm':
        return 'Qual a *Taxa de Adm*? (%)'
      case 'indice_correcao':
        return 'Qual o *Índice de correção* anual? (%)'
      case 'parcela_reduzida':
        return `Qual o *% da parcela reduzida*?\n💡 Sugestão: ${PCT(SUGESTAO_PARCELA_REDUZIDA)}\nResponda *sim* pra aceitar ou informe outro valor.`
      case 'fundo_reserva':
        return 'Qual o *Fundo de reserva*? (%)'
    }
  })()
  return `${pergunta}\n\n${DICA_SAIR}`
}

export async function iniciarFluxoConsorcio(ctx: WorkflowConsorcioContexto): Promise<string> {
  const pendente: ConsorcioPendente = { passo: 'valor_bem', dados: {} }
  await salvarConsorcioPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador, pendente)
  return `🏠 *Simulador de Consórcio*\n\n${perguntaDoPasso('valor_bem', {})}`
}

async function avancarPara(
  passo: PassoConsorcio,
  dados: Partial<InputConsorcio>,
  ctx: WorkflowConsorcioContexto,
): Promise<string> {
  await salvarConsorcioPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador, { passo, dados })
  return perguntaDoPasso(passo, dados)
}

async function repetirPergunta(
  pendente: ConsorcioPendente,
  ctx: WorkflowConsorcioContexto,
  aviso: string,
): Promise<string> {
  await salvarConsorcioPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador, pendente)
  return `❓ ${aviso}\n\n${perguntaDoPasso(pendente.passo, pendente.dados)}`
}

async function finalizarSimulacao(
  dados: Partial<InputConsorcio>,
  ctx: WorkflowConsorcioContexto,
): Promise<string> {
  const input: InputConsorcio = {
    valorDisponivelLiquido: DEFAULT_VALOR_DISPONIVEL_LIQUIDO,
    valorBem: dados.valorBem!,
    valorCarta: dados.valorCarta!,
    mesLanceContemplacao: dados.mesLanceContemplacao!,
    percentualLance: DEFAULT_PERCENTUAL_LANCE,
    rendimentoMensal: DEFAULT_RENDIMENTO_MENSAL,
    percentualLanceEmbutido: DEFAULT_PERCENTUAL_LANCE_EMBUTIDO,
    prazoMeses: dados.prazoMeses!,
    taxaAdmPercentual: dados.taxaAdmPercentual!,
    indiceCorrecaoAnual: dados.indiceCorrecaoAnual!,
    valorizacaoBemAnual: DEFAULT_VALORIZACAO_BEM_ANUAL,
    percentualParcelaReduzida: dados.percentualParcelaReduzida!,
    fundoReservaPercentual: dados.fundoReservaPercentual!,
    aluguelAtivo: false,
  }

  const resultado = simularConsorcio(input)

  await limparConsorcioPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador)

  const tokenEfetivo = ctx.instancia_token || process.env.UAZAPI_INSTANCE_TOKEN || ''
  const destinoEfetivo = ctx.telefone_destino || ctx.telefone_operador

  let linhaPDF = '⚠️ PDFs indisponíveis — resumo acima é válido.'
  if (tokenEfetivo && destinoEfetivo) {
    try {
      const [detalhada, resumida] = await Promise.all([
        gerarPropostaConsorcioBuffer(resultado, 'detalhada'),
        gerarPropostaConsorcioBuffer(resultado, 'resumida'),
      ])
      await enviarPDFUazapi(destinoEfetivo, detalhada, tokenEfetivo, 'Proposta de Consórcio Detalhada.pdf')
      await enviarPDFUazapi(destinoEfetivo, resumida, tokenEfetivo, 'Proposta de Consórcio Resumida.pdf')
      linhaPDF = '📎 Propostas (Detalhada + Resumida) enviadas acima.'
    } catch (err) {
      console.error('[workflow-consorcio] PDF falhou:', err instanceof Error ? err.message : err)
    }
  } else {
    console.warn('[workflow-consorcio] PDF pulado — token ou destino ausente')
  }

  const { error: simErr } = await ctx.supabase
    .from('simulacoes_central')
    .insert({
      empresa_id: ctx.empresa_id,
      tipo: 'consorcio',
      status: 'concluida',
      banco: 'Itaú',
      responsavel_id: ctx.usuario_id,
      resultado_json: resultado as unknown as Record<string, unknown>,
    })
  if (simErr) console.error('[workflow-consorcio] Erro ao salvar simulação:', simErr)

  const { resumo, comparativo } = resultado
  const corpo = [
    '📋 *Simulação de Consórcio*',
    '',
    `Valor do lance: ${BRL.format(resumo.valorDoLance)}`,
    `Lance embutido: ${BRL.format(resumo.lanceEmbutido)}`,
    `Lance próprio: ${BRL.format(resumo.lanceProprio)}`,
    `Saldo Líquido: ${BRL.format(resumo.saldoLiquido)}`,
    `CET a.a: ${PCT(comparativo.cetAnual)}`,
    '',
    linhaPDF,
    '',
    '⚠️ _Esta simulação é baseada nas informações fornecidas e nas condições vigentes na data da proposta. Sujeita à análise de crédito e aprovação da administradora._',
  ].join('\n')

  return corpo
}

export async function processarRespostaConsorcio(
  texto: string,
  pendente: ConsorcioPendente,
  ctx: WorkflowConsorcioContexto,
): Promise<string> {
  const dados = { ...pendente.dados }
  const textoLower = texto.toLowerCase().trim()

  if (/^(cancela|cancelar|desisti|encerra|sair)/.test(textoLower)) {
    await limparConsorcioPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador)
    return 'Simulação de consórcio cancelada. Quando quiser iniciar novamente, envie *consorcio.'
  }

  switch (pendente.passo) {
    case 'valor_bem': {
      const v = parseValorReais(texto)
      if (v == null || v <= 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.valorBem = v
      return avancarPara('valor_carta', dados, ctx)
    }

    case 'valor_carta': {
      const sugestao = sugestaoValorCarta(dados.valorBem ?? 0)
      const v = parseComSugestao(texto, sugestao, parseValorReais)
      if (v == null || v <= 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.valorCarta = v
      return avancarPara('mes_contemplacao', dados, ctx)
    }

    case 'mes_contemplacao': {
      const v = parseInteiro(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o mês.')
      dados.mesLanceContemplacao = v
      return avancarPara('prazo_meses', dados, ctx)
    }

    case 'prazo_meses': {
      const v = parseInteiro(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o prazo.')
      dados.prazoMeses = v
      return avancarPara('taxa_adm', dados, ctx)
    }

    case 'taxa_adm': {
      const v = parsePercentual(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o percentual.')
      dados.taxaAdmPercentual = v
      return avancarPara('indice_correcao', dados, ctx)
    }

    case 'indice_correcao': {
      const v = parsePercentual(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o percentual.')
      dados.indiceCorrecaoAnual = v
      return avancarPara('parcela_reduzida', dados, ctx)
    }

    case 'parcela_reduzida': {
      const v = parseComSugestao(texto, SUGESTAO_PARCELA_REDUZIDA, parsePercentual)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o percentual.')
      dados.percentualParcelaReduzida = v
      return avancarPara('fundo_reserva', dados, ctx)
    }

    case 'fundo_reserva': {
      const v = parsePercentual(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o percentual.')
      dados.fundoReservaPercentual = v
      return finalizarSimulacao(dados, ctx)
    }
  }
}
