/**
 * Workflow de Captação — orquestrador central do Fonti.
 *
 * Responsabilidade única: chamar serviços em sequência.
 * Não contém regras de crédito, de parsing ou de normalização.
 *
 * Fluxo:
 *   Parser → Normalizador → [mescla dados_base] → Validation Engine
 *   → Pessoa → Lead (upsert: atualiza se aberto, cria se novo) → Documentos
 *   → [se válido] Motor de Crédito → Histórico → Atualização Lead → PDF → WhatsApp
 *   → Resposta ao comercial
 *
 * Canais que podem acionar este workflow: WhatsApp, Portal (futuro), API (futura).
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
import { enviarPDFUazapi as _enviarPDFUazapiShared } from './uazapi-helpers'

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
  // Contexto de lead existente — passado pelo *simula quando há lead aberto
  lead_id_existente?: string
  pessoa_id_existente?: string
  dados_base?: {
    nome?: string | null
    cpf?: string | null
    data_nascimento?: string | null
    valor_imovel?: number | null
    valor_entrada?: number | null
    renda_formal?: number | null
    renda_informal?: number | null
  }
  // Forçar simulação mesmo que solicitar_simulacao venha false (acionado pelo *simula)
  forcar_simulacao?: boolean
}

type EventoWorkflow =
  | 'workflow_iniciado'
  | 'parser_executado'
  | 'normalizador_executado'
  | 'pessoa_criada'
  | 'pessoa_atualizada'
  | 'lead_criado'
  | 'workflow_complementado'
  | 'dados_complementados'
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

// Registra eventos técnicos como 'workflow_log' — não aparecem no histórico comercial da interface.
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
      tipo: 'workflow_log' as any,
      descricao: detalhe
        ? `[Workflow de Captação] ${evento}: ${detalhe}`
        : `[Workflow de Captação] ${evento}`,
    })
  } catch {
    // Falha no registro não interrompe o fluxo
  }
}

// Busca o lead aberto mais recente de uma pessoa (exclui apenas status finais).
async function buscarLeadAbertoPorPessoa(
  supabase: SupabaseClient,
  empresa_id: string,
  pessoa_id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('pessoa_id', pessoa_id)
    .is('deleted_at', null)
    .not('status_analise', 'in', '(aprovado,reprovado,convertido_em_processo,concluido,cancelado)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// Salva arquivo enviado junto ao comando diretamente no Storage e em documentos_clientes.
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
  const hoje = new Date().toISOString().slice(0, 10)
  const nomeArquivo = `Simulacao Preliminar - ${nomeCliente || 'Cliente'} - ${hoje}.pdf`
  return _enviarPDFUazapiShared(telefone, pdfBuffer, token, nomeArquivo)
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export async function executarWorkflowCaptacao(
  textoBruto: string,
  ctx: WorkflowCaptacaoContexto,
): Promise<string> {
  const { empresa_id, usuario_id, usuario_nome, supabase } = ctx

  // ── Etapa 1: Parser ─────────────────────────────────────────────────────
  const raw = await parsearTextoCaptacao(textoBruto)

  // ── Etapa 2: Normalizador ────────────────────────────────────────────────
  const dados = normalizarDadosCaptacao(raw)

  // Mescla dados do lead existente (contexto do *simula com lead aberto).
  // Preenche apenas campos nulos — dados novos do texto têm prioridade.
  if (ctx.dados_base) {
    const b = ctx.dados_base
    if (!dados.nome)            dados.nome            = b.nome            ?? null
    if (!dados.cpf)             dados.cpf             = b.cpf             ?? null
    if (!dados.data_nascimento) dados.data_nascimento = b.data_nascimento ?? null
    if (!dados.valor_imovel)    dados.valor_imovel    = b.valor_imovel    ?? null
    if (!dados.valor_entrada)   dados.valor_entrada   = b.valor_entrada   ?? null
    if (!dados.renda_formal)    dados.renda_formal    = b.renda_formal    ?? null
    if (!dados.renda_informal)  dados.renda_informal  = b.renda_informal  ?? null
  }
  if (ctx.forcar_simulacao) dados.solicitar_simulacao = true

  if (!dados.nome) {
    return '❌ Não consegui identificar o nome do cliente no texto.\n\nTente incluir o nome completo.'
  }

  // ── Etapa 3: Pessoa ──────────────────────────────────────────────────────
  let pessoa_id: string | null = ctx.pessoa_id_existente ?? null
  let pessoaCriada = false

  const telefoneTemp = dados.telefone ?? ctx.telefone_cliente ?? `0000${Date.now().toString().slice(-9)}`

  if (!pessoa_id) {
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
    if (!pessoa_id) {
      pessoa_id = await buscarOuCriarPessoa(empresa_id, telefoneTemp, dados.nome, dados.cpf ?? undefined)
      pessoaCriada = true
    }
  }

  // Atualiza campos da Pessoa com dados extraídos (sempre, novo ou existente)
  const camposPessoa: Record<string, unknown> = {}
  if (dados.cpf)             camposPessoa.cpf             = dados.cpf
  if (dados.data_nascimento) camposPessoa.data_nascimento = dados.data_nascimento
  if (dados.renda_formal)    camposPessoa.renda_formal    = dados.renda_formal
  if (dados.renda_informal)  camposPessoa.renda_informal  = dados.renda_informal
  if (Object.keys(camposPessoa).length > 0 && pessoa_id) {
    await supabase.from('pessoas').update(camposPessoa).eq('id', pessoa_id)
  }

  // ── Etapa 4: Lead (upsert) ───────────────────────────────────────────────
  let lead_id: string
  let leadAtualizado = false
  const camposAtualizados: string[] = []

  if (ctx.lead_id_existente) {
    // A. Contexto explícito do *simula — usar lead diretamente
    lead_id = ctx.lead_id_existente
    leadAtualizado = true
  } else {
    // B. Buscar lead aberto por pessoa_id
    const leadExistente = pessoa_id
      ? await buscarLeadAbertoPorPessoa(supabase, empresa_id, pessoa_id)
      : null

    if (leadExistente) {
      lead_id = leadExistente
      leadAtualizado = true
    } else {
      // C. Criar novo lead
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
          nome:             dados.nome,
          telefone:         telefoneTemp,
          fase_id:          primeiraFase.id,
          origem:           'whatsapp',
          ordem_kanban:     ordemTopo,
          pessoa_id,
          valor_imovel:     dados.valor_imovel     ?? null,
          entrada:          dados.valor_entrada     ?? null,
          cidade_imovel:    dados.cidade_imovel     ?? null,
          tipo_imovel:      mapTipoImovelLead(dados.tipo_imovel),
          renda_considerada: dados.renda_formal ?? dados.renda_informal ?? null,
          banco_pretendido:  dados.bancos_ids[0] ?? null,
          status_analise:   'aguardando_documentos',
          observacoes: [
            `Criado via Workflow de Captação por ${usuario_nome}`,
            dados.valor_entrada   ? `Entrada: R$ ${dados.valor_entrada.toLocaleString('pt-BR')}`  : null,
            dados.renda_informal  ? `Renda informal: R$ ${dados.renda_informal.toLocaleString('pt-BR')}` : null,
          ].filter(Boolean).join('\n'),
        })
        .select('id')
        .single()

      if (leadErr || !novoLead) {
        console.error('[workflow-captacao] Erro ao criar lead:', leadErr)
        return '❌ Erro ao criar o Lead. Tente novamente.'
      }

      lead_id = novoLead.id
      await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'lead_criado',
        `Lead ${lead_id} criado para ${dados.nome}`)

      if (dados.telefone) {
        await supabase.from('lead_telefones').upsert(
          { lead_id, empresa_id, telefone: dados.telefone, principal: true },
          { onConflict: 'lead_id,telefone' },
        )
      }
    }
  }

  // Quando atualizando: aplica apenas campos que chegaram com valor (não sobrescreve com null)
  if (leadAtualizado) {
    const camposLead: Record<string, unknown> = {}
    if (dados.valor_imovel)   { camposLead.valor_imovel    = dados.valor_imovel;  camposAtualizados.push('imóvel') }
    if (dados.valor_entrada)  { camposLead.entrada          = dados.valor_entrada; camposAtualizados.push('entrada') }
    if (dados.cidade_imovel)  { camposLead.cidade_imovel   = dados.cidade_imovel }
    if (dados.tipo_imovel)    { camposLead.tipo_imovel     = mapTipoImovelLead(dados.tipo_imovel) }
    const rendaNova = dados.renda_formal ?? dados.renda_informal
    if (rendaNova)            { camposLead.renda_considerada = rendaNova;          camposAtualizados.push('renda') }
    if (dados.bancos_ids[0])  { camposLead.banco_pretendido = dados.bancos_ids[0]; camposAtualizados.push('bancos') }

    if (Object.keys(camposLead).length > 0) {
      await supabase.from('leads').update(camposLead).eq('id', lead_id)
    }

    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'dados_complementados',
      camposAtualizados.length > 0 ? `Campos: ${camposAtualizados.join(', ')}` : 'Complemento sem novos campos')

    if (dados.telefone) {
      await supabase.from('lead_telefones').upsert(
        { lead_id, empresa_id, telefone: dados.telefone, principal: false },
        { onConflict: 'lead_id,telefone' },
      )
    }
  }

  // Mensagem original do comercial — sempre salva, novo ou atualizado
  if (textoBruto.trim()) {
    await supabase.from('lead_historico').insert({
      lead_id,
      empresa_id,
      usuario_id,
      tipo:      'comentario',
      descricao: `Mensagem original do comercial via *fonti:\n\n${textoBruto.trim()}`,
    })
  }

  // ── Etapa 5: Documentos ──────────────────────────────────────────────────
  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'documentos_busca_iniciada')

  const telefoneConversa = ctx.telefone_cliente ?? ctx.telefone_remetente ?? telefoneTemp
  let docsVinculados = 0

  // 5a. Salva arquivos enviados junto ao comando
  let arquivosSalvos = 0
  for (const arq of ctx.arquivos ?? []) {
    const ok = await salvarArquivoWorkflow(supabase, arq, empresa_id, pessoa_id, lead_id)
    if (ok) arquivosSalvos++
  }
  docsVinculados += arquivosSalvos

  // 5b. Vincula docs enviados antes do comando na conversa do cliente
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

  // Resumo comercial legível — salvo sempre após a validação (conhecemos as pendências)
  const linhasResumo: string[] = [
    `Lead ${leadAtualizado ? 'atualizado' : 'criado'} via WhatsApp por ${usuario_nome}.`,
  ]
  if (dados.valor_imovel)    linhasResumo.push(`Imóvel: ${fmt.format(dados.valor_imovel)}`)
  if (dados.valor_entrada)   linhasResumo.push(`Entrada: ${fmt.format(dados.valor_entrada)}`)
  if (dados.valor_financiado) linhasResumo.push(`Financiamento: ${fmt.format(dados.valor_financiado)}`)
  if (dados.data_nascimento) linhasResumo.push(`Nascimento: ${dados.data_nascimento}`)
  linhasResumo.push(`CPF: ${dados.cpf ? 'informado' : 'não informado'}`)
  if (docsVinculados > 0)    linhasResumo.push(`Documentos anexados: ${docsVinculados}`)
  if (!validacao.valido && validacao.camposFaltantes.length > 0) {
    linhasResumo.push(`Pendências: ${validacao.camposFaltantes.join(', ')}`)
  }
  await supabase.from('lead_historico').insert({
    lead_id, empresa_id, usuario_id,
    tipo:      'comentario',
    descricao: linhasResumo.join('\n'),
  })

  if (!validacao.valido || !dados.solicitar_simulacao) {
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'validacao_pendente',
      `Campos faltantes: ${validacao.camposFaltantes.join(', ')}`)

    await supabase.from('leads').update({ status_analise: 'aguardando_documentos' }).eq('id', lead_id)

    const linhasDocs = docsVinculados > 0 ? `\n${docsVinculados} documento(s) anexado(s).` : ''
    const aviso = pessoaCriada ? '\n⚠️ Pessoa criada sem CPF validado. Verifique duplicidade.' : ''
    const acao = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'

    if (!validacao.valido) {
      const lista = validacao.camposFaltantes.map((c) => `• ${c}`).join('\n')
      return [
        `✅ ${acao}.${linhasDocs}${aviso}`,
        '',
        'Faltam os seguintes dados para executar a simulação:',
        lista,
        '',
        'Para complementar:',
        '• Responda nesta conversa com os dados faltantes + *simula',
        '• Ou reenvie *cria cliente com os dados completos — o Fonti atualizará este Lead.',
      ].join('\n')
    }

    // Dados válidos mas sem pedido de simulação
    const linhas: string[] = [`✅ Lead ${leadAtualizado ? 'atualizado' : 'criado'}: *${dados.nome}*`]
    if (dados.valor_imovel) linhas.push(`Imóvel: ${fmt.format(dados.valor_imovel)}`)
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

  // ── Etapa 8: Simulação ────────────────────────────────────────────────────
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
  if (melhor) camposLeadPos.banco_pretendido = melhor.bancoNome
  await supabase.from('leads').update(camposLeadPos).eq('id', lead_id)

  // ── Etapa 10: PDF ─────────────────────────────────────────────────────────
  let pdfEnviado = false
  let pdfErroMsg: string | null = null

  const tokenEfetivo   = ctx.instancia_token  || process.env.UAZAPI_INSTANCE_TOKEN || ''
  const destinoEfetivo = ctx.telefone_destino || ctx.telefone_cliente || ctx.telefone_remetente || ''

  const hasToken   = !!tokenEfetivo
  const hasDestino = !!destinoEfetivo
  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'pdf_geracao_iniciada',
    `token=${hasToken}(${tokenEfetivo.length}c) destino=${destinoEfetivo || 'nulo'}`)

  if (!hasToken || !hasDestino) {
    pdfErroMsg = !hasToken
      ? 'instancia_token ausente no contexto e UAZAPI_INSTANCE_TOKEN não configurado'
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
        `Destino: ${destinoEfetivo}`)

      await enviarPDFUazapi(destinoEfetivo, pdfBuffer, tokenEfetivo, dados.nome ?? '')
      pdfEnviado = true

      await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'pdf_enviado',
        `Enviado para ${destinoEfetivo}`)
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
    ? elegiveis.map((b) => {
        const prog = b.programa !== b.bancoNome ? ` (${b.programa})` : ''
        return `• ${b.bancoNome}${prog} — 1ª parcela ${fmt.format(b.primeiraParcela)}`
      }).join('\n')
    : '• Nenhum banco elegível com os parâmetros informados'

  const acaoFinal = leadAtualizado ? '✅ Lead atualizado com sucesso.' : '✅ Cliente e Lead criados com sucesso.'
  const linhas: string[] = [
    acaoFinal,
    leadAtualizado && camposAtualizados.length > 0
      ? `Dados complementados: ${camposAtualizados.join(', ')}.`
      : 'Lead na etapa Captação.',
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
  if (tipo === 'novo') return 'apartamento'
  if (tipo === 'usado') return 'apartamento'
  return null
}
