/**
 * Workflow de Consulta Comercial — acionado por *simula / *simular / *simulação.
 *
 * Responsabilidade única: preparar o contexto, delegar validação/cálculo/resposta
 * ao Motor de Simulação, e cuidar do que é específico deste canal (PDF, persistência).
 *
 * Princípio: reutiliza exatamente os mesmos componentes do Workflow de Captação
 * via motor-simulacao.ts — nenhuma regra de simulação vive aqui.
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
import type { DadosCaptacaoNormalizados } from './normalizador-captacao'
import {
  validarParaSimulacao, executarSimulacao, montarRespostaSimulacao,
  gerarPdfSimulacao, tipoSimulacaoParaPersistencia,
} from './motor-simulacao'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
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
  // vem_de_pendente: tipo já foi resolvido no processarRespostaPendente — skip total.
  if (dados.pedir_esclarecimento_operacao && dados.pergunta_esclarecimento && !ctx.vem_de_pendente) {
    if (ctx.telefone_operador) {
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

  // ── Etapa 3: Validação (Motor de Simulação) ──────────────────────────────
  const validacao = validarParaSimulacao(dados)

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

  // ── Etapa 4: Motor de Simulação ──────────────────────────────────────────
  const dbOverrides = await carregarOverridesBancos(supabase, empresa_id)
  const resultado = await executarSimulacao(dados, dbOverrides)

  // ── Etapa 5: Salvar em simulacoes_central ────────────────────────────────
  const nomeDisplay = dados.nome?.trim() || 'Cliente não identificado'
  const melhorBanco = resultado.modo === 'CAPACIDADE_MAXIMA'
    ? (resultado.capacidade ?? []).reduce(
        (best, r) => r.maxFinanciavel > (best?.maxFinanciavel ?? 0) ? r : best,
        null as { bancoNome: string; maxFinanciavel: number } | null,
      )?.bancoNome ?? null
    : (resultado.bancosResult ?? []).find((b) => b.elegivel)?.bancoNome ?? null

  const { data: simData, error: simErr } = await supabase
    .from('simulacoes_central')
    .insert({
      empresa_id,
      tipo:           'financiamento',
      status:         'concluida',
      tipo_simulacao: tipoSimulacaoParaPersistencia(resultado),
      origem_canal:   'whatsapp',
      nome_cliente:   nomeDisplay,
      cpf_cliente:    ctx.tipo_vinculo === 'AVULSA_SEM_CPF' ? null : (dados.cpf ?? null),
      banco:          melhorBanco,
      responsavel_id: usuario_id,
      resultado_json: {
        modo: resultado.modo,
        ...(resultado.modo === 'CAPACIDADE_MAXIMA'
          ? { renda: resultado.rendaMensal, bancos: resultado.capacidade }
          : { input: resultado.input, bancos: resultado.bancosResult, analise: resultado.analise }),
        _input_normalizado: dados as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
      lead_id:        null,
      pdf_status:     'nao_gerado',
    })
    .select('id')
    .single()

  if (simErr) {
    console.error('[workflow-consulta] Erro ao salvar simulação:', simErr)
  }
  const simulacaoId: string | null = simData?.id ?? null

  async function atualizarPdfStatus(
    status: 'enviado' | 'erro' | 'nao_gerado',
    opts?: { erro?: string; enviado_em?: string },
  ) {
    if (!simulacaoId) return
    await supabase.from('simulacoes_central').update({
      pdf_status:      status,
      pdf_erro:        opts?.erro       ?? null,
      pdf_enviado_em:  opts?.enviado_em ?? null,
    }).eq('id', simulacaoId)
  }

  // ── Etapa 6: PDF + WhatsApp ──────────────────────────────────────────────
  const tokenEfetivo   = ctx.instancia_token || process.env.UAZAPI_INSTANCE_TOKEN || ''
  const destinoEfetivo = ctx.telefone_destino || ctx.telefone_remetente || ''

  let linhaPDF = '⚠️ PDF indisponível — resumo acima é válido.'

  if (tokenEfetivo && destinoEfetivo) {
    try {
      const pdfBuffer = await gerarPdfSimulacao(resultado, {
        clienteNome:     dados.nome ?? undefined,
        responsavelNome: usuario_nome,
        cpfCliente:      dados.cpf,
        tipoVinculo:     ctx.tipo_vinculo,
      })
      const hoje = new Date().toISOString().slice(0, 10)
      const nomeBase = dados.nome?.trim() || (resultado.modo === 'CAPACIDADE_MAXIMA' ? 'Capacidade Maxima' : 'Consulta Comercial')
      const prefixoArquivo = resultado.modo === 'CAPACIDADE_MAXIMA' ? 'Capacidade Maxima' : 'Simulacao Preliminar'
      const nomeArquivo = `${prefixoArquivo} - ${nomeBase} - ${hoje}.pdf`
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

  // ── Etapa 7: Resposta ────────────────────────────────────────────────────
  const cabecalho = resultado.modo === 'CAPACIDADE_MAXIMA'
    ? `📋 *Capacidade Máxima — ${nomeDisplay}*`
    : `📋 *Consulta Rápida — ${nomeDisplay}*`

  const corpo = montarRespostaSimulacao(resultado, { nomeDisplay })

  const disclaimer = resultado.modo === 'CAPACIDADE_MAXIMA'
    ? `⚠️ _Estimativa de capacidade pela renda (30% de comprometimento, SAC). Sujeita a análise de crédito, LTV, políticas do banco e avaliação do imóvel._`
    : `⚠️ _Esta é uma consulta rápida. Não representa aprovação de crédito. Valores, taxas e prazos estão sujeitos a alteração conforme análise documental e política de crédito do banco._`

  return [cabecalho, '', corpo, '', linhaPDF, '', disclaimer].join('\n')
}
