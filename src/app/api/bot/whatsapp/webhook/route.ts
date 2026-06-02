import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processarMensagem, gerarSaudacaoReativacao } from '@/lib/bot/agente'
import type { MensagemHistorico } from '@/lib/bot/agente'
import { processarEstado } from '@/lib/bot/state-machine'
import type { BotEstado, BotDados } from '@/lib/bot/state-machine'
import { carregarBotConfig } from '@/lib/bot/bot-config'
import { estaEmHorarioConfig } from '@/lib/horarioAtendimento'
import { buscarOuCriarPessoa, buscarPessoaPorTelefone, carregarContextoPessoa, formatarContextoParaBot, confirmarIdentidadePessoa } from '@/lib/pessoa'
import { processarComandoFonti } from '@/lib/bot/fonti-comandos'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Payload format sent by Uazapi
interface UazapiMediaContent {
  URL?: string
  mimetype?: string
  JPEGThumbnail?: string
  fileName?: string
}

interface UazapiPayload {
  EventType?: string
  chatSource?: string
  message?: {
    fromMe?: boolean
    isGroup?: boolean
    text?: string
    // type="text" para texto, type="media" para qualquer mídia
    type?: string
    // tipo real da mídia: "image" | "video" | "audio" | "document" | "ptt" | "sticker"
    mediaType?: string
    // content é string em mensagens de texto, objeto com URL em mídias
    content?: string | UazapiMediaContent
    sender_pn?: string
    senderName?: string
    chatid?: string
    fileURL?: string
    messageid?: string
  }
  chat?: {
    phone?: string
    wa_contactName?: string
  }
  token?: string
  owner?: string
}

function mapProduto(produto: string | undefined | null): string | null {
  if (!produto) return null
  const p = produto.toLowerCase()
  if (p.includes('financ')) return 'Financiamento Imobiliário'
  if (p.includes('cons'))   return 'Consórcio'
  if (p.includes('cgi'))    return 'CGI'
  if (p.includes('contrat')) return 'Contrato'
  return produto
}

async function salvarDocumentoCliente(params: {
  empresa_id: string
  conversa_id: string
  pessoa_id: string | null
  fileUrl: string
  fileName: string | null
  mimeType: string | null
}): Promise<void> {
  const { empresa_id, conversa_id, pessoa_id, fileUrl, fileName, mimeType } = params

  const ext = fileName?.split('.').pop()
    ?? (mimeType?.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')
  const storagePath = `${empresa_id}/${conversa_id}/${crypto.randomUUID()}.${ext}`
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

  if (uploadError) throw new Error(`Storage upload falhou: ${uploadError.message}`)

  await supabase.from('documentos_clientes').insert({
    empresa_id,
    conversa_id,
    pessoa_id: pessoa_id ?? undefined,
    nome_original: nomeOriginal,
    mime_type: mimeType ?? null,
    tamanho_bytes: fileBuffer.byteLength,
    storage_path: storagePath,
    canal_origem: 'whatsapp',
  })
}

async function baixarMidiaUazapi(messageid: string, tipoMidia: string): Promise<string | null> {
  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/message/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': process.env.UAZAPI_INSTANCE_TOKEN ?? '' },
      body: JSON.stringify({
        id: messageid,
        return_link: true,
        generate_mp3: tipoMidia === 'audio' || tipoMidia === 'ptt',
      }),
    })
    if (!res.ok) {
      console.error('[uazapi-download] erro:', res.status, await res.text())
      return null
    }
    const data = await res.json()
    return data.fileURL ?? null
  } catch (err) {
    console.error('[uazapi-download] exceção:', err)
    return null
  }
}

async function enviarMensagemUazapi(telefone: string, texto: string, token?: string): Promise<void> {
  const url = `${process.env.UAZAPI_API_URL}/send/text`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': token ?? process.env.UAZAPI_INSTANCE_TOKEN ?? '',
    },
    body: JSON.stringify({
      number: telefone,
      text: texto,
      track_source: 'credifon-crm',
      delay: 1500,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('[uazapi] Erro ao enviar mensagem:', res.status, body)
  } else {
    console.log('[uazapi] Mensagem enviada com sucesso para', telefone)
  }
}

// Verificação GET do webhook (Uazapi envia ?token=...)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (token && token === process.env.UAZAPI_WEBHOOK_TOKEN) {
    return new NextResponse(token, { status: 200 })
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}

export async function POST(request: NextRequest) {
  let payload: UazapiPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  console.log('[whatsapp-webhook] payload recebido:', JSON.stringify(payload, null, 2))

  const msg = payload.message

  // Detecta *fonti antes do filtro fromMe (comercial envia da conversa do cliente)
  if (msg?.fromMe && !msg?.isGroup) {
    const textoFromMe = (typeof msg?.content === 'string' ? msg.content : (msg?.text ?? '')).trim()
    const textoNormFM = textoFromMe.slice(0, 12).normalize('NFD').replace(/[̀-ͯ]/g, '') + textoFromMe.slice(12)

    if (/^\*fonti\b/i.test(textoNormFM)) {
      // Resolve instância pelo token (maybeSingle evita erro quando não encontra)
      const fmToken = payload.token ?? process.env.UAZAPI_INSTANCE_TOKEN ?? ''
      const { data: fmInst } = await supabase
        .from('instancias').select('id, empresa_id, atendente_id, numero_telefone')
        .eq('token', fmToken).eq('ativo', true).maybeSingle()

      const fmEmpresaId = fmInst?.empresa_id ?? process.env.UAZAPI_EMPRESA_ID
      const ownerPhone = (payload.owner ?? '').replace(/\D/g, '')
      const clientPhone = (msg.chatid ?? '').replace('@s.whatsapp.net', '')

      console.log('[fonti-fromMe] token:', fmToken, '| instancia:', fmInst?.id ?? 'NAO ENCONTRADA', '| atendente_id:', fmInst?.atendente_id ?? 'null', '| owner:', ownerPhone)

      if (!fmEmpresaId) {
        console.warn('[fonti-fromMe] empresa_id nao resolvido, ignorando')
        return NextResponse.json({ ok: true })
      }

      let fmFileUrl: string | null = null
      const fmTipoRaw = msg?.type ?? 'text'
      const fmIsMidia = fmTipoRaw === 'media' || ['image','video','audio','document','ptt','sticker'].includes(fmTipoRaw)
      if (fmIsMidia && msg?.messageid) {
        fmFileUrl = await baixarMidiaUazapi(msg.messageid, msg?.mediaType ?? fmTipoRaw)
      }
      const fmMediaContent = typeof msg?.content === 'object' && msg.content !== null
        ? msg.content as UazapiMediaContent : null

      const { processarComandoFonti: fmFonti } = await import('@/lib/bot/fonti-comandos')
      const respostaFM = await fmFonti(textoNormFM.trim(), {
        empresa_id: fmEmpresaId,
        telefone_remetente: ownerPhone,
        telefone_cliente: clientPhone || undefined,
        atendente_id_override: fmInst?.atendente_id ?? undefined,
        supabase,
        arquivos: fmFileUrl
          ? [{ fileUrl: fmFileUrl, fileName: fmMediaContent?.fileName ?? null, mimeType: fmMediaContent?.mimetype ?? null }]
          : [],
      })

      // Responde para o próprio comercial (self-message); se null = não autorizado
      const msgParaComercial = respostaFM ?? '❌ Não autorizado. Verifique se esta instância tem atendente configurado em Configurações → Instâncias.'
      await enviarMensagemUazapi(ownerPhone, msgParaComercial, fmToken)
      return NextResponse.json({ ok: true })
    }

    // Não é *fonti → ignora (resposta do bot ou mensagem enviada pelo humano)
    return NextResponse.json({ ok: true })
  }

  // Uazapi: type="media" para toda mídia; tipo real fica em mediaType
  const tipoRaw = msg?.type ?? 'text'
  const isMidia = tipoRaw === 'media' || ['image', 'video', 'audio', 'document', 'ptt', 'sticker'].includes(tipoRaw)
  const tipoMidia = isMidia ? (msg?.mediaType ?? tipoRaw) : 'text'

  // Para texto: content é string. Para mídia: content é objeto com URL
  const contentRaw = msg?.content
  const texto = typeof contentRaw === 'string'
    ? contentRaw
    : (msg?.text ?? '')

  // Ignora se não tem texto E não é mídia
  if (!texto.trim() && !isMidia) {
    console.log('[whatsapp-webhook] mensagem sem conteúdo reconhecido, ignorando. tipo:', tipoRaw)
    return NextResponse.json({ ok: true })
  }

  // Para mídias: baixa via Uazapi para obter URL pública hospedada (content.URL é encriptada)
  const mediaContent = typeof contentRaw === 'object' && contentRaw !== null ? contentRaw as UazapiMediaContent : null
  let fileUrl: string | null = null
  if (isMidia && msg?.messageid) {
    fileUrl = await baixarMidiaUazapi(msg.messageid, tipoMidia)
  }

  // Extrai telefone: "554484558946@s.whatsapp.net" → "554484558946"
  const senderPn = msg?.sender_pn ?? ''
  const telefone = senderPn.replace('@s.whatsapp.net', '')
  if (!telefone) {
    console.log('[whatsapp-webhook] telefone não encontrado, ignorando')
    return NextResponse.json({ ok: true })
  }

  const nomeContato = msg?.senderName ?? payload.chat?.wa_contactName ?? undefined

  // Identifica instância pelo token do payload (suporte multi-instância)
  const instanciaToken = payload.token ?? process.env.UAZAPI_INSTANCE_TOKEN ?? ''
  const { data: instancia } = await supabase
    .from('instancias')
    .select('id, empresa_id, atendente_id')
    .eq('token', instanciaToken)
    .eq('ativo', true)
    .single()

  // Fallback para variável de ambiente (compatibilidade retroativa)
  const empresa_id = instancia?.empresa_id ?? process.env.UAZAPI_EMPRESA_ID
  const instancia_id = instancia?.id ?? null
  const atendente_id_instancia = instancia?.atendente_id ?? null

  if (!empresa_id) {
    console.error('[whatsapp] Instância não encontrada e UAZAPI_EMPRESA_ID não configurado. Token:', instanciaToken)
    return NextResponse.json({ error: 'Configuração incompleta' }, { status: 500 })
  }

  // Carrega configuração dinâmica do agente Fonti (fallback para defaults se não existir)
  const botConfig = await carregarBotConfig(supabase, empresa_id)

  // ── Mensagens de grupo ──────────────────────────────────────────────────────
  if (msg?.isGroup) {
    const grupoId = msg.chatid ?? ''
    const grupoNome = payload.chat?.wa_contactName ?? grupoId
    if (!grupoId) return NextResponse.json({ ok: true })

    // Busca ou cria conversa de grupo (deduplicada por chatid na empresa)
    const { data: conversaGrupoExistente } = await supabase
      .from('conversas')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('contato_grupo_id', grupoId)
      .maybeSingle()

    let grupoConversaId: string
    if (conversaGrupoExistente) {
      grupoConversaId = conversaGrupoExistente.id
    } else {
      const { data: novaGrupo, error: erroGrupo } = await supabase
        .from('conversas')
        .insert({
          empresa_id,
          canal: 'whatsapp',
          contato_nome: grupoNome,
          contato_grupo_id: grupoId,
          status: 'humano',
          bot_ativo: false,
          instancia_id: instancia_id ?? undefined,
        })
        .select('id')
        .single()

      if (erroGrupo || !novaGrupo) {
        console.error('[whatsapp-grupo] Erro ao criar conversa de grupo:', erroGrupo)
        return NextResponse.json({ ok: true })
      }
      grupoConversaId = novaGrupo.id
    }

    const remetente = msg.senderName ?? telefone
    await supabase.from('mensagens').insert({
      conversa_id: grupoConversaId,
      origem: msg.fromMe ? 'humano' : 'cliente',
      conteudo: texto.trim() || '[mídia]',
      metadata: {
        tipo_midia: isMidia ? tipoMidia : undefined,
        file_url: fileUrl ?? undefined,
        atendente: msg.fromMe ? remetente : undefined,
        sender_nome: !msg.fromMe ? remetente : undefined,
        sender_telefone: telefone,
      },
    })

    return NextResponse.json({ ok: true })
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Comando interno *fonti — processa ANTES do fluxo de atendimento ao cliente
  // Normaliza os primeiros chars: remove acentos (autocorrect coloca *Fontì com acento)
  const textoParaFonti = texto.trim().slice(0, 12)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') + texto.trim().slice(12)
  if (/^\*fonti\b/i.test(textoParaFonti)) {
    const respostaFonti = await processarComandoFonti(textoParaFonti.trim(), {
      empresa_id,
      telefone_remetente: telefone,
      supabase,
      arquivos: fileUrl
        ? [{ fileUrl, fileName: mediaContent?.fileName ?? null, mimeType: mediaContent?.mimetype ?? null }]
        : [],
    })

    // null = remetente não é usuário interno → cai no fluxo normal de atendimento
    if (respostaFonti !== null) {
      await enviarMensagemUazapi(telefone, respostaFonti)
      return NextResponse.json({ ok: true })
    }
    console.warn('[fonti] Prefixo *fonti detectado mas remetente NAO é usuario interno. telefone:', telefone)
  }

  // Lookup antecipado: busca lead pelo telefone para auto-vincular
  const { data: ltRow } = await supabase
    .from('lead_telefones')
    .select('lead_id')
    .eq('empresa_id', empresa_id)
    .eq('telefone', telefone)
    .limit(1)
    .maybeSingle()
  const leadIdVinculo = ltRow?.lead_id ?? null

  // Verifica se pessoa já existia ANTES desta chamada (define clienteNovo corretamente)
  // Deve ser feito antes de buscarOuCriarPessoa para não ser afetado pela criação
  const pessoaPreExistente = await buscarPessoaPorTelefone(empresa_id, telefone)

  // Busca ou cria Pessoa (entidade central de deduplicação)
  let pessoaId: string | null = null
  try {
    pessoaId = await buscarOuCriarPessoa(empresa_id, telefone, nomeContato ?? 'Cliente')
  } catch (err) {
    console.error('[whatsapp] Erro ao buscar/criar pessoa:', err)
  }

  // Busca ou cria conversa para este telefone
  let conversa_id: string
  let bot_ativo = true

  const { data: conversaExistente } = await supabase
    .from('conversas')
    .select('id, bot_ativo, lead_id, bot_estado, bot_dados')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .eq('contato_telefone', telefone)
    .single()

  let reativandoBot = false

  if (conversaExistente) {
    conversa_id = conversaExistente.id
    bot_ativo = conversaExistente.bot_ativo

    // Vincula ao lead e/ou pessoa se ainda não estava vinculado
    const atualizacoes: Record<string, unknown> = {}
    if (!conversaExistente.lead_id && leadIdVinculo) atualizacoes.lead_id = leadIdVinculo
    if (pessoaId) atualizacoes.pessoa_id = pessoaId
    if (Object.keys(atualizacoes).length > 0) {
      await supabase.from('conversas').update(atualizacoes).eq('id', conversa_id)
    }

    // Se humano assumiu mas está fora do horário de atendimento → bot reassume
    if (!bot_ativo && !estaEmHorarioConfig(botConfig)) {
      await supabase.from('conversas')
        .update({ bot_ativo: true, status: 'ativo' })
        .eq('id', conversa_id)
      bot_ativo = true
      reativandoBot = true
      console.log('[whatsapp] Bot reativado automaticamente (fora do horário)')
    }
  } else {
    const { data: nova, error } = await supabase
      .from('conversas')
      .insert({
        empresa_id,
        canal: 'whatsapp',
        contato_telefone: telefone,
        contato_nome: nomeContato ?? null,
        status: 'ativo',
        bot_ativo: true,
        instancia_id: instancia_id ?? undefined,
        atendente_id: atendente_id_instancia ?? undefined,
        lead_id: leadIdVinculo ?? undefined,
        pessoa_id: pessoaId ?? undefined,
      })
      .select('id')
      .single()

    if (error || !nova) {
      console.error('[whatsapp] Erro ao criar conversa:', error)
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
    conversa_id = nova.id
  }

  // Salva mensagem do cliente
  const conteudoCliente = texto.trim()
  await supabase.from('mensagens').insert({
    conversa_id,
    origem: 'cliente',
    conteudo: conteudoCliente,
    metadata: {
      tipo_midia: isMidia ? tipoMidia : undefined,
      file_url: fileUrl ?? undefined,
      nome_arquivo: mediaContent?.fileName ?? undefined,
      sender_pn: senderPn,
      senderName: nomeContato,
    },
  })

  // Auto-save de arquivos no Supabase Storage (fora do bot — salva sempre)
  if (isMidia && fileUrl) {
    salvarDocumentoCliente({
      empresa_id,
      conversa_id,
      pessoa_id: pessoaId,
      fileUrl,
      fileName: mediaContent?.fileName ?? null,
      mimeType: mediaContent?.mimetype ?? null,
    }).catch((err: unknown) => console.error('[whatsapp] Erro ao salvar documento:', err))
  }

  // Se humano assumiu, ou é mídia sem legenda, não responde com bot
  if (!bot_ativo || (isMidia && !texto.trim())) {
    return NextResponse.json({ ok: true })
  }

  // Carrega histórico (últimas 10)
  const { data: historicoDB } = await supabase
    .from('mensagens')
    .select('origem, conteudo')
    .eq('conversa_id', conversa_id)
    .order('created_at', { ascending: true })
    .limit(10)

  const historico: MensagemHistorico[] = (historicoDB ?? [])
    .filter((m) => m.conteudo !== texto.trim())
    .map((m) => ({
      role: m.origem === 'cliente' ? 'user' : 'assistant',
      content: m.conteudo,
    }))

  // Se bot foi reativado automaticamente, envia saudação contextualizada e encerra
  if (reativandoBot) {
    const saudacao = await gerarSaudacaoReativacao(historico, nomeContato ?? 'cliente', texto.trim(), botConfig)
    await supabase.from('mensagens').insert({ conversa_id, origem: 'bot', conteudo: saudacao })
    await enviarMensagemUazapi(telefone, saudacao)
    return NextResponse.json({ ok: true })
  }

  // Carrega contexto da pessoa para o bot (cliente existente vs novo)
  let contextoCliente: string | undefined
  try {
    const ctx = await carregarContextoPessoa(empresa_id, telefone)
    if (ctx) contextoCliente = formatarContextoParaBot(ctx)
  } catch (err) {
    console.error('[whatsapp] Erro ao carregar contexto pessoa:', err)
  }

  // Carrega estado atual da conversa (defaults para nova conversa sem estado)
  const botEstadoAtual: BotEstado = (conversaExistente as { bot_estado?: string } | null)?.bot_estado as BotEstado ?? 'INICIO'
  const botDadosAtuais: BotDados = (conversaExistente as { bot_dados?: BotDados } | null)?.bot_dados ?? {}

  // clienteNovo = pessoa não existia antes desta chamada (não é afetado por buscarOuCriarPessoa)
  const clienteNovo = !pessoaPreExistente

  // Roda a state machine de forma determinística
  const transicao = processarEstado(botEstadoAtual, botDadosAtuais, texto.trim(), clienteNovo)

  // Extração teve sucesso se o estado ou o campo aguardado avançou
  const extraidoComSucesso =
    transicao.criarLead ||
    transicao.novoEstado !== botEstadoAtual ||
    transicao.novosDados.aguardando !== botDadosAtuais.aguardando

  console.log('[BOT STATE]', transicao.novoEstado, JSON.stringify(transicao.novosDados), '| extraido:', extraidoComSucesso)

  // Proteção anti-loop: encerra fluxo após MAX_TENTATIVAS no mesmo campo
  if (transicao.forcarEncerramento) {
    const msgFallback = `Não consegui entender sua resposta. Um de nossos assessores entrará em contato em breve! 📞 (44) 3262-1685`
    await supabase.from('conversas')
      .update({
        bot_estado: transicao.novoEstado,
        bot_dados: transicao.novosDados,
        bot_ativo: false,
        status: 'aguardando',
      })
      .eq('id', conversa_id)
    await supabase.from('mensagens').insert({ conversa_id, origem: 'bot', conteudo: msgFallback })
    await enviarMensagemUazapi(telefone, msgFallback)
    console.warn('[BOT] Encerramento forçado por loop — conversa:', conversa_id, '| campo:', transicao.novosDados.aguardando)
    return NextResponse.json({ ok: true })
  }

  // Processa com agente Claude (gera texto natural baseado no estado)
  let resultado
  try {
    resultado = await processarMensagem(texto.trim(), historico, telefone, contextoCliente, transicao, extraidoComSucesso, botConfig)
  } catch (err) {
    console.error('[whatsapp] Erro no agente:', err)
    return NextResponse.json({ ok: true })
  }

  // Salva estado atualizado na conversa
  await supabase.from('conversas')
    .update({ bot_estado: transicao.novoEstado, bot_dados: transicao.novosDados })
    .eq('id', conversa_id)

  // Salva e envia resposta
  await supabase.from('mensagens').insert({
    conversa_id,
    origem: 'bot',
    conteudo: resultado.resposta,
  })

  await enviarMensagemUazapi(telefone, resultado.resposta)

  // Cria lead quando state machine sinaliza CONCLUIDO
  if (transicao.criarLead) {
    const { nome, produto, valor_imovel, renda_mensal } = transicao.novosDados

    // Cria lead se tiver nome — produto é opcional (lead com status "novo" sem produto)
    if (nome) {
      try {
        const produtoMapeado = mapProduto(produto ?? null)

        // Busca primeira fase ativa do módulo leads
        const { data: primeiraFase } = await supabase
          .from('fases')
          .select('id')
          .eq('empresa_id', empresa_id)
          .eq('ativo', true)
          .eq('modulo', 'leads')
          .order('ordem', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (!primeiraFase) {
          console.error('[whatsapp] Empresa sem fases configuradas — lead não criado. empresa_id:', empresa_id)
        } else {
          // Deduplicação: mesma pessoa + mesmo produto = duplicata
          let duplicado = false
          if (pessoaId) {
            let q = supabase.from('leads').select('id').eq('empresa_id', empresa_id).eq('pessoa_id', pessoaId).is('deleted_at', null)
            if (produtoMapeado) q = q.eq('produto_interesse', produtoMapeado)
            const { data: existente } = await q.maybeSingle()
            duplicado = !!existente
          }

          if (duplicado) {
            console.log('[whatsapp] Lead já existe para pessoa + produto, ignorando duplicata')
            await supabase.from('conversas').update({ status: 'qualificado', contato_nome: nome }).eq('id', conversa_id)
          } else {
            const { data: novoLead, error: leadErr } = await supabase
              .from('leads')
              .insert({
                empresa_id,
                nome: nome.trim(),
                telefone,
                fase_id: primeiraFase.id,
                origem: 'whatsapp',
                ordem_kanban: 0,
                produto_interesse: produtoMapeado ?? null,
                valor_pretendido: typeof valor_imovel === 'number' ? valor_imovel : null,
                renda_formal:     typeof renda_mensal === 'number' ? renda_mensal : null,
                pessoa_id:     pessoaId ?? undefined,
                responsavel_id: atendente_id_instancia ?? undefined,
              })
              .select('id')
              .single()

            if (leadErr || !novoLead) {
              console.error('[whatsapp] Erro ao criar lead:', leadErr)
            } else {
              console.log('[whatsapp] Lead criado:', novoLead.id)

              const detalhesNotif = [
                produtoMapeado,
                typeof valor_imovel === 'number'
                  ? `R$ ${valor_imovel.toLocaleString('pt-BR')}` : null,
                typeof renda_mensal === 'number'
                  ? `Renda R$ ${renda_mensal.toLocaleString('pt-BR')}` : null,
              ].filter(Boolean).join(' · ')

              await Promise.all([
                supabase.from('lead_telefones').upsert(
                  { lead_id: novoLead.id, empresa_id, telefone, principal: true },
                  { onConflict: 'lead_id,telefone' }
                ),
                supabase.from('conversas').update({
                  lead_id: novoLead.id,
                  status: 'qualificado',
                  contato_nome: nome,
                  ...(pessoaId ? { pessoa_id: pessoaId } : {}),
                }).eq('id', conversa_id),
                // Notifica o comercial responsável pela instância
                ...(atendente_id_instancia ? [
                  supabase.from('notificacoes').insert({
                    empresa_id,
                    usuario_id: atendente_id_instancia,
                    tipo: 'lead_atribuido',
                    titulo: `Novo lead via WhatsApp: ${nome.trim()}`,
                    mensagem: detalhesNotif || null,
                    entidade: 'lead',
                    entidade_id: novoLead.id,
                  }),
                ] : []),
              ])
            }
          }
        }

        // Bot coletou nome real → confirma identidade e atualiza CPF/data_nascimento
        if (pessoaId) {
          await confirmarIdentidadePessoa(pessoaId, nome)

          const camposExtras: Record<string, unknown> = {}
          const { cpf, data_nascimento } = transicao.novosDados
          if (cpf)             camposExtras.cpf             = cpf
          if (data_nascimento) camposExtras.data_nascimento = data_nascimento

          if (Object.keys(camposExtras).length > 0) {
            await supabase.from('pessoas').update(camposExtras).eq('id', pessoaId)
          }
        }
      } catch (err) {
        console.error('[whatsapp] Erro inesperado ao criar lead:', err)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
