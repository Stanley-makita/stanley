/**
 * Workflow de Consórcio — acionado por *consorcio / *fonti consorcio.
 *
 * Q&A fixo e determinístico (mesmo padrão do *custas, ver workflow-custas.ts)
 * — 10 perguntas, duas delas (valor da carta, % da parcela reduzida) com
 * sugestão editável e duas delas (tipo de bem, indexador) de escolha numérica
 * (1/2). Ao final, calcula (mesmo motor puro da tela/PDF,
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
  salvarConsorcioPendente, buscarConsorcioPendente, limparConsorcioPendente,
  type ConsorcioPendente, type PassoConsorcio,
} from './consorcio-pendente'
import { parseValorReais } from '@/lib/bot/custas-parsers'
import { parseInteiro, parsePercentual, parseComSugestao, parseIndexadorFixo, parseTipoBem } from '@/lib/bot/consorcio-parsers'

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
      case 'tipo_bem':
        return 'O consórcio é para:\n*1* — Imóvel\n*2* — Auto'
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
      case 'indexador_fixo':
        return 'Indexador:\n*1* — Fixo\n*2* — Variável'
      case 'parcela_reduzida':
        return `Qual o *% da parcela reduzida*?\n💡 Sugestão: ${PCT(SUGESTAO_PARCELA_REDUZIDA)}\nResponda *sim* pra aceitar ou informe outro valor.`
      case 'fundo_reserva':
        return 'Qual o *Fundo de reserva*? (%)'
    }
  })()
  return `${pergunta}\n\n${DICA_SAIR}`
}

export async function iniciarFluxoConsorcio(ctx: WorkflowConsorcioContexto): Promise<string> {
  const pendente: ConsorcioPendente = { passo: 'tipo_bem', dados: {} }
  await salvarConsorcioPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador, pendente)
  return `🏠 *Simulador de Consórcio*\n\n${perguntaDoPasso('tipo_bem', {})}`
}

async function avancarPara(
  passo: PassoConsorcio,
  dados: Partial<InputConsorcio>,
  ctx: WorkflowConsorcioContexto,
  pendenteAnterior?: ConsorcioPendente,
): Promise<string> {
  const gravado = await salvarConsorcioPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador, { passo, dados }, pendenteAnterior)
  if (!gravado) {
    // Perdeu a corrida (ver comentário em salvarConsorcioPendente) — outra invocação já
    // avançou o passo nesse meio-tempo. Resincroniza com o estado real em vez de
    // sobrescrevê-lo ou responder com uma pergunta que não corresponde mais ao passo atual.
    const atual = await buscarConsorcioPendente(ctx.supabase, ctx.empresa_id, ctx.telefone_operador)
    if (atual) return perguntaDoPasso(atual.passo, atual.dados)
  }
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
    tipoBem: dados.tipoBem!,
    indexadorFixo: dados.indexadorFixo!,
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
      // Envio em paralelo, não sequencial — cada enviarPDFUazapi já tem timeout de 30s
      // (ver uazapi-helpers.ts), mas dois `await` em sequência somam até 30s+30s=60s no
      // pior caso, batendo exatamente no teto de duração da Vercel mesmo com o timeout
      // individual funcionando. Em paralelo, o pior caso fica em 30s.
      await Promise.all([
        enviarPDFUazapi(destinoEfetivo, detalhada, tokenEfetivo, 'Proposta de Consórcio Detalhada.pdf'),
        enviarPDFUazapi(destinoEfetivo, resumida, tokenEfetivo, 'Proposta de Consórcio Resumida.pdf'),
      ])
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
    `Valor Líquido: ${BRL.format(resumo.valorLiquido)}`,
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
    case 'tipo_bem': {
      const v = parseTipoBem(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi — responda *1* (Imóvel) ou *2* (Auto).')
      dados.tipoBem = v
      return avancarPara('valor_bem', dados, ctx, pendente)
    }

    case 'valor_bem': {
      const v = parseValorReais(texto)
      if (v == null || v <= 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.valorBem = v
      return avancarPara('valor_carta', dados, ctx, pendente)
    }

    case 'valor_carta': {
      const sugestao = sugestaoValorCarta(dados.valorBem ?? 0)
      const v = parseComSugestao(texto, sugestao, parseValorReais)
      if (v == null || v <= 0) return repetirPergunta(pendente, ctx, 'Não entendi o valor.')
      dados.valorCarta = v
      return avancarPara('mes_contemplacao', dados, ctx, pendente)
    }

    case 'mes_contemplacao': {
      const v = parseInteiro(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o mês.')
      dados.mesLanceContemplacao = v
      return avancarPara('prazo_meses', dados, ctx, pendente)
    }

    case 'prazo_meses': {
      const v = parseInteiro(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o prazo.')
      dados.prazoMeses = v
      return avancarPara('taxa_adm', dados, ctx, pendente)
    }

    case 'taxa_adm': {
      const v = parsePercentual(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o percentual.')
      dados.taxaAdmPercentual = v
      return avancarPara('indice_correcao', dados, ctx, pendente)
    }

    case 'indice_correcao': {
      const v = parsePercentual(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o percentual.')
      dados.indiceCorrecaoAnual = v
      return avancarPara('indexador_fixo', dados, ctx, pendente)
    }

    case 'indexador_fixo': {
      const v = parseIndexadorFixo(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi — responda *1* (Fixo) ou *2* (Variável).')
      dados.indexadorFixo = v
      return avancarPara('parcela_reduzida', dados, ctx, pendente)
    }

    case 'parcela_reduzida': {
      const v = parseComSugestao(texto, SUGESTAO_PARCELA_REDUZIDA, parsePercentual)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o percentual.')
      dados.percentualParcelaReduzida = v
      return avancarPara('fundo_reserva', dados, ctx, pendente)
    }

    case 'fundo_reserva': {
      const v = parsePercentual(texto)
      if (v == null) return repetirPergunta(pendente, ctx, 'Não entendi o percentual.')
      dados.fundoReservaPercentual = v
      return finalizarSimulacao(dados, ctx)
    }
  }
}
