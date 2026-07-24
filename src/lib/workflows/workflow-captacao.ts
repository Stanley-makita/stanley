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
import { normalizarPedidoSimulacao, extrairCpfBrutoDoTexto } from './normalizador-captacao'
import type { DadosCaptacaoNormalizados } from './normalizador-captacao'
import {
  validarParaSimulacao, deveDispararSimulacao, executarSimulacao, executarSimulacaoComparativaPrazos,
  montarRespostaSimulacao, gerarPdfSimulacao,
} from './motor-simulacao'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
import { buscarPessoaPorCpf, buscarPessoaPorTelefone, buscarOuCriarPessoa, confirmarIdentidadePessoa } from '@/lib/pessoa'
import { obterOrdemTopo } from '@/lib/leads/ordem'
import { enviarPDFUazapi as _enviarPDFUazapiShared, enviarTextoUazapi } from './uazapi-helpers'

export interface WorkflowCaptacaoContexto {
  empresa_id: string
  usuario_id: string
  usuario_nome: string
  // Perfil de quem disparou o comando — usado para preencher automaticamente
  // responsavel_id do lead quando é um comercial criando a própria captação.
  usuario_perfil?: string
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
  // Workflow pendente: telefone do operador para salvar/limpar pendência
  telefone_operador?: string
  // true quando re-chamado a partir de resolução de pendência — pula criação de nova pendência
  vem_de_pendente?: boolean
  // Dados já normalizados de pendência anterior — mescla sobre a saída do parser
  dados_pre_normalizados?: Partial<import('./normalizador-captacao').DadosCaptacaoNormalizados>
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

// Modelo definitivo: grava direto em `documentos` (dominio=acervo_documental) +
// `documento_vinculos` (lead) em vez de documentos_clientes. pessoa_id obrigatório —
// se ainda não tiver sido resolvida, cria Pessoa provisória pelo telefone da conversa
// (mesma regra do webhook e de fonti-comandos.ts).
async function salvarArquivoWorkflow(
  supabase: SupabaseClient,
  arquivo: { fileUrl: string; fileName: string | null; mimeType: string | null },
  empresa_id: string,
  pessoa_id: string | null,
  lead_id: string,
  telefoneFallback: string,
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

    const pessoaIdEfetiva = pessoa_id ?? await buscarOuCriarPessoa(empresa_id, telefoneFallback, 'Cliente')

    const { data: docInserido, error: dbError } = await supabase.from('documentos').insert({
      empresa_id,
      dominio: 'acervo_documental',
      pessoa_id: pessoaIdEfetiva,
      nome_original: nomeOriginal,
      mime_type:     mimeType ?? null,
      tamanho_bytes: fileBuffer.byteLength,
      storage_bucket: 'documentos-clientes',
      storage_path:  storagePath,
      origem:        'whatsapp',
    }).select('id').single()
    if (dbError) throw dbError

    await supabase.from('documento_vinculos').insert({
      empresa_id, documento_id: docInserido!.id, entidade_tipo: 'lead', entidade_id: lead_id,
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
  const { empresa_id, usuario_id, usuario_nome, usuario_perfil, supabase } = ctx

  // ── Etapas 1+2: Parser → Normalizador (pipeline único compartilhado) ───────
  const dados = await normalizarPedidoSimulacao(textoBruto)

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
  // Mescla dados pré-normalizados de workflow pendente (campos já capturados).
  // Campos não-null do parser na nova mensagem têm precedência; pre_normalizados preenchem nulls.
  if (ctx.dados_pre_normalizados) {
    const { mergeCapturados } = await import('./simula-pendente')
    const merged = mergeCapturados(ctx.dados_pre_normalizados, dados)
    Object.assign(dados, merged)
  }
  if (!dados.nome) {
    return '❌ Não consegui identificar o nome do cliente no texto.\n\nTente incluir o nome completo.'
  }

  // Fallback determinístico de CPF: se o parser LLM não extraiu CPF, mas o texto bruto
  // tem uma sequência plausível de 11 dígitos, usa ela — evita "Pessoa criada sem CPF"
  // quando o CPF foi de fato informado e só a extração via IA falhou.
  if (!dados.cpf) {
    const cpfFallback = extrairCpfBrutoDoTexto(textoBruto)
    if (cpfFallback) {
      console.warn('[workflow-captacao] parser não extraiu CPF; usando fallback via regex:', cpfFallback)
      dados.cpf = cpfFallback
    }
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
    // Prioridade 4: Pessoa provisória da sessão *fonti inicio (documentos soltos
    // enviados antes do comando — ex: comercial manda CNH/comprovante e só depois
    // digita "*cria cliente Fulano"). fonti_marcas.pessoa_id é a âncora dessa
    // sessão (ver criarPessoaProvisoria em src/lib/pessoa.ts e o handler de mídia
    // solta no webhook) — sem este passo, o Lead ganhava uma Pessoa nova e vazia,
    // e os documentos (com CPF/RG/endereço já extraídos por OCR) ficavam presos
    // na Pessoa provisória, órfã.
    if (!pessoa_id) {
      const telefoneSessao = ctx.telefone_cliente ?? ctx.telefone_remetente
      if (telefoneSessao) {
        const { data: marca } = await supabase
          .from('fonti_marcas')
          .select('pessoa_id')
          .eq('empresa_id', empresa_id)
          .eq('telefone_conversa', telefoneSessao)
          .maybeSingle()
        if (marca?.pessoa_id) {
          pessoa_id = marca.pessoa_id
          // Promove a Pessoa provisória (nome placeholder) pro nome real informado agora.
          // dados.nome já foi validado como não-nulo/vazio no início da função.
          await confirmarIdentidadePessoa(pessoa_id!, dados.nome!)
        }
      }
    }
    // Prioridade 5: Criar nova Pessoa
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
          // Se quem disparou o *cria cliente é um comercial, a captação já
          // nasce na própria carteira. Se for recepção/gestor/admin criando
          // em nome de terceiros, fica sem dono até ser distribuída.
          responsavel_id:   usuario_perfil === 'comercial' ? usuario_id : null,
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
  let docsVinculados        = 0
  let docsVinculadosPorMarca = 0   // incrementado apenas quando marcaAt é o critério
  let docsConversaPendentes: Array<{ nome: string; horario: string }> = []

  // 5a. Salva arquivos enviados junto ao comando
  let arquivosSalvos = 0
  for (const arq of ctx.arquivos ?? []) {
    const ok = await salvarArquivoWorkflow(supabase, arq, empresa_id, pessoa_id, lead_id, telefoneConversa)
    if (ok) arquivosSalvos++
  }
  docsVinculados += arquivosSalvos

  // 5b. Vincula docs enviados antes do comando na conversa do cliente.
  // Modelo definitivo: candidatos são documentos do acervo da(s) pessoa(s) envolvida(s)
  // (a resolvida nesta chamada + a da própria conversa, que pode ser uma Pessoa
  // provisória diferente se o *cria cliente identificou a pessoa por outro caminho,
  // ex: CPF explícito no texto) — não depende mais de conversa_id em `documentos`.
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
    .select('pessoa_id')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .in('contato_telefone', telVariantes)
    .limit(1)
    .maybeSingle()

  const pessoaIdsCandidatos = Array.from(new Set(
    [pessoa_id, conversa?.pessoa_id].filter((id): id is string => !!id),
  ))

  if (pessoaIdsCandidatos.length > 0) {
    const limite = marcaAt ?? (() => {
      const d = new Date()
      d.setMinutes(d.getMinutes() - 15)
      return d
    })()

    const { data: docsCandidatos } = await supabase
      .from('documentos')
      .select('id, nome_original, recebido_em')
      .eq('empresa_id', empresa_id)
      .eq('dominio', 'acervo_documental')
      .in('pessoa_id', pessoaIdsCandidatos)
      .is('deleted_at', null)
      .gte('recebido_em', limite.toISOString())

    if (docsCandidatos?.length) {
      const idsTodos = docsCandidatos.map((d) => d.id)
      const { data: vinculosExistentes } = await supabase
        .from('documento_vinculos')
        .select('documento_id')
        .eq('entidade_tipo', 'lead')
        .in('documento_id', idsTodos)
      const idsComLead = new Set((vinculosExistentes ?? []).map((v) => v.documento_id))
      const docsSemLead = docsCandidatos.filter((d) => !idsComLead.has(d.id))

      const corteImediato = new Date(Date.now() - 2 * 60 * 1000)   // 2 min
      const idsAutoVincular: string[] = []

      for (const doc of docsSemLead) {
        const muitoRecente = new Date(doc.recebido_em as string) >= corteImediato

        if (marcaAt || muitoRecente) {
          idsAutoVincular.push(doc.id as string)
          if (marcaAt) docsVinculadosPorMarca++
        } else {
          const hora = new Date(doc.recebido_em as string)
            .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          docsConversaPendentes.push({
            nome:    (doc.nome_original as string | null) ?? 'Documento',
            horario: hora,
          })
        }
      }

      if (idsAutoVincular.length > 0) {
        await supabase
          .from('documento_vinculos')
          .insert(idsAutoVincular.map((documento_id) => ({
            empresa_id, documento_id, entidade_tipo: 'lead', entidade_id: lead_id,
          })))
        docsVinculados += idsAutoVincular.length
      }
    }
  }

  if (docsVinculados > 0) {
    const detalhe = arquivosSalvos > 0
      ? `${docsVinculados} documento(s) (${arquivosSalvos} do comando + ${docsVinculados - arquivosSalvos} da conversa)`
      : `${docsVinculados} documento(s) da conversa`
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'documentos_vinculados', detalhe)
  } else {
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'documentos_nao_encontrados',
      `Nenhum doc encontrado para ${telefoneConversa}`)
  }

  // Limpa fonti_marcas apenas quando ela foi o motivo da vinculação
  if (marcaAt && telefoneConversa && docsVinculadosPorMarca > 0) {
    await supabase.from('fonti_marcas')
      .delete()
      .eq('empresa_id', empresa_id)
      .eq('telefone_conversa', telefoneConversa)
  }

  // ── Etapa 6: Decisão de intenção de simular ──────────────────────────────
  // Simular só quando há intenção clara (palavra-chave detectada pelo parser, "*simula"
  // explícito via forcar_simulacao, ou dados completos de simulação) — ver
  // motor-simulacao.ts:deveDispararSimulacao. Sem isso, *cria cliente vira só cadastro:
  // não pede dados de crédito e não abre sessão de simulação.
  const decisaoIntencao = deveDispararSimulacao(dados, { forcarSimulacao: ctx.forcar_simulacao })

  if (!decisaoIntencao.deveSimular) {
    await supabase.from('leads').update({ status_analise: 'aguardando_documentos' }).eq('id', lead_id)

    const linhasDocs = docsVinculados > 0 ? `\n${docsVinculados} documento(s) anexado(s).` : ''
    const aviso = montarAvisoCpf(pessoaCriada, dados)
    const acao = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'

    const linhaPendentes = docsConversaPendentes.length > 0
      ? [
          '',
          '📄 *Documentos encontrados nesta conversa (não vinculados automaticamente):*',
          ...docsConversaPendentes.map((d) => `• ${d.nome} — recebido às ${d.horario}`),
          '',
          '_Esses documentos não foram vinculados automaticamente porque não foi possível confirmar que pertencem ao cliente atual. Eles podem ser vinculados posteriormente pelo CRM._',
        ].join('\n')
      : ''

    return [`✅ ${acao}.${linhasDocs}${aviso}`, linhaPendentes].filter(Boolean).join('\n')
  }

  // ── Etapa 6b: Validação (Motor de Simulação) ─────────────────────────────
  const validacao = validarParaSimulacao(dados)

  // Bloqueio de idade é definitivo — nunca abre pendência, nunca chega no motor/PDF.
  // Deve ser o primeiro branch avaliado, antes de qualquer outra checagem de validação.
  if (validacao.bloqueioIdade) {
    if (ctx.telefone_operador) {
      const { limparSimulaPendente } = await import('./simula-pendente')
      await limparSimulaPendente(supabase, empresa_id, ctx.telefone_operador)
    }
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'validacao_pendente',
      `Bloqueio de idade: ${validacao.bloqueioIdade.motivo}`)
    const acao = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'
    const idadeTxt = validacao.bloqueioIdade.idadeCalculada != null ? ` (idade calculada: ${validacao.bloqueioIdade.idadeCalculada} anos)` : ''
    return [
      `✅ ${acao}.`,
      '',
      `❌ Data de nascimento/idade incompatível para simulação${idadeTxt}. Verifique a informação enviada.`,
    ].join('\n')
  }

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

  if (!validacao.valido) {
    await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'validacao_pendente',
      `Campos faltantes: ${validacao.camposFaltantes.join(', ')}`)

    await supabase.from('leads').update({ status_analise: 'aguardando_documentos' }).eq('id', lead_id)

    const linhasDocs = docsVinculados > 0 ? `\n${docsVinculados} documento(s) anexado(s).` : ''
    const aviso = montarAvisoCpf(pessoaCriada, dados)
    const acao = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'

    const linhaPendentes = docsConversaPendentes.length > 0
      ? [
          '',
          '📄 *Documentos encontrados nesta conversa (não vinculados automaticamente):*',
          ...docsConversaPendentes.map((d) => `• ${d.nome} — recebido às ${d.horario}`),
          '',
          '_Esses documentos não foram vinculados automaticamente porque não foi possível confirmar que pertencem ao cliente atual. Eles podem ser vinculados posteriormente pelo CRM._',
        ].join('\n')
      : ''

    const lista = validacao.camposFaltantes.map((c) => `• ${c}`).join('\n')
    if (!ctx.vem_de_pendente && ctx.telefone_operador) {
      const { salvarSimulaPendente } = await import('./simula-pendente')
      await salvarSimulaPendente(supabase, empresa_id, ctx.telefone_operador, {
        motivo: 'completar_dados_simulacao',
        dadosCapturados: dados,
        usouConsulta: false,
        leadIdExistente: lead_id,
        pessoaIdExistente: pessoa_id ?? undefined,
      })
    }
    return [
      `✅ ${acao}.${linhasDocs}${aviso}`,
      '',
      'Faltam os seguintes dados para executar a simulação:',
      lista,
      '',
      'Responda com os dados faltantes para continuar.',
      linhaPendentes,
    ].join('\n')
  }

  // ── Etapa 6.1b: Pedir esclarecimento de modalidade ──────────────────────────
  // Deve vir ANTES do bloqueio de produto para que "quero construir" pergunte a modalidade
  // em vez de cair no "produto não habilitado" por ter produto_normalizado='CONSTRUCAO'.
  // vem_de_pendente: tipo já foi resolvido no processarRespostaPendente — skip total.
  if (dados.pedir_esclarecimento_operacao && dados.pergunta_esclarecimento && !ctx.vem_de_pendente) {
    if (ctx.telefone_operador) {
      const { salvarSimulaPendente } = await import('./simula-pendente')
      await salvarSimulaPendente(supabase, empresa_id, ctx.telefone_operador, {
        motivo: 'esclarecer_tipo_construcao',
        dadosCapturados: dados,
        usouConsulta: false,
        leadIdExistente: lead_id,
        pessoaIdExistente: pessoa_id ?? undefined,
      })
    }
    const acao = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'
    return [`✅ ${acao}.`, '', dados.pergunta_esclarecimento].join('\n')
  }

  // ── Etapa 6.1: Produto não habilitado no motor ──────────────────────────────
  // Construção via Caixa (construcao_terreno_proprio / terreno_mais_construcao) agora é suportada.
  const PRODUTOS_BLOQUEADOS_CAPTACAO: Array<typeof dados.produto_normalizado> = [
    'CGI_HOME_EQUITY', 'CONSORCIO', 'PORTABILIDADE',
  ]
  const ehConstrucaoSuportada = dados.tipo_operacao === 'construcao_terreno_proprio' || dados.tipo_operacao === 'terreno_mais_construcao'
  if (PRODUTOS_BLOQUEADOS_CAPTACAO.includes(dados.produto_normalizado) ||
      (dados.produto_normalizado === 'CONSTRUCAO' && !ehConstrucaoSuportada)) {
    const acao = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'
    return [
      `✅ ${acao}.`,
      '',
      'A simulação automática desse produto ainda não está habilitada.',
      'O lead foi salvo e o comercial responsável pode analisar manualmente.',
    ].join('\n')
  }

  // ── Etapa 6.2: Conflito de valores ───────────────────────────────────────
  if (dados.conflito_valores) {
    const acao = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'
    return [
      `✅ ${acao}.`,
      '',
      '⚠️ *Há divergência entre os valores informados — simulação não executada.*',
      '',
      dados.conflito_valores_descricao ?? '',
      '',
      'Confirme os dados corretos e reenvie *simula ou *cria com os valores corrigidos.',
    ].join('\n')
  }

  // ── Etapa 6.2b: Confirmar valores com formatação numérica ambígua ──────────
  // Ex.: "4500.000" pode ter sido digitado errado (ponto na posição errada) — em vez de
  // simular direto com a interpretação do parser, confirma com o operador antes.
  if (dados.valores_ambiguos_brutos?.length && !ctx.vem_de_pendente) {
    if (ctx.telefone_operador) {
      const { salvarSimulaPendente } = await import('./simula-pendente')
      await salvarSimulaPendente(supabase, empresa_id, ctx.telefone_operador, {
        motivo: 'confirmacao',
        dadosCapturados: dados,
        usouConsulta: false,
        leadIdExistente: lead_id,
        pessoaIdExistente: pessoa_id ?? undefined,
      })
    }
    const acaoConf = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'
    const moedaConf = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    const trechos = dados.valores_ambiguos_brutos.map((v) => `"${v}"`).join(', ')
    return [
      `✅ ${acaoConf}.`,
      '',
      `⚠️ Identifiquei ${trechos} com formatação de número que pode gerar confusão de valor.`,
      dados.valor_imovel != null ? `Interpretei o valor do imóvel como ${moedaConf.format(dados.valor_imovel)}.` : '',
      '',
      'Confirma? Responda *sim* para simular ou *não* para corrigir.',
    ].filter(Boolean).join('\n')
  }

  // ── Etapa 6.2c: Detectar múltiplos prazos ───────────────────────────────────
  // "prazo numérico + prazo máximo" ao mesmo tempo continua sendo rejeitado (ambíguo por
  // natureza). Múltiplos prazos numéricos passam a gerar uma comparação (ver Etapa 7).
  const prazosNum = dados.prazos_detectados ?? []
  if (prazosNum.length >= 1 && dados.prazo_maximo) {
    const acaoPrazo = leadAtualizado ? 'Lead atualizado' : 'Cliente e Lead criados'
    const labels = [...prazosNum.map((p) => `${p} meses`), 'prazo máximo']
    return [
      `✅ ${acaoPrazo}.`,
      '',
      `⚠️ Identifiquei mais de um prazo: ${labels.join(', ')}. Para manter a simulação objetiva, envie apenas um prazo.`,
    ].join('\n')
  }
  const compararPrazos = prazosNum.length > 1

  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'validacao_aprovada',
    `Bancos: ${dados.bancos_ids.join(', ')}`)

  // ── Etapa 7: Motor de Simulação ──────────────────────────────────────────
  const overrides = await carregarOverridesBancos(supabase, empresa_id)

  if (compararPrazos) {
    const tokenAviso   = ctx.instancia_token  || process.env.UAZAPI_INSTANCE_TOKEN || ''
    const destinoAviso = ctx.telefone_destino || ctx.telefone_cliente || ctx.telefone_remetente || ''
    if (tokenAviso && destinoAviso) {
      const anosLabels = Array.from(new Set(prazosNum.map((m) => Math.round(m / 12)))).join(', ')
      await enviarTextoUazapi(destinoAviso,
        `📊 Identifiquei um pedido de comparação de prazos (${anosLabels} anos). Vou gerar uma simulação comparativa.`,
        tokenAviso)
    }
  }

  const resultado = compararPrazos
    ? await executarSimulacaoComparativaPrazos(dados, prazosNum, overrides)
    : await executarSimulacao(dados, overrides)

  const totalElegiveis = resultado.modo === 'CAPACIDADE_MAXIMA'
    ? (resultado.capacidade ?? []).filter((c) => c.maxFinanciavel > 0).length
    : resultado.modo === 'COMPARACAO_PRAZOS'
      ? (resultado.comparativoPrazos ?? []).flatMap((item) => item.bancosResult).filter((b) => b.elegivel).length
      : (resultado.bancosResult ?? []).filter((b) => b.elegivel).length
  await registrarEvento(supabase, lead_id, empresa_id, usuario_id, 'motor_executado',
    `${totalElegiveis} banco(s) elegível(is)`)

  // ── Etapa 8: Simulação ────────────────────────────────────────────────────
  const melhor = resultado.modo === 'CAPACIDADE_MAXIMA'
    ? (resultado.capacidade ?? []).reduce(
        (best, r) => r.maxFinanciavel > (best?.maxFinanciavel ?? 0) ? r : best,
        null as { bancoNome: string; maxFinanciavel: number } | null,
      )
    : resultado.modo === 'COMPARACAO_PRAZOS'
      ? (resultado.comparativoPrazos ?? []).flatMap((item) => item.bancosResult).find((b) => b.elegivel) ?? null
      : (resultado.bancosResult ?? []).find((b) => b.elegivel) ?? null

  const { error: simErr } = await supabase.from('simulacoes_central').insert({
    empresa_id,
    tipo:            'financiamento',
    status:          'concluida',
    tipo_simulacao:  resultado.modo === 'CAPACIDADE_MAXIMA' ? 'capacidade_maxima' : 'preliminar',
    origem_canal:    'whatsapp',
    nome_cliente:    dados.nome,
    cpf_cliente:     dados.cpf ?? null,
    banco:           melhor?.bancoNome ?? null,
    responsavel_id:  usuario_id,
    resultado_json: {
      modo: resultado.modo,
      ...(resultado.modo === 'CAPACIDADE_MAXIMA'
        ? { renda: resultado.rendaMensal, bancos: resultado.capacidade }
        : resultado.modo === 'COMPARACAO_PRAZOS'
          ? { comparativoPrazos: resultado.comparativoPrazos }
          : { input: resultado.input, bancos: resultado.bancosResult, analise: resultado.analise }),
      _input_normalizado: dados as unknown as Record<string, unknown>,
    },
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
      const pdfBuffer = await gerarPdfSimulacao(resultado, {
        clienteNome:     dados.nome ?? undefined,
        responsavelNome: usuario_nome,
        cpfCliente:      dados.cpf,
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

  const corpoSimulacao = montarRespostaSimulacao(resultado, { nomeDisplay: dados.nome ?? 'Cliente' })

  const acaoFinal = leadAtualizado ? '✅ Lead atualizado com sucesso.' : '✅ Cliente e Lead criados com sucesso.'
  const linhas: string[] = [
    acaoFinal,
    leadAtualizado && camposAtualizados.length > 0
      ? `Dados complementados: ${camposAtualizados.join(', ')}.`
      : 'Lead na etapa Captação.',
    '',
    `Motor de Crédito executado.`,
    corpoSimulacao,
  ]

  if (pdfEnviado) {
    linhas.push('\nPDF da simulação em anexo.')
  } else if (pdfErroMsg) {
    linhas.push('\n⚠️ Simulação gerada, mas houve erro ao enviar o PDF. Consulte o histórico do Lead.')
  }

  if (docsVinculados > 0) {
    linhas.push(`\n${docsVinculados} documento(s) anexado(s) ao Lead.`)
  }

  if (docsConversaPendentes.length > 0) {
    linhas.push(
      '',
      '📄 *Documentos encontrados nesta conversa (não vinculados automaticamente):*',
      ...docsConversaPendentes.map((d) => `• ${d.nome} — recebido às ${d.horario}`),
      '',
      '_Esses documentos não foram vinculados automaticamente porque não foi possível confirmar que pertencem ao cliente atual. Eles podem ser vinculados posteriormente pelo CRM._',
    )
  }

  const avisoCpfFinal = montarAvisoCpf(pessoaCriada, dados)
  if (avisoCpfFinal) {
    linhas.push(avisoCpfFinal)
  }

  linhas.push(
    '',
    '⚠️ Esta simulação é preliminar, gerada com base nas informações fornecidas pelo comercial.',
    'A confirmação depende da análise documental e das políticas vigentes de cada banco.',
  )

  return linhas.join('\n')
}

// Só aparece quando NEM o parser NEM o fallback de regex (extrairCpfBrutoDoTexto)
// encontraram CPF — ou seja, o cliente de fato não informou CPF nenhum.
function montarAvisoCpf(pessoaCriada: boolean, dados: DadosCaptacaoNormalizados): string {
  return pessoaCriada && !dados.cpf ? '\n⚠️ Pessoa criada sem CPF. Verifique possível duplicidade.' : ''
}

function mapTipoImovelLead(tipo: 'novo' | 'usado' | null): string | null {
  if (tipo === 'novo') return 'apartamento'
  if (tipo === 'usado') return 'apartamento'
  return null
}
