/**
 * Workflow de Captação — orquestrador central do Fonti.
 *
 * Responsabilidade única: chamar serviços em sequência.
 * Não contém regras de crédito, de parsing ou de normalização.
 *
 * Fluxo:
 *   Parser → Normalizador → Validation Engine
 *   → Pessoa → Lead → Documentos → Campos do Lead
 *   → [se válido] Motor de Crédito → Histórico → Atualização Lead → PDF → WhatsApp
 *   → Resposta ao comercial
 *
 * Canais que podem acionar este workflow: WhatsApp, Portal (futuro), API (futura).
 * Todos usam os mesmos serviços internos do Fonti.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parsearTextoCaptacao } from './parser-captacao'
import { normalizarDadosCaptacao } from './normalizador-captacao'
import { validarDadosCaptacao } from './validation-engine-captacao'
import { simularTodosBancos, calcularAnalise } from '@/lib/simuladorFinanciamento/engine'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
import type { BancoId, InputFinanciamento, ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import { buscarPessoaPorCpf, buscarPessoaPorTelefone, buscarOuCriarPessoa } from '@/lib/pessoa'
import { obterOrdemTopo } from '@/lib/leads/ordem'

export interface WorkflowCaptacaoContexto {
  empresa_id: string
  usuario_id: string
  usuario_nome: string
  supabase: SupabaseClient
  // Para envio de PDF via WhatsApp
  instancia_token?: string
  telefone_destino?: string
  // Telefone do cliente na conversa (para vincular documentos)
  telefone_cliente?: string
  // Telefone do operador (para lookup de sessão fonti_marcas)
  telefone_remetente?: string
  // Arquivos enviados junto ao comando *cria cliente (na mesma mensagem)
  arquivos?: Array<{ fileUrl: string; fileName: string | null; mimeType: string | null }>
}

type EventoWorkflow =
  | 'workflow_iniciado'
  | 'parser_executado'
  | 'normalizador_executado'
  | 'pessoa_criada'
  | 'pessoa_atualizada'
  | 'lead_criado'
  | 'documentos_busca_iniciada'
  | 'documentos_vinculados'
  | 'documentos_nao_encontrados'
  | 'campos_preenchidos'
  | 'validacao_aprovada'
  | 'validacao_pendente'
  | 'motor_executado'
  | 'simulacao_salva'
  | 'pdf_geracao_iniciada'
  | 'pdf_gerado'
  | 'pdf_envio_iniciado'
  | 'pdf_enviado'
  | 'pdf_erro'
  | 'resposta_enviada'
  | 'erro_workflow'

// Registra cada etapa no lead_historico (não bloqueia em caso de erro)
async function registrarEvento(
  supabase: SupabaseClient,
  lead_id: string,
  empresa_id: string,
  usuario_id: string,
  evento: EventoWorkflow,
  detalhe?: string,
): Promise<void> {
  try {
    await supabase.from('lead_historico').insert({
      lead_id,
      empresa_id,
      usuario_id,
      tipo:      'comentario',
      descricao: detalhe
        ? `[Workflow de Captação] ${evento}: ${detalhe}`
        : `[Workflow de Captação] ${evento}`,
    })
  } catch {
    // Falha no registro não interrompe o fluxo
  }
}

// Salva arquivo enviado junto ao comando diretamente no Storage e em documentos_clientes.
// Espelho de salvarArquivo() em fonti-comandos.ts, adaptado para o contexto do workflow.
async function salvarArquivoWorkflow(
  supabase: SupabaseClient,
  arquivo: { fileUrl: string; fileName: string | null; mimeType: string | null },
  empresa_id: string,
  pessoa_id: string | null,
  lead_id: string,
): Promise<boolean> {
  try {
    const { fileUrl, fileName, mimeType } = arquivo
    const ext = fileName?.split('.').pop()
      ?? (mimeType?.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')
    const storagePath = `${empresa_id}/fonti/${crypto.randomUUID()}.${ext}`
    const nomeOriginal = fileName ?? `arquivo.${ext}`

    const fileRes = await fetch(fileUrl, { signal: AbortSignal.timeout(20000) })
    if (!fileRes.ok) throw new Error(`Download falhou: ${fileRes.status}`)

    const fileBuffer = await fileRes.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('documentos-clientes')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType ?? 'application/octet-stream',
        upsert: false,
      })
    if (uploadError) throw uploadError

    await supabase.from('documentos_clientes').insert({
      empresa_id,
      pessoa_id:     pessoa_id ?? null,
      lead_id,
      nome_original: nomeOriginal,
      mime_type:     mimeType ?? null,
      tamanho_bytes: fileBuffer.byteLength,
      storage_path:  storagePath,
      canal_origem:  'whatsapp',
    })
    return true
  } catch (err) {
    console.error('[workflow-captacao] Erro ao salvar arquivo:', err)
    return false
  }
}

// Busca overrides de bancos do banco de dados (replica lógica do SimuladorFinanciamento.tsx)
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

async function enviarPDFUazapi(
  telefone: string,
  pdfBuffer: Buffer,
  token: string,
  nomeCliente: string,
): Promise<void> {
  const base64 = pdfBuffer.toString('base64')
  const nomeArquivo = `Simulação Preliminar${nomeCliente ? ` - ${nomeCliente}` : ''}.pdf`

  // Normaliza telefone: adiciona DDI 55 para números nacionais (igual ao send/route.ts)
  const telRaw = telefone.replace(/\D/g, '')
  const telEnvio = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  const res = await fetch(`${process.env.UAZAPI_API_URL}/send/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'token': token },
    body: JSON.stringify({
      number:   telEnvio,
      type:     'document',
      file:     `data:application/pdf;base64,${base64}`,
      docName:  nomeArquivo,
      track_source: 'credifon-crm',
    }),
  })

  if (!res.ok) {
    throw new Error(`Uazapi send/media ${res.status}: ${await res.text()}`)
  }
}

export async function executarWorkflowCaptacao(
  textoBruto: string,
  ctx: WorkflowCaptacaoContexto,
): Promise<string> {
  const { empresa_id, usuario_id, usuario_nome, supabase } = ctx

  // ── Etapa 1: Parser ─────────────────────────────────────────────────────
  const raw = await parsearTextoCaptacao(textoBruto)

  // ── Etapa 2: Normalizador ────────────────────────────────────────────────
  const dados = normalizarDadosCaptacao(raw)

  if (!dados.nome) {
    return '❌ Não consegui identificar o nome do cliente no texto.\n\nTente incluir o nome completo.'
  }

  // ── Etapa 3: Pessoa ──────────────────────────────────────────────────────
  let pessoa_id: string | null = null
  let pessoaCriada = false

  // Prioridade 1: CPF extraído
  if (dados.cpf) {
    pessoa_id = await buscarPessoaPorCpf(empresa_id, dados.cpf) ?? null
  }
  // Prioridade 2: Telefone da conversa WhatsApp (cliente identificado)
  if (!pessoa_id && ctx.telefone_cliente) {
    pessoa_id = await buscarPessoaPorTelefone(empresa_id, ctx.telefone_cliente) ?? null
  }
  // Prioridade 3: Telefone extraído do texto
  if (!pessoa_id && dados.telefone) {
    pessoa_id = await buscarPessoaPorTelefone(empresa_id, dados.telefone) ?? null
  }
  // Prioridade 4: Criar nova Pessoa
  const telefoneTemp = dados.telefone ?? ctx.telefone_cliente ?? `0000${Date.now().toString().slice(-9)}`
  if (!pessoa_id) {
    pessoa_id = await buscarOuCriarPessoa(empresa_id, telefoneTemp, dados.nome, dados.cpf ?? undefined)
    pessoaCriada = true
  }

  // Atualiza campos da Pessoa com dados extraídos
  const camposPessoa: Record<string, unknown> = {}
  if (dados.cpf)             camposPessoa.cpf             = dados.cpf
  if (dados.data_nascimento) camposPessoa.data_nascimento = dados.data_nascimento
  if (dados.renda_formal)    camposPessoa.renda_formal    = dados.renda_formal
  if (dados.renda_informal)  camposPessoa.renda_informal  = dados.renda_informal
  if (Object.keys(camposPessoa).length > 0) {
    await supabase.from('pessoas').update(camposPessoa).eq('id', pessoa_id)
  }

  // ── Etapa 4: Lead ────────────────────────────────────────────────────────
  const { data: primeiraFase } = await supabase
    .from('fases')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!primeiraFase) {
    return '❌ Empresa sem fases configuradas. Configure as fases em Configurações.'
  }

  const ordemTopo = await obterOrdemTopo(supabase, empresa_id, primeiraFase.id)

  const { data: novoLead, error: leadErr } = await supabase
    .from('leads')
    .insert({
      empresa_id,
      nome:          dados.nome,
      telefone:      telefoneTemp,
      fase_id:       primeiraFase.id,
      origem:        'whatsapp',
      ordem_kanban:  ordemTopo,
      pessoa_id,
      // Campos de crédito
      valor_imovel:     dados.valor_imovel     ?? null,
      entrada:          dados.valor_entrada     ?? null,
      cidade_imovel:    dados.cidade_imovel     ?? null,
      tipo_imovel:      mapTipoImovelLead(dados.tipo_imovel),
      renda_considerada: dados.renda_formal ?? dados.renda_informal ?? null,
      banco_pretendido:  dados.bancos_ids[0] ?? null,
      status_analise:   'aguardando_documentos',
      observacoes: [
        `Criado via Workflow de Captação por ${usuario_nome}`,
        dados.valor_entrada ? `Entrada: R$ ${dados.valor_entrada.toLocaleString('pt-BR')}` : null,
        dados.renda_informal ? `Renda informal: R$ ${dados.renda_informal.toLocaleString('pt-BR')}` : null,
      ].filter(Boolean).join('\n'),
    })
    .select('id')
    .single()

  if (leadErr || !novoLead) {
    console.error('[workflow-captacao] Erro ao criar lead:', leadErr)
    return '❌ Erro ao criar o Lead. Tente novamente.'
  }

  const lead_id = novoLead.id

  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'lead_criado',
    `Lead ${lead_id} criado para ${dados.nome}`)

  // Salva a mensagem original do comercial como nota
  if (textoBruto.trim()) {
    await supabase.from('lead_historico').insert({
      lead_id,
      empresa_id,
      usuario_id,
      tipo:      'comentario',
      descricao: `Mensagem original do comercial via *fonti:\n\n${textoBruto.trim()}`,
    })
  }

  // Registra telefone do texto em lead_telefones
  if (dados.telefone) {
    await supabase.from('lead_telefones').upsert(
      { lead_id, empresa_id, telefone: dados.telefone, principal: true },
      { onConflict: 'lead_id,telefone' },
    )
  }

  // ── Etapa 5: Documentos ──────────────────────────────────────────────────
  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'documentos_busca_iniciada')

  // Telefone da conversa — base para lookup de sessão e conversa
  const telefoneConversa = ctx.telefone_cliente ?? ctx.telefone_remetente ?? telefoneTemp
  let docsVinculados = 0

  // 5a. Salva arquivos enviados JUNTO AO COMANDO *cria cliente (mesma mensagem)
  let arquivosSalvos = 0
  for (const arq of ctx.arquivos ?? []) {
    const ok = await salvarArquivoWorkflow(supabase, arq, empresa_id, pessoa_id, lead_id)
    if (ok) arquivosSalvos++
  }
  docsVinculados += arquivosSalvos

  // 5b. Vincula docs enviados ANTES do comando na conversa do cliente
  // Verifica sessão *fonti inicio para usar como início da janela de tempo
  let marcaAt: Date | null = null
  if (telefoneConversa) {
    const { data: marca } = await supabase
      .from('fonti_marcas')
      .select('iniciado_at')
      .eq('empresa_id', empresa_id)
      .eq('telefone_conversa', telefoneConversa)
      .maybeSingle()
    if (marca?.iniciado_at) marcaAt = new Date(marca.iniciado_at)
  }

  // Normaliza telefone: tenta lookup com e sem DDI 55 para cobrir variações de armazenamento
  const telDigits = telefoneConversa.replace(/\D/g, '')
  const telAlt = telDigits.startsWith('55') && telDigits.length > 11
    ? telDigits.slice(2) : `55${telDigits}`
  const telVariantes = telAlt === telDigits ? [telDigits] : [telDigits, telAlt]

  const { data: conversa } = await supabase
    .from('conversas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .in('contato_telefone', telVariantes)
    .limit(1)
    .maybeSingle()

  if (conversa?.id) {
    // Janela: desde *fonti inicio (se houver sessão) ou últimos 15 min
    const limite = marcaAt ?? (() => {
      const d = new Date()
      d.setMinutes(d.getMinutes() - 15)
      return d
    })()

    const { data: docs } = await supabase
      .from('documentos_clientes')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('conversa_id', conversa.id)
      .is('lead_id', null)
      .is('deleted_at', null)
      .gte('created_at', limite.toISOString())

    if (docs?.length) {
      await supabase
        .from('documentos_clientes')
        .update({ pessoa_id, lead_id })
        .in('id', docs.map((d) => d.id))
      docsVinculados += docs.length
    }
  }

  if (docsVinculados > 0) {
    const detalhe = arquivosSalvos > 0
      ? `${docsVinculados} documento(s) (${arquivosSalvos} do comando + ${docsVinculados - arquivosSalvos} da conversa)`
      : `${docsVinculados} documento(s) da conversa`
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'documentos_vinculados', detalhe)

    // Limpa sessão *fonti inicio — documentos já coletados
    if (marcaAt && telefoneConversa) {
      await supabase.from('fonti_marcas')
        .delete()
        .eq('empresa_id', empresa_id)
        .eq('telefone_conversa', telefoneConversa)
    }
  } else {
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'documentos_nao_encontrados',
      `Nenhum doc encontrado para ${telefoneConversa}`)
  }

  // ── Etapa 6: Validation Engine ───────────────────────────────────────────
  const validacao = validarDadosCaptacao(dados)

  if (!validacao.valido || !dados.solicitar_simulacao) {
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'validacao_pendente',
      `Campos faltantes: ${validacao.camposFaltantes.join(', ')}`)

    await supabase.from('leads').update({ status_analise: 'aguardando_documentos' }).eq('id', lead_id)

    const linhasDocs = docsVinculados > 0 ? `\n${docsVinculados} documento(s) anexado(s).` : ''
    const aviso = pessoaCriada ? '\n⚠️ Pessoa criada sem CPF validado. Verifique duplicidade.' : ''

    if (!validacao.valido) {
      const lista = validacao.camposFaltantes.map((c) => `• ${c}`).join('\n')
      return `✅ Cliente e Lead criados.${linhasDocs}${aviso}\n\nFaltam os seguintes dados para executar a simulação:\n${lista}\n\nEnvie as informações e rode *simula para continuar.`
    }

    // Dados válidos mas sem pedido de simulação
    const linhas: string[] = [`✅ Lead criado: *${dados.nome}*`]
    if (dados.valor_imovel) linhas.push(`Imóvel: R$ ${dados.valor_imovel.toLocaleString('pt-BR')}`)
    if (docsVinculados > 0) linhas.push(`${docsVinculados} doc(s) vinculado(s)`)
    if (aviso) linhas.push(aviso.trim())
    linhas.push('\nPara simular: envie *simula ou inclua "já simula [bancos]" no próximo comando.')
    return linhas.join('\n')
  }

  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'validacao_aprovada',
    `Bancos: ${dados.bancos_ids.join(', ')}`)

  // ── Etapa 7: Motor de Crédito ─────────────────────────────────────────────
  const overrides = await carregarOverridesBancos(supabase, empresa_id)

  const input: InputFinanciamento = {
    valorImovel:     dados.valor_imovel!,
    valorEntrada:    dados.valor_entrada!,
    dataNascimento:  dados.data_nascimento!,
    rendaMensal:     (dados.renda_formal ?? 0) + (dados.renda_informal ?? 0),
    tipoAmortizacao: 'SAC',
    correntista:     false,
    bancosIds:       dados.bancos_ids as BancoId[],
    nomeCliente:     dados.nome ?? undefined,
    cpfCliente:      dados.cpf ?? undefined,
    tipoImovel:      dados.tipo_imovel ?? undefined,
    finalidade:      'residencial',
  }

  const bancosResult = simularTodosBancos(input, overrides)
  const analise      = calcularAnalise(input, bancosResult)

  const resultado: ResultadoCompleto = {
    input,
    bancos:         bancosResult,
    analise,
    dataSimulacao:  new Date().toISOString(),
  }

  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'motor_executado',
    `${bancosResult.filter((b) => b.elegivel).length} banco(s) elegível(is)`)

  // ── Etapa 8: Histórico ────────────────────────────────────────────────────
  const melhor = bancosResult.find((b) => b.elegivel)

  const { error: simErr } = await supabase.from('simulacoes_central').insert({
    empresa_id,
    tipo:            'financiamento',
    status:          'concluida',
    tipo_simulacao:  'preliminar',
    origem_canal:    'whatsapp',
    nome_cliente:    dados.nome,
    cpf_cliente:     dados.cpf ?? null,
    banco:           melhor?.bancoNome ?? null,
    responsavel_id:  usuario_id,
    resultado_json:  resultado as unknown as Record<string, unknown>,
    lead_id,
  })

  if (simErr) {
    console.error('[workflow-captacao] Erro ao salvar simulação:', simErr)
  } else {
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'simulacao_salva',
      melhor ? `Melhor banco: ${melhor.bancoNome}` : 'Nenhum banco elegível')
  }

  // ── Etapa 9: Atualização do Lead ──────────────────────────────────────────
  const camposLeadPos: Record<string, unknown> = { status_analise: 'em_simulacao' }
  if (melhor) {
    camposLeadPos.banco_pretendido = melhor.bancoNome
  }
  await supabase.from('leads').update(camposLeadPos).eq('id', lead_id)

  // ── Etapa 10: PDF ─────────────────────────────────────────────────────────
  let pdfEnviado = false
  let pdfErroMsg: string | null = null

  // Diagnóstico obrigatório: sempre registra os valores de contexto antes de tentar
  const hasToken  = !!ctx.instancia_token
  const hasDestino = !!ctx.telefone_destino
  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'pdf_geracao_iniciada',
    `token=${hasToken}(${(ctx.instancia_token ?? '').length}c) destino=${ctx.telefone_destino ?? 'nulo'}`)

  if (!hasToken || !hasDestino) {
    pdfErroMsg = !hasToken
      ? 'instancia_token ausente no contexto do workflow'
      : 'telefone_destino ausente no contexto do workflow'
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'pdf_erro', pdfErroMsg)
  } else {
    try {
      const { gerarPDFFinanciamentoBuffer } = await import('@/lib/simuladorFinanciamento/gerarPDFBuffer')
      const pdfBuffer = await gerarPDFFinanciamentoBuffer(resultado, {
        clienteNome:     dados.nome ?? undefined,
        responsavelNome: usuario_nome,
      })

      await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'pdf_gerado')

      await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'pdf_envio_iniciado',
        `Destino: ${ctx.telefone_destino}`)

      await enviarPDFUazapi(ctx.telefone_destino!, pdfBuffer, ctx.instancia_token!, dados.nome ?? '')
      pdfEnviado = true

      await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'pdf_enviado',
        `Enviado para ${ctx.telefone_destino}`)
    } catch (err) {
      pdfErroMsg = err instanceof Error ? err.message : String(err)
      console.error('[workflow-captacao] Erro ao gerar/enviar PDF:', pdfErroMsg)
      await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'pdf_erro', pdfErroMsg)
    }
  }

  // ── Etapa 11: Resposta ────────────────────────────────────────────────────
  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'resposta_enviada')

  const elegiveis = bancosResult.filter((b) => b.elegivel)
  const listaBancos = elegiveis.length > 0
    ? elegiveis.map((b) => `• ${b.bancoNome}${b.programa !== b.bancoNome ? ` (${b.programa})` : ''} — 1ª parcela ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(b.primeiraParcela)}`).join('\n')
    : '• Nenhum banco elegível com os parâmetros informados'

  const linhas: string[] = [
    `✅ Cliente criado com sucesso.`,
    `Lead criado na etapa Captação.`,
    '',
    `Motor de Crédito executado.`,
    `Bancos simulados:\n${listaBancos}`,
  ]

  if (pdfEnviado) {
    linhas.push('\nPDF da simulação em anexo.')
  } else if (pdfErroMsg) {
    linhas.push('\n⚠️ Simulação gerada, mas houve erro ao enviar o PDF. Consulte o histórico do Lead.')
  }

  if (docsVinculados > 0) {
    linhas.push(`\n${docsVinculados} documento(s) anexado(s) ao Lead.`)
  }

  if (pessoaCriada) {
    linhas.push('\n⚠️ Pessoa criada sem CPF validado. Verifique possível duplicidade.')
  }

  linhas.push(
    '',
    '⚠️ Esta simulação é preliminar, gerada com base nas informações fornecidas pelo comercial.',
    'A confirmação depende da análise documental e das políticas vigentes de cada banco.',
  )

  return linhas.join('\n')
}

function mapTipoImovelLead(tipo: 'novo' | 'usado' | null): string | null {
  if (tipo === 'novo') return 'apartamento'   // fallback; campo é tipo (apartamento/casa/etc)
  if (tipo === 'usado') return 'apartamento'  // tipo_imovel do lead é a categoria, não novo/usado
  return null
}
