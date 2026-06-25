/**
 * Workflow de Consulta Comercial — acionado por *simula / *simular / *simulação.
 *
 * Responsabilidade única: permitir que o comercial obtenha uma resposta rápida
 * do Motor de Crédito via linguagem natural, sem criar nenhum registro de CRM.
 *
 * Princípio: reutiliza exatamente os mesmos componentes do Workflow de Captação.
 *   Parser → Normalizador → Validation Engine → Motor → PDF → WhatsApp
 *
 * O que este workflow NÃO faz:
 *   - Não cria Pessoa
 *   - Não cria Lead
 *   - Não salva Documentos
 *   - Não executa OCR
 *
 * Canais futuros: Portal do Parceiro, Site, API — sem alterações neste arquivo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parsearTextoCaptacao } from './parser-captacao'
import { normalizarDadosCaptacao } from './normalizador-captacao'
import { validarDadosCaptacao } from './validation-engine-captacao'
import { simularTodosBancos, calcularAnalise } from '@/lib/simuladorFinanciamento/engine'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
import type { BancoId, InputFinanciamento, ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import { TODOS_BANCOS } from '@/lib/simuladorFinanciamento/constantes'
import { enviarPDFUazapi } from './uazapi-helpers'

export interface WorkflowConsultaContexto {
  empresa_id: string
  usuario_id: string
  usuario_nome: string
  supabase: SupabaseClient
  instancia_token?: string
  telefone_destino?: string
  telefone_remetente?: string
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// Busca overrides de bancos do banco de dados (mesma lógica do workflow de captação)
async function carregarOverridesBancos(
  supabase: SupabaseClient,
  empresa_id: string,
): Promise<Partial<Record<string, BancoSimOverrides>>> {
  const { data } = await supabase
    .from('bancos')
    .select('simulador_key, taxa_anual, ltv_maximo, seguro_mip, seguro_dfi, taxa_admin')
    .eq('empresa_id', empresa_id)
    .eq('ativo', true)

  if (!data?.length) return {}

  const map: Partial<Record<string, BancoSimOverrides>> = {}
  for (const b of data as any[]) {
    if (!b.simulador_key) continue
    map[b.simulador_key] = {
      taxaAnual:  b.taxa_anual  != null ? b.taxa_anual  / 100 : undefined,
      maxLtv:     b.ltv_maximo  != null ? b.ltv_maximo  / 100 : undefined,
      mipRate:    b.seguro_mip  != null ? b.seguro_mip  / 100 : undefined,
      dfiRate:    b.seguro_dfi  != null ? b.seguro_dfi  / 100 : undefined,
      taxaAdmin:  b.taxa_admin  != null ? b.taxa_admin        : undefined,
    }
  }
  return map
}

export async function executarWorkflowConsulta(
  textoBruto: string,
  ctx: WorkflowConsultaContexto,
): Promise<string> {
  const { empresa_id, usuario_id, usuario_nome, supabase } = ctx

  // ── Etapa 1: Parser ─────────────────────────────────────────────────────
  const raw = await parsearTextoCaptacao(textoBruto)

  // ── Etapa 2: Normalizador ────────────────────────────────────────────────
  const dados = normalizarDadosCaptacao(raw)

  // ── Etapa 3: Validation Engine (modo consulta) ───────────────────────────
  const validacao = validarDadosCaptacao(dados, { modo: 'consulta' })

  if (!validacao.valido) {
    const lista = validacao.camposFaltantes.map((c) => `• ${c}`).join('\n')
    return [
      '⚠️ *Consulta incompleta — dados insuficientes para simular.*',
      '',
      'Faltam as seguintes informações:',
      lista,
      '',
      'Envie novamente com os dados completos.',
    ].join('\n')
  }

  // ── Etapa 4: Bancos ──────────────────────────────────────────────────────
  // Se nenhum banco foi informado, ou se o usuário pediu "todos", usar lista completa
  const bancosIds: BancoId[] =
    dados.todos_bancos || dados.bancos_ids.length === 0
      ? (TODOS_BANCOS as BancoId[])
      : (dados.bancos_ids as BancoId[])

  // ── Etapa 5: Motor de Crédito ────────────────────────────────────────────
  const dbOverrides = await carregarOverridesBancos(supabase, empresa_id)

  // Aplica prazo customizado via overrides (se informado)
  let overrides: Partial<Record<string, BancoSimOverrides>> = { ...dbOverrides }
  if (dados.prazo_meses) {
    for (const id of bancosIds) {
      overrides[id] = { ...(overrides[id] ?? {}), prazoMaximoMeses: dados.prazo_meses }
    }
  }

  const input: InputFinanciamento = {
    valorImovel:     dados.valor_imovel!,
    valorEntrada:    dados.valor_entrada!,
    dataNascimento:  dados.data_nascimento!,
    rendaMensal:     (dados.renda_formal ?? 0) + (dados.renda_informal ?? 0),
    tipoAmortizacao: dados.tipo_amortizacao,
    correntista:     dados.correntista,
    bancosIds,
    nomeCliente:     dados.nome ?? undefined,
    tipoImovel:      dados.tipo_imovel ?? undefined,
    finalidade:      'residencial',
    usaFgts:         dados.usa_fgts || undefined,
  }

  const bancosResult = simularTodosBancos(input, overrides)
  const analise      = calcularAnalise(input, bancosResult)

  const resultado: ResultadoCompleto = {
    input,
    bancos:        bancosResult,
    analise,
    dataSimulacao: new Date().toISOString(),
  }

  // ── Etapa 6: Salvar em simulacoes_central ────────────────────────────────
  const melhor = bancosResult.find((b) => b.elegivel)
  const nomeDisplay = dados.nome?.trim() || 'Cliente não identificado'

  const { error: simErr } = await supabase.from('simulacoes_central').insert({
    empresa_id,
    tipo:           'financiamento',
    status:         'concluida',
    tipo_simulacao: 'consulta',
    origem_canal:   'whatsapp',
    nome_cliente:   nomeDisplay,
    cpf_cliente:    dados.cpf ?? null,
    banco:          melhor?.bancoNome ?? null,
    responsavel_id: usuario_id,
    resultado_json: resultado as unknown as Record<string, unknown>,
    lead_id:        null,
  })

  if (simErr) {
    console.error('[workflow-consulta] Erro ao salvar simulação:', simErr)
  }

  // ── Etapa 7: PDF + WhatsApp ──────────────────────────────────────────────
  const tokenEfetivo   = ctx.instancia_token || process.env.UAZAPI_INSTANCE_TOKEN || ''
  const destinoEfetivo = ctx.telefone_destino || ctx.telefone_remetente || ''

  let linhaPDF = '⚠️ PDF indisponível — resumo acima é válido.'

  if (tokenEfetivo && destinoEfetivo) {
    try {
      const { gerarPDFFinanciamentoBuffer } = await import('@/lib/simuladorFinanciamento/gerarPDFBuffer')
      const pdfBuffer = await gerarPDFFinanciamentoBuffer(resultado, {
        clienteNome:     dados.nome ?? undefined,
        responsavelNome: usuario_nome,
      })
      const nomeArquivo = dados.nome
        ? `Consulta Rápida - ${dados.nome}.pdf`
        : 'Consulta Rápida.pdf'
      await enviarPDFUazapi(destinoEfetivo, pdfBuffer, tokenEfetivo, nomeArquivo)
      linhaPDF = '📎 PDF completo enviado acima.'
    } catch (errPdf) {
      console.error('[workflow-consulta] PDF falhou:', errPdf)
    }
  } else {
    console.warn('[workflow-consulta] PDF pulado — token ou destino ausente')
  }

  // ── Etapa 8: Resposta ────────────────────────────────────────────────────
  const elegiveis   = bancosResult.filter((b) => b.elegivel)
  const inelegiveis = bancosResult.filter((b) => !b.elegivel)

  const listaBancos = elegiveis.length > 0
    ? elegiveis.map((b) => {
        const prog = b.programa !== b.bancoNome ? ` (${b.programa})` : ''
        return `• ${b.bancoNome}${prog} — 1ª ${fmt.format(b.primeiraParcela)} | Última ${fmt.format(b.ultimaParcela)}`
      }).join('\n')
    : '• Nenhum banco elegível com os parâmetros informados'

  const listaInelegiveis = inelegiveis.length > 0
    ? inelegiveis.map((b) => `• ${b.bancoNome} — ${b.motivoInelegivel ?? 'inelegível'}`).join('\n')
    : null

  // Sumário dos parâmetros usados
  const prazoUsado = dados.prazo_meses
    ? `${dados.prazo_meses} meses`
    : 'prazo máximo por banco'

  const linhas: string[] = [
    `📋 *Consulta Rápida — ${nomeDisplay}*`,
    '',
    `📊 *Simulação — ${fmt.format(dados.valor_imovel!)} | Entrada ${fmt.format(dados.valor_entrada!)}*`,
    `Renda: ${fmt.format((dados.renda_formal ?? 0) + (dados.renda_informal ?? 0))} | ${dados.tipo_amortizacao} | ${prazoUsado}`,
    '',
    `🏦 *Bancos Elegíveis:*`,
    listaBancos,
  ]

  if (listaInelegiveis) {
    linhas.push('', `❌ *Inelegíveis:*`, listaInelegiveis)
  }

  linhas.push(
    '',
    linhaPDF,
    '',
    `⚠️ _Esta é uma consulta rápida. Não representa aprovação de crédito. Valores, taxas e prazos estão sujeitos a alteração conforme análise documental e política de crédito do banco._`,
  )

  return linhas.join('\n')
}
