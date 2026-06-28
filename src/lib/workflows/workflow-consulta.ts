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
import { normalizarPedidoSimulacao } from './normalizador-captacao'
import { validarDadosCaptacao } from './validation-engine-captacao'
import {
  simularTodosBancos, calcularAnalise,
  calcularMaxFinanciavel, calcularIdadeEmAnos, calcularPrazoMaximo, getMipRate, taxaAnualParaMensal,
} from '@/lib/simuladorFinanciamento/engine'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
import type { BancoId, InputFinanciamento, ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import { TODOS_BANCOS, BANCOS_CONFIG, BANCOS_PRICE } from '@/lib/simuladorFinanciamento/constantes'
import type { DadosCaptacaoNormalizados } from './normalizador-captacao'
import { enviarPDFUazapi } from './uazapi-helpers'

export interface WorkflowConsultaContexto {
  empresa_id: string
  usuario_id: string
  usuario_nome: string
  supabase: SupabaseClient
  instancia_token?: string
  telefone_destino?: string
  telefone_remetente?: string
  /** Simulação avulsa sem CPF — não vincula a cliente existente */
  tipo_vinculo?: 'AVULSA_SEM_CPF'
  // Workflow pendente: telefone do operador para salvar/limpar pendência
  telefone_operador?: string
  // true quando re-chamado a partir de resolução de pendência — pula criação de nova pendência
  vem_de_pendente?: boolean
  // Dados já normalizados de pendência anterior — mescla sobre a saída do parser
  dados_pre_normalizados?: Partial<DadosCaptacaoNormalizados>
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

  // ── Etapas 1+2: Parser → Normalizador (pipeline único compartilhado) ───────
  let dados = await normalizarPedidoSimulacao(textoBruto)

  // Mescla dados pré-normalizados de workflow pendente (campos já capturados).
  if (ctx.dados_pre_normalizados) {
    const { mergeCapturados } = await import('./simula-pendente')
    const merged = mergeCapturados(ctx.dados_pre_normalizados, dados)
    dados = { ...dados, ...merged } as typeof dados
  }

  // ── Etapa 2.2: Pedir esclarecimento de modalidade ───────────────────────────
  // Deve vir ANTES do bloqueio de produto para que "quero construir" pergunte a modalidade
  // em vez de cair no "produto não habilitado" por ter produto_normalizado='CONSTRUCAO'.
  if (dados.pedir_esclarecimento_operacao && dados.pergunta_esclarecimento) {
    if (!ctx.vem_de_pendente && ctx.telefone_operador) {
      const { salvarSimulaPendente } = await import('./simula-pendente')
      await salvarSimulaPendente(supabase, empresa_id, ctx.telefone_operador, {
        motivo: 'esclarecer_tipo_construcao',
        dadosCapturados: dados,
        usouConsulta: true,
      })
    }
    return dados.pergunta_esclarecimento
  }

  // ── Etapa 2.1: Produto não habilitado no motor ──────────────────────────────
  // Construção via Caixa (construcao_terreno_proprio / terreno_mais_construcao) agora é suportada.
  const PRODUTOS_BLOQUEADOS: Array<typeof dados.produto_normalizado> = [
    'CGI_HOME_EQUITY', 'CONSORCIO', 'PORTABILIDADE',
  ]
  const ehConstrucaoSuportada = dados.tipo_operacao === 'construcao_terreno_proprio' || dados.tipo_operacao === 'terreno_mais_construcao'
  if (PRODUTOS_BLOQUEADOS.includes(dados.produto_normalizado) ||
      (dados.produto_normalizado === 'CONSTRUCAO' && !ehConstrucaoSuportada)) {
    return 'A simulação automática desse produto ainda não está habilitada. Envie os dados pelo comando *cria cliente para que o comercial responsável analise no lead.'
  }

  // ── Etapa 2.5: Detectar conflito de prazos ──────────────────────────────────
  // Se vierem múltiplos prazos (ex: "120 240 360 e prazo máximo"), rejeitar antes de simular
  const prazosNum = dados.prazos_detectados ?? []
  if (prazosNum.length > 1 || (prazosNum.length >= 1 && dados.prazo_maximo)) {
    const labels = [
      ...prazosNum.map((p) => `${p} meses`),
      ...(dados.prazo_maximo ? ['prazo máximo'] : []),
    ]
    return [
      `⚠️ Identifiquei mais de um prazo: ${labels.join(', ')}.`,
      `Para manter a simulação objetiva, envie apenas um prazo ou use futuramente o modo comparar prazos.`,
    ].join(' ')
  }

  // ── Etapa 2.6: Conflito de valores (imóvel ≠ entrada + financiado) ──────────
  if (dados.conflito_valores) {
    return [
      '⚠️ *Há divergência entre os valores informados.*',
      '',
      dados.conflito_valores_descricao ?? '',
      '',
      'Confirme os dados corretos para simular:',
      '• Valor do imóvel',
      '• Entrada (ou percentual)',
      '• Valor a financiar',
    ].join('\n')
  }

  // ── Etapa 3: Validation Engine (modo consulta) ───────────────────────────
  const validacao = validarDadosCaptacao(dados, { modo: 'consulta' })

  if (!validacao.valido) {
    const lista = validacao.camposFaltantes.map((c) => `• ${c}`).join('\n')
    if (!ctx.vem_de_pendente && ctx.telefone_operador) {
      const { salvarSimulaPendente } = await import('./simula-pendente')
      await salvarSimulaPendente(supabase, empresa_id, ctx.telefone_operador, {
        motivo: 'completar_dados_simulacao',
        dadosCapturados: dados,
        usouConsulta: true,
      })
    }
    return [
      '⚠️ *Consulta incompleta — dados insuficientes para simular.*',
      '',
      'Faltam as seguintes informações:',
      lista,
      '',
      'Responda com os dados faltantes para continuar.',
    ].join('\n')
  }

  // ── Etapa 4: Bancos ──────────────────────────────────────────────────────
  // Se nenhum banco foi informado, ou se o usuário pediu "todos", usar lista completa
  let bancosIds: BancoId[] =
    dados.todos_bancos || dados.bancos_ids.length === 0
      ? (TODOS_BANCOS as BancoId[])
      : (dados.bancos_ids as BancoId[])

  // PRICE sem banco específico → usar apenas bancos habilitados para PRICE
  if (dados.tipo_amortizacao === 'PRICE' && (dados.todos_bancos || dados.bancos_ids.length === 0)) {
    bancosIds = BANCOS_PRICE as BancoId[]
  }

  // ── Etapa 5: Motor de Crédito ────────────────────────────────────────────
  const dbOverrides = await carregarOverridesBancos(supabase, empresa_id)

  // ── Modo VALOR_MAXIMO_PELA_RENDA — desvio para cálculo de capacidade ─────
  if (dados.modo_calculo === 'VALOR_MAXIMO_PELA_RENDA') {
    return await responderCapacidadeMaxima(dados, bancosIds, dbOverrides, ctx, usuario_id, usuario_nome, supabase)
  }

  // ── Auto-deriva entrada quando apenas imóvel informado ─────────────────────
  // Regra: valor_financiado = min(LTV máximo por banco, capacidade máxima pela renda)
  if (dados.valor_entrada === null && dados.valor_financiado === null && dados.valor_imovel !== null) {
    const rendaTotal = (dados.renda_formal ?? 0) + (dados.renda_informal ?? 0)
    const idadeCalc  = calcularIdadeEmAnos(dados.data_nascimento!)
    const mipCalc    = getMipRate(idadeCalc)
    const prazoCalc  = dados.prazo_meses ?? 360

    // LTV conservador: mínimo entre os bancos solicitados
    const ltvMin = bancosIds.reduce((acc, id) => {
      const cfg = BANCOS_CONFIG[id]
      return Math.min(acc, dados.correntista ? cfg.maxLtvCorrentista : cfg.maxLtv)
    }, 0.80)

    // Taxa do primeiro banco como referência para estimativa de capacidade
    const bancoRef = bancosIds[0]
    const taxaRef  = bancoRef
      ? (dados.correntista ? BANCOS_CONFIG[bancoRef].taxaAnualCorrentista : BANCOS_CONFIG[bancoRef].taxaAnualBase)
      : 0.10
    const maxByRenda = rendaTotal > 0
      ? calcularMaxFinanciavel(rendaTotal, dados.valor_imovel, taxaAnualParaMensal(taxaRef), prazoCalc, mipCalc)
      : dados.valor_imovel
    const maxByLtv = Math.round(dados.valor_imovel * ltvMin)

    dados.valor_financiado = Math.max(0, Math.min(maxByRenda, maxByLtv, dados.valor_imovel))
    dados.valor_entrada    = dados.valor_imovel - dados.valor_financiado
  }

  // Aplica prazo customizado via overrides (se informado e não for "prazo máximo")
  let overrides: Partial<Record<string, BancoSimOverrides>> = { ...dbOverrides }
  if (dados.prazo_meses && !dados.prazo_maximo) {
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
    finalidade:      dados.finalidade_efetiva,
    tipoOperacao:    dados.tipo_operacao,
    valorTerreno:    dados.valor_terreno ?? undefined,
    valorObra:       dados.valor_obra    ?? undefined,
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

  const { data: simData, error: simErr } = await supabase
    .from('simulacoes_central')
    .insert({
      empresa_id,
      tipo:           'financiamento',
      status:         'concluida',
      tipo_simulacao: 'consulta',
      origem_canal:   'whatsapp',
      nome_cliente:   nomeDisplay,
      cpf_cliente:    ctx.tipo_vinculo === 'AVULSA_SEM_CPF' ? null : (dados.cpf ?? null),
      banco:          melhor?.bancoNome ?? null,
      responsavel_id: usuario_id,
      resultado_json: {
        ...(resultado as unknown as Record<string, unknown>),
        _input_normalizado: dados as unknown as Record<string, unknown>,
      },
      lead_id:        null,
      pdf_status:     'nao_gerado',
    })
    .select('id')
    .single()

  if (simErr) {
    console.error('[workflow-consulta] Erro ao salvar simulação:', simErr)
  }

  const simulacaoId: string | null = simData?.id ?? null

  // Helper para atualizar o pdf_status no registro salvo
  async function atualizarPdfStatus(
    status: 'enviado' | 'erro' | 'nao_gerado',
    opts?: { erro?: string; enviado_em?: string },
  ) {
    if (!simulacaoId) return
    await supabase.from('simulacoes_central').update({
      pdf_status:      status,
      pdf_erro:        opts?.erro        ?? null,
      pdf_enviado_em:  opts?.enviado_em  ?? null,
    }).eq('id', simulacaoId)
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
      const hoje = new Date().toISOString().slice(0, 10)
      const nomeBase = dados.nome?.trim() || 'Consulta Comercial'
      const nomeArquivo = `Simulacao Preliminar - ${nomeBase} - ${hoje}.pdf`
      await enviarPDFUazapi(destinoEfetivo, pdfBuffer, tokenEfetivo, nomeArquivo)
      await atualizarPdfStatus('enviado', { enviado_em: new Date().toISOString() })
      linhaPDF = '📎 PDF completo enviado acima.'
    } catch (errPdf) {
      const msg = errPdf instanceof Error ? errPdf.message : String(errPdf)
      console.error('[workflow-consulta] PDF falhou:', msg)
      await atualizarPdfStatus('erro', { erro: msg })
    }
  } else {
    console.warn('[workflow-consulta] PDF pulado — token ou destino ausente')
    await atualizarPdfStatus('nao_gerado')
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

  if (dados.usou_idade_aproximada) {
    linhas.push('', `ℹ️ _Usei a idade informada para calcular. Para maior precisão, envie a data de nascimento completa._`)
  }

  linhas.push(
    '',
    linhaPDF,
    '',
    `⚠️ _Esta é uma consulta rápida. Não representa aprovação de crédito. Valores, taxas e prazos estão sujeitos a alteração conforme análise documental e política de crédito do banco._`,
  )

  return linhas.join('\n')
}

// ── Capacidade Máxima de Financiamento pela Renda ─────────────────────────────

async function responderCapacidadeMaxima(
  dados: DadosCaptacaoNormalizados,
  bancosIds: BancoId[],
  dbOverrides: Partial<Record<string, BancoSimOverrides>>,
  ctx: WorkflowConsultaContexto,
  usuario_id: string,
  usuario_nome: string,
  supabase: SupabaseClient,
): Promise<string> {
  const rendaMensal = (dados.renda_formal ?? 0) + (dados.renda_informal ?? 0)
  const idadeAnos = calcularIdadeEmAnos(dados.data_nascimento!)
  const mip = getMipRate(idadeAnos)

  interface ItemCapacidade {
    bancoId: BancoId
    bancoNome: string
    maxFinanciavel: number
    entradaMinima: number | null
    prazoUsado: number
    taxaAnual: number
  }

  const resultados: ItemCapacidade[] = bancosIds
    .map((bancoId): ItemCapacidade | null => {
      const cfg = BANCOS_CONFIG[bancoId]
      const override = dbOverrides[bancoId] as BancoSimOverrides | undefined

      const taxaAnual = override?.taxaAnual
        ?? (dados.correntista ? cfg.taxaAnualCorrentista : cfg.taxaAnualBase)
      const taxaMensal = taxaAnualParaMensal(taxaAnual)

      const prazoBase = override?.prazoMaximoMeses ?? cfg.prazoMaximoMeses
      // prazo_maximo=true → usa prazo máximo do banco (respeitando idade)
      const prazoReq = dados.prazo_maximo ? prazoBase : (dados.prazo_meses ?? prazoBase)
      const prazoEfetivo = calcularPrazoMaximo(dados.data_nascimento!, prazoReq)

      if (prazoEfetivo < 12) return null  // mutuário próximo dos 80 anos

      // Referência para cálculo: valor do imóvel ou teto genérico de 5 M
      const valorRef = dados.valor_imovel ?? 5_000_000
      const maxByIncome = calcularMaxFinanciavel(rendaMensal, valorRef, taxaMensal, prazoEfetivo, mip)

      // Aplica restrição LTV (se imóvel informado)
      const maxLtv = dados.correntista ? cfg.maxLtvCorrentista : cfg.maxLtv
      const maxByLtv = dados.valor_imovel ? Math.round(dados.valor_imovel * maxLtv) : Infinity
      const maxFinal = Math.max(0, Math.min(maxByIncome, maxByLtv))

      return {
        bancoId,
        bancoNome: cfg.nome,
        maxFinanciavel: maxFinal,
        entradaMinima: dados.valor_imovel ? Math.max(0, dados.valor_imovel - maxFinal) : null,
        prazoUsado:    prazoEfetivo,
        taxaAnual,
      }
    })
    .filter((r): r is ItemCapacidade => r !== null)

  // Salva no histórico (resultado_json simplificado)
  const nomeDisplay = dados.nome?.trim() || 'Cliente não identificado'
  const melhorCapacidade = resultados.reduce(
    (best, r) => r.maxFinanciavel > (best?.maxFinanciavel ?? 0) ? r : best,
    null as ItemCapacidade | null,
  )

  const { data: simDataCap } = await supabase.from('simulacoes_central').insert({
    empresa_id:     ctx.empresa_id,
    tipo:           'financiamento',
    status:         'concluida',
    tipo_simulacao: 'capacidade_maxima',
    origem_canal:   'whatsapp',
    nome_cliente:   nomeDisplay,
    cpf_cliente:    ctx.tipo_vinculo === 'AVULSA_SEM_CPF' ? null : (dados.cpf ?? null),
    banco:          melhorCapacidade?.bancoNome ?? null,
    responsavel_id: usuario_id,
    resultado_json: {
      modo: 'VALOR_MAXIMO_PELA_RENDA', renda: rendaMensal, bancos: resultados,
      _input_normalizado: dados as unknown as Record<string, unknown>,
    } as unknown as Record<string, unknown>,
    lead_id:        null,
    pdf_status:     'nao_gerado',
  }).select('id').single()
  const simulacaoIdCap: string | null = simDataCap?.id ?? null

  // ── PDF + WhatsApp (capacidade máxima) ──────────────────────────────────────
  const tokenCapPDF   = ctx.instancia_token || process.env.UAZAPI_INSTANCE_TOKEN || ''
  const destinoCapPDF = ctx.telefone_destino || ctx.telefone_remetente || ''
  let linhaPDFCap = '⚠️ PDF indisponível — resumo acima é válido.'

  const prazoLabelCap = dados.prazo_maximo
    ? 'prazo maximo por banco'
    : dados.prazo_meses
      ? `${dados.prazo_meses} meses`
      : 'prazo maximo por banco'

  if (tokenCapPDF && destinoCapPDF) {
    try {
      const { gerarPDFCapacidadeMaximaBuffer } = await import('@/lib/simuladorFinanciamento/gerarPDFBuffer')
      const pdfBuffer = await gerarPDFCapacidadeMaximaBuffer({
        rendaMensal,
        idadeAnos,
        tipoAmortizacao: dados.tipo_amortizacao,
        prazoLabel:      prazoLabelCap,
        nomeCliente:     dados.nome,
        cpfCliente:      ctx.tipo_vinculo === 'AVULSA_SEM_CPF' ? null : dados.cpf,
        valorImovelRef:  dados.valor_imovel,
        cidadeImovel:    dados.cidade_imovel,
        tipoImovel:      dados.tipo_imovel,
        dataSimulacao:   new Date().toISOString(),
        tipoVinculo:     ctx.tipo_vinculo,
        bancos:          resultados,
      }, { responsavelNome: usuario_nome })
      const hoje = new Date().toISOString().slice(0, 10)
      const nome = dados.nome?.trim() || 'Capacidade Maxima'
      await enviarPDFUazapi(destinoCapPDF, pdfBuffer, tokenCapPDF, `Capacidade Maxima - ${nome} - ${hoje}.pdf`)
      if (simulacaoIdCap) {
        await supabase.from('simulacoes_central').update({
          pdf_status: 'enviado', pdf_enviado_em: new Date().toISOString(),
        }).eq('id', simulacaoIdCap)
      }
      linhaPDFCap = '📎 PDF completo enviado acima.'
    } catch (errPdf) {
      const msg = errPdf instanceof Error ? errPdf.message : String(errPdf)
      console.error('[workflow-consulta] PDF capacidade falhou:', msg)
      if (simulacaoIdCap) {
        await supabase.from('simulacoes_central').update({
          pdf_status: 'erro', pdf_erro: msg,
        }).eq('id', simulacaoIdCap)
      }
    }
  } else {
    console.warn('[workflow-consulta] PDF capacidade pulado — token ou destino ausente')
  }

  // Monta resposta
  const prazoLabel = dados.prazo_maximo
    ? 'prazo máximo por banco'
    : dados.prazo_meses
      ? `${dados.prazo_meses} meses`
      : 'prazo máximo por banco'

  const linhas: string[] = [
    `📋 *Capacidade Máxima — ${nomeDisplay}*`,
    '',
    `📊 *Parâmetros:*`,
    `Renda: ${fmt.format(rendaMensal)} | ${dados.tipo_amortizacao} | ${prazoLabel}`,
  ]

  if (dados.valor_imovel) {
    linhas.push(`Imóvel de referência: ${fmt.format(dados.valor_imovel)}`)
  }

  linhas.push('', `🏦 *Financiamento máximo suportado pela renda:*`)

  if (resultados.length === 0) {
    linhas.push('• Nenhum banco disponível (idade máxima ou prazo insuficiente)')
  } else {
    for (const r of resultados) {
      if (r.maxFinanciavel <= 0) {
        linhas.push(`• ${r.bancoNome} — Renda insuficiente para este banco`)
        continue
      }
      const entradaStr = r.entradaMinima !== null
        ? ` | Entrada mín. ${fmt.format(r.entradaMinima)}`
        : ''
      const taxaStr = (r.taxaAnual * 100).toFixed(2).replace('.', ',')
      linhas.push(
        `• ${r.bancoNome} — até ${fmt.format(r.maxFinanciavel)}${entradaStr} | ${r.prazoUsado} m | ${taxaStr}% a.a.`,
      )
    }
  }

  if (dados.usou_idade_aproximada) {
    linhas.push('', `ℹ️ _Usei a idade informada para calcular. Para maior precisão, envie a data de nascimento completa._`)
  }

  linhas.push(
    '',
    linhaPDFCap,
    '',
    `⚠️ _Estimativa de capacidade pela renda (30% de comprometimento, SAC). Sujeita a análise de crédito, LTV, políticas do banco e avaliação do imóvel._`,
  )

  return linhas.join('\n')
}
