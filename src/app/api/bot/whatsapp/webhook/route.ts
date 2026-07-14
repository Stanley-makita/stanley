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
import { obterOrdemTopo } from '@/lib/leads/ordem'

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

// Modelo definitivo: grava direto em `documentos` (dominio=acervo_documental).
// pessoa_id é obrigatório (constraint da tabela) — o chamador sempre resolve/cria
// a Pessoa via buscarOuCriarPessoa() antes de chegar aqui (Pessoa provisória por
// telefone quando ainda não há nome/CPF confirmado).
async function salvarDocumentoCliente(params: {
  empresa_id: string
  pessoa_id: string
  lead_id?: string | null
  conversa_id: string
  mensagem_id?: string | null
  fileUrl: string
  fileName: string | null
  mimeType: string | null
}): Promise<void> {
  const { empresa_id, pessoa_id, lead_id, conversa_id, mensagem_id, fileUrl, fileName, mimeType } = params

  const ext = fileName?.split('.').pop()
    ?? (mimeType?.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')
  const storagePath = `${empresa_id}/${conversa_id}/${crypto.randomUUID()}.${ext}`
  const nomeOriginal = fileName ?? `arquivo.${ext}`

  // Download síncrono — URLs do Uazapi expiram rapidamente; se deixar em background
  // o OCR dispara antes do arquivo chegar ao Storage e marca como erro.
  let fileBuffer: ArrayBuffer | null = null
  let tamanhoBytes = 0
  let ocrStatus = 'pendente'

  try {
    const fileRes = await fetch(fileUrl, { signal: AbortSignal.timeout(20000) })
    if (!fileRes.ok) throw new Error(`Download falhou: ${fileRes.status}`)
    fileBuffer = await fileRes.arrayBuffer()
    tamanhoBytes = fileBuffer.byteLength
  } catch (err) {
    console.error('[whatsapp] Download do arquivo falhou (arquivo não salvo no Storage):', err)
    ocrStatus = 'ignorado'
  }

  // Upload síncrono ao Storage (antes de inserir no banco)
  if (fileBuffer) {
    const { error: uploadError } = await supabase.storage
      .from('documentos-clientes')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType ?? 'application/octet-stream',
        upsert: false,
      })
    if (uploadError) {
      console.error('[whatsapp] Storage upload falhou:', uploadError.message)
      ocrStatus = 'ignorado'
    }
  }

  const { data: docInserido, error: insertError } = await supabase.from('documentos').insert({
    empresa_id,
    dominio: 'acervo_documental',
    pessoa_id,
    nome_original: nomeOriginal,
    mime_type: mimeType ?? null,
    tamanho_bytes: tamanhoBytes,
    storage_bucket: 'documentos-clientes',
    storage_path: storagePath,
    origem: 'whatsapp',
    status_ocr: ocrStatus,
    mensagem_id: mensagem_id ?? null,
  }).select('id').single()
  if (insertError) throw new Error(`DB insert falhou: ${insertError.message}`)

  if (lead_id && docInserido?.id) {
    await supabase.from('documento_vinculos').insert({
      empresa_id,
      documento_id: docInserido.id,
      entidade_tipo: 'lead',
      entidade_id: lead_id,
    })
  }
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
  const expectedWebhookToken = process.env.UAZAPI_WEBHOOK_TOKEN?.trim()
  if (!expectedWebhookToken) {
    console.error('[whatsapp-webhook] UAZAPI_WEBHOOK_TOKEN não configurado')
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 500 })
  }

  const webhookToken = (request.headers.get('x-webhook-token') ?? request.nextUrl.searchParams.get('token'))?.trim()
  if (webhookToken !== expectedWebhookToken) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let payload: UazapiPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  console.log('[whatsapp-webhook] recebido:', {
    eventType: payload.EventType,
    chatSource: payload.chatSource,
    messageType: payload.message?.type,
    mediaType: payload.message?.mediaType,
    fromMe: payload.message?.fromMe,
    isGroup: payload.message?.isGroup,
    hasToken: Boolean(payload.token),
    hasMessageId: Boolean(payload.message?.messageid),
  })

  const msg = payload.message

  // Detecta *fonti antes do filtro fromMe (comercial envia da conversa do cliente)
  if (msg?.fromMe && !msg?.isGroup) {
    const textoFromMe = (typeof msg?.content === 'string' ? msg.content : (msg?.text ?? '')).trim()
    const textoNormFM = textoFromMe.slice(0, 20).normalize('NFD').replace(/[̀-ͯ]/g, '') + textoFromMe.slice(20)

    if (/^\*(?:fonti|in[íi]cio|criar?\s+cliente|salvar?|atualizar?|processo|simula(?:r|[cç][aã]o)?|cancelar?)\b/i.test(textoNormFM)) {
      const fmToken = payload.token || process.env.UAZAPI_INSTANCE_TOKEN || ''
      const ownerPhone = (payload.owner ?? '').replace(/\D/g, '')
      const clientPhone = (msg.chatid ?? '').replace('@s.whatsapp.net', '')

      // 1ª tentativa: busca pelo token exato
      let { data: fmInst } = await supabase
        .from('instancias').select('id, empresa_id, atendente_id, numero_telefone')
        .eq('token', fmToken).eq('ativo', true).maybeSingle()

      // 2ª tentativa: fallback pelo número do owner (token pode diferir em formato)
      if (!fmInst && ownerPhone.length >= 8) {
        const ownerSuffix = ownerPhone.slice(-10)
        const { data: instByPhone } = await supabase
          .from('instancias').select('id, empresa_id, atendente_id, numero_telefone')
          .eq('ativo', true)
          .like('numero_telefone', `%${ownerSuffix}`)
          .maybeSingle()
        if (instByPhone) {
          fmInst = instByPhone
          console.log('[fonti-fromMe] instância resolvida pelo numero_telefone (token não bateu). owner:', ownerPhone)
        }
      }

      const fmEmpresaId = fmInst?.empresa_id ?? process.env.UAZAPI_EMPRESA_ID

      console.log('[fonti-fromMe] token:', fmToken, '| instancia:', fmInst?.id ?? 'NAO ENCONTRADA', '| atendente_id:', fmInst?.atendente_id ?? 'null', '| owner:', ownerPhone)

      if (!fmEmpresaId) {
        console.warn('[fonti-fromMe] empresa_id nao resolvido, ignorando')
        return NextResponse.json({ ok: true })
      }

      // DEDUP: Uazapi dispara o mesmo webhook fromMe 2x. Garante processamento único via messageid.
      const fmMessageId = msg?.messageid
      if (fmMessageId) {
        const { error: dedupErr } = await supabase
          .from('fonti_events')
          .insert({ messageid: fmMessageId, empresa_id: fmEmpresaId })
        if (dedupErr) {
          // Violação de PK = já está sendo/foi processado por outro webhook paralelo
          console.log('[fonti-fromMe] messageid duplicado, ignorando:', fmMessageId)
          return NextResponse.json({ ok: true })
        }
      }

      // Para *fonti salva: aguarda 2.5s para que os webhooks de documentos (não-fromMe) completem
      // antes de buscar os docs no banco — evita "Nenhum documento encontrado" por race condition
      if (/^\*(?:fonti\s+salvar?|salvar?)\b/i.test(textoNormFM)) {
        await new Promise((r) => setTimeout(r, 2500))
      }

      let fmFileUrl: string | null = null
      const fmTipoRaw = msg?.type ?? 'text'
      const fmIsMidia = fmTipoRaw === 'media' || ['image','video','audio','document','ptt','sticker'].includes(fmTipoRaw)
      if (fmIsMidia && msg?.messageid) {
        fmFileUrl = await baixarMidiaUazapi(msg.messageid, msg?.mediaType ?? fmTipoRaw)
      }
      const fmMediaContent = typeof msg?.content === 'object' && msg.content !== null
        ? msg.content as UazapiMediaContent : null

      // Destino da resposta calculado antes de chamar processarComandoFonti
      // para que o Workflow de Captação possa enviar PDF diretamente via Uazapi
      const destinoResposta = clientPhone || ownerPhone

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
        // Contexto para o Workflow de Captação enviar PDF via WhatsApp
        instancia_token:  fmToken,
        telefone_destino: destinoResposta,
      })
      if (respostaFM !== null) {
        await enviarMensagemUazapi(destinoResposta, respostaFM, fmToken)
        // Salva resposta do *fonti em mensagens para que o eco do Uazapi seja detectado
        // e ignorado antes de chegar ao state machine do bot do cliente
        if (clientPhone) {
          const { data: convFM } = await supabase
            .from('conversas').select('id')
            .eq('empresa_id', fmEmpresaId).eq('canal', 'whatsapp')
            .eq('contato_telefone', clientPhone).maybeSingle()
          if (convFM) {
            await supabase.from('mensagens').insert({ conversa_id: convFM.id, origem: 'sistema', conteudo: respostaFM })
          }
        }
      } else if (fmInst) {
        // Instância encontrada mas autenticação falhou — informa o operador
        const errMsg = fmInst.atendente_id
          ? '❌ *fonti*: atendente da instância não encontrado no sistema. Verifique o cadastro em Configurações → Usuários.'
          : '❌ *fonti*: instância sem atendente configurado. Acesse Configurações → Instâncias e vincule um atendente.'
        await enviarMensagemUazapi(destinoResposta, errMsg, fmToken)
      }
      // fmInst null → instância não registrada/desativada, ignora silenciosamente (webhook duplicado)
      return NextResponse.json({ ok: true })
    }

    // Não é *fonti — salva mídia enviada pelo operador na conversa do cliente (ex: PDFs encaminhados)
    const nmTipoRaw = msg?.type ?? 'text'
    const nmIsMidia = nmTipoRaw === 'media' || ['image','video','audio','document','ptt','sticker'].includes(nmTipoRaw)
    const nmClientPhone = (msg?.chatid ?? '').replace('@s.whatsapp.net', '')

    if (nmIsMidia && nmClientPhone && msg?.messageid) {
      const nmToken = payload.token ?? process.env.UAZAPI_INSTANCE_TOKEN ?? ''
      const nmOwnerPhone = (payload.owner ?? '').replace(/\D/g, '')

      let nmEmpresaId: string | undefined
      const { data: nmInst } = await supabase
        .from('instancias').select('empresa_id')
        .eq('token', nmToken).eq('ativo', true).maybeSingle()
      nmEmpresaId = nmInst?.empresa_id

      if (!nmEmpresaId && nmOwnerPhone.length >= 8) {
        const { data: nmInstByPhone } = await supabase
          .from('instancias').select('empresa_id')
          .eq('ativo', true).like('numero_telefone', `%${nmOwnerPhone.slice(-10)}`).maybeSingle()
        nmEmpresaId = nmInstByPhone?.empresa_id
      }
      nmEmpresaId = nmEmpresaId ?? process.env.UAZAPI_EMPRESA_ID

      if (nmEmpresaId) {
        const nmFileUrl = await baixarMidiaUazapi(msg.messageid, msg?.mediaType ?? nmTipoRaw)
        const nmMediaContent = typeof msg?.content === 'object' && msg.content !== null
          ? msg.content as UazapiMediaContent : null

        if (nmFileUrl) {
          // Tenta lookup com e sem DDI 55 para cobrir variações de armazenamento
          const nmTelDigits = nmClientPhone.replace(/\D/g, '')
          const nmTelAlt = nmTelDigits.startsWith('55') && nmTelDigits.length > 11
            ? nmTelDigits.slice(2) : `55${nmTelDigits}`
          const nmTelVariantes = nmTelAlt === nmTelDigits ? [nmTelDigits] : [nmTelDigits, nmTelAlt]
          const { data: convNM } = await supabase
            .from('conversas').select('id')
            .eq('empresa_id', nmEmpresaId).eq('canal', 'whatsapp')
            .in('contato_telefone', nmTelVariantes).maybeSingle()
          if (convNM) {
            try {
              const nmPessoaId = await buscarOuCriarPessoa(nmEmpresaId, nmClientPhone, 'Cliente')
              await salvarDocumentoCliente({
                empresa_id: nmEmpresaId,
                pessoa_id: nmPessoaId,
                conversa_id: convNM.id,
                fileUrl: nmFileUrl,
                fileName: nmMediaContent?.fileName ?? null,
                mimeType: nmMediaContent?.mimetype ?? null,
              })
            } catch (err) {
              console.error('[fromMe-midia] Erro ao salvar doc:', err)
            }
          }
        }
      }
    }
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
  const textoParaFonti = texto.trim().slice(0, 20)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') + texto.trim().slice(20)

  // ── Operadores internos: bloquear antes de chegar ao bot de cliente ──────────
  // Mensagens sem '*' de usuários internos são sempre contexto de workflow pendente
  // ou mensagens informais. NUNCA devem ser processadas pelo bot de atendimento.
  if (!textoParaFonti.startsWith('*')) {
    const { verificarUsuarioInterno, processarRespostaPendente } = await import('@/lib/bot/fonti-comandos')
    const usuarioInterno = await verificarUsuarioInterno(supabase, empresa_id, telefone)

    if (usuarioInterno) {
      // Verifica resposta de follow-up (1/2/3) antes do simula pendente
      const { processarRespostaFollowup } = await import('@/lib/leads/followup')
      const respostaFollowup = await processarRespostaFollowup(
        texto.trim(), usuarioInterno.id, usuarioInterno.nome, empresa_id, supabase
      )
      if (respostaFollowup !== null) {
        await enviarMensagemUazapi(telefone, respostaFollowup, instanciaToken)
        return NextResponse.json({ ok: true })
      }

      const { buscarSimulaPendente } = await import('@/lib/workflows/simula-pendente')
      const pendente = await buscarSimulaPendente(supabase, empresa_id, telefone)

      if (pendente) {
        const resposta = await processarRespostaPendente(texto.trim(), pendente, {
          empresa_id,
          telefone_remetente: telefone,
          supabase,
          arquivos: fileUrl
            ? [{ fileUrl, fileName: mediaContent?.fileName ?? null, mimeType: mediaContent?.mimetype ?? null }]
            : [],
          instancia_token: instanciaToken,
          telefone_destino: telefone,
        }, usuarioInterno)
        if (resposta !== null) {
          await enviarMensagemUazapi(telefone, resposta)
        }
      } else if (isMidia && fileUrl) {
        // Mídia solta, sem pendência de simulação ativa: só persiste se houver uma sessão
        // *fonti inicio* aberta pra este telefone (fonti_marcas) — é o sinal explícito de
        // "documentos do cliente virão a seguir, feche depois com *cria cliente". Sem essa
        // marca, ignora (evita salvar qualquer mídia solta enviada ao número do bot).
        //
        // Bug corrigido jul/2026: antes deste bloco, mídia enviada aqui (ex.: PDFs/fotos
        // do cliente logo após *inicio) era baixada do Uazapi (`fileUrl` acima) e depois
        // simplesmente descartada — nunca chegava a `documentos`, então o `*cria cliente`
        // não tinha nada pra vincular (etapa 5 de workflow-captacao.ts já sabia procurar
        // por `pessoa_id` + janela de `fonti_marcas.iniciado_at`, mas nunca havia doc
        // salvo com esse pessoa_id pra encontrar).
        const { data: marcaAtiva } = await supabase
          .from('fonti_marcas')
          .select('iniciado_at')
          .eq('empresa_id', empresa_id)
          .eq('telefone_conversa', telefone)
          .maybeSingle()

        if (marcaAtiva) {
          try {
            const pessoaIdDoc = await buscarOuCriarPessoa(empresa_id, telefone, nomeContato ?? 'Cliente')

            const { data: convExistente } = await supabase
              .from('conversas')
              .select('id')
              .eq('empresa_id', empresa_id)
              .eq('canal', 'whatsapp')
              .eq('contato_telefone', telefone)
              .maybeSingle()

            let conversaIdDoc = convExistente?.id as string | undefined
            if (!conversaIdDoc) {
              const { data: novaConv } = await supabase
                .from('conversas')
                .insert({
                  empresa_id,
                  canal: 'whatsapp',
                  contato_telefone: telefone,
                  contato_nome: nomeContato ?? null,
                  pessoa_id: pessoaIdDoc,
                  status: 'humano',
                  bot_ativo: false,
                  instancia_id: instancia_id ?? undefined,
                })
                .select('id')
                .single()
              conversaIdDoc = novaConv?.id
            } else {
              await supabase.from('conversas').update({ pessoa_id: pessoaIdDoc }).eq('id', conversaIdDoc)
            }

            if (conversaIdDoc) {
              await salvarDocumentoCliente({
                empresa_id,
                pessoa_id: pessoaIdDoc,
                conversa_id: conversaIdDoc,
                fileUrl,
                fileName: mediaContent?.fileName ?? null,
                mimeType: mediaContent?.mimetype ?? null,
              })
            }
          } catch (err) {
            console.error('[whatsapp-webhook] Erro ao salvar documento da sessão *fonti inicio:', err)
          }
        }
      } else {
        // Sem pendência ativa — antes de descartar, verifica se a mensagem tem "cara"
        // de dados de simulação (nome + intenção clara), mesma regra do *cria cliente.
        // Pré-filtro barato evita gastar uma chamada LLM em mensagens triviais.
        const textoNatural = texto.trim()
        if (textoNatural.length > 15 && /\d/.test(textoNatural)) {
          const { normalizarPedidoSimulacao } = await import('@/lib/workflows/normalizador-captacao')
          const { deveDispararSimulacao } = await import('@/lib/workflows/motor-simulacao')
          const dadosCandidatos = await normalizarPedidoSimulacao(textoNatural)
          const decisao = deveDispararSimulacao(dadosCandidatos)

          if (dadosCandidatos.nome && decisao.deveSimular) {
            const { executarWorkflowCaptacao } = await import('@/lib/workflows/workflow-captacao')
            const resposta = await executarWorkflowCaptacao('', {
              empresa_id,
              usuario_id: usuarioInterno.id,
              usuario_nome: usuarioInterno.nome,
              supabase,
              telefone_remetente: telefone,
              telefone_operador: telefone,
              instancia_token: instanciaToken,
              telefone_destino: telefone,
              arquivos: fileUrl
                ? [{ fileUrl, fileName: mediaContent?.fileName ?? null, mimeType: mediaContent?.mimetype ?? null }]
                : [],
              forcar_simulacao: true,
              dados_pre_normalizados: dadosCandidatos,
            })
            await enviarMensagemUazapi(telefone, resposta)
          }
          // Sem nome+intenção: mensagem informal — ignorar silenciosamente, como hoje.
        }
      }
      return NextResponse.json({ ok: true })
    }
  }

  if (/^\*(?:fonti|in[íi]cio|criar?\s+cliente|salvar?|atualizar?|processo|simula(?:r|[cç][aã]o)?|cancelar?)\b/i.test(textoParaFonti)) {
    const respostaFonti = await processarComandoFonti(textoParaFonti.trim(), {
      empresa_id,
      telefone_remetente: telefone,
      supabase,
      arquivos: fileUrl
        ? [{ fileUrl, fileName: mediaContent?.fileName ?? null, mimeType: mediaContent?.mimetype ?? null }]
        : [],
      instancia_token: instanciaToken,
      telefone_destino: telefone,
    })

    if (respostaFonti !== null) {
      await enviarMensagemUazapi(telefone, respostaFonti)
    } else {
      // Remetente não é usuário interno — pode ser eco do Uazapi da mensagem do operador.
      // NUNCA cai no fluxo do bot para não confundir o atendimento ao cliente.
      console.warn('[fonti] Prefixo *fonti detectado mas remetente NAO é usuario interno. telefone:', telefone)
    }
    return NextResponse.json({ ok: true })
  }

  // ECO: Uazapi às vezes ecoa mensagens enviadas pelo operador como se fossem não-fromMe.
  // Se o telefone do remetente for uma instância CRM registrada, ignora para não acionar o bot.
  const telefoneSufixo = telefone.slice(-10)
  const { data: ehInstanciaEco } = await supabase
    .from('instancias')
    .select('id')
    .eq('empresa_id', empresa_id)
    .like('numero_telefone', `%${telefoneSufixo}`)
    .eq('ativo', true)
    .maybeSingle()
  if (ehInstanciaEco) {
    console.log('[whatsapp] eco de instância CRM ignorado, telefone:', telefone)
    return NextResponse.json({ ok: true })
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

  let { data: conversaExistente } = await supabase
    .from('conversas')
    .select('id, bot_ativo, lead_id, bot_estado, bot_dados')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .eq('contato_telefone', telefone)
    .maybeSingle()

  // Fallback por sufixo: conversas criadas antes da normalização do prefixo 55
  // podem ter o telefone sem o código do país (ex: "44984558946" vs "5544984558946").
  // Se não encontrou por exato, tenta os últimos 11 dígitos e normaliza o número.
  if (!conversaExistente) {
    const sufixo = telefone.slice(-11)
    const { data: convSufixo } = await supabase
      .from('conversas')
      .select('id, bot_ativo, lead_id, bot_estado, bot_dados')
      .eq('empresa_id', empresa_id)
      .eq('canal', 'whatsapp')
      .like('contato_telefone', `%${sufixo}`)
      .maybeSingle()
    if (convSufixo) {
      // Auto-normaliza para evitar buscas por sufixo nas próximas mensagens
      await supabase.from('conversas').update({ contato_telefone: telefone }).eq('id', convSufixo.id)
      conversaExistente = convSufixo
      console.log('[whatsapp] conversa normalizada pelo sufixo:', sufixo, '→', telefone)
    }
  }

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
  const { data: mensagemInserida } = await supabase.from('mensagens').insert({
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
  }).select('id').single()

  // Auto-save de arquivos no Supabase Storage (fora do bot — salva sempre)
  // await garante que o registro existe no banco antes de retornar (vincular do *fonti depende disso)
  // pessoaId só fica null se buscarOuCriarPessoa falhou acima (já logado) — sem pessoa
  // resolvível não há como gravar no acervo documental (constraint exige pessoa_id).
  if (isMidia && fileUrl && pessoaId) {
    await salvarDocumentoCliente({
      empresa_id,
      pessoa_id: pessoaId,
      lead_id: leadIdVinculo,
      conversa_id,
      mensagem_id: mensagemInserida?.id ?? null,
      fileUrl,
      fileName: mediaContent?.fileName ?? null,
      mimeType: mediaContent?.mimetype ?? null,
    }).catch((err: unknown) => console.error('[whatsapp] Erro ao salvar documento:', err))
  }

  // Se humano assumiu, ou é mídia sem legenda, não responde com bot
  if (!bot_ativo || (isMidia && !texto.trim())) {
    return NextResponse.json({ ok: true })
  }

  // ECO: detecta se esta mensagem foi enviada pelo próprio sistema/bot recentemente
  // Evita que respostas do *fonti (ex: "❌ Processo não encontrado") sejam reprocessadas
  // como input do cliente quando o Uazapi reflete a mensagem de volta
  if (texto.trim()) {
    const { data: ecoSistema } = await supabase.from('mensagens')
      .select('id')
      .eq('conversa_id', conversa_id)
      .in('origem', ['bot', 'sistema'])
      .eq('conteudo', texto.trim())
      .gte('created_at', new Date(Date.now() - 30000).toISOString())
      .limit(1).maybeSingle()
    if (ecoSistema) {
      console.log('[whatsapp] eco de sistema detectado e ignorado:', texto.slice(0, 60))
      return NextResponse.json({ ok: true })
    }
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

  // Bot sinalizou que coletou dados suficientes (CONCLUIDO) → marca conversa como qualificada
  // O Lead NÃO é criado automaticamente — o operador cria via *fonti cria lead
  if (transicao.criarLead) {
    const { nome, cpf, data_nascimento } = transicao.novosDados

    if (nome) {
      try {
        await supabase.from('conversas').update({
          status: 'qualificado',
          contato_nome: nome,
          ...(pessoaId ? { pessoa_id: pessoaId } : {}),
        }).eq('id', conversa_id)

        // Confirma identidade e enriquece Pessoa com CPF/data_nascimento coletados
        if (pessoaId) {
          await confirmarIdentidadePessoa(pessoaId, nome)

          const camposExtras: Record<string, unknown> = {}
          if (cpf)             camposExtras.cpf             = cpf
          if (data_nascimento) camposExtras.data_nascimento = data_nascimento

          if (Object.keys(camposExtras).length > 0) {
            await supabase.from('pessoas').update(camposExtras).eq('id', pessoaId)
          }
        }
      } catch (err) {
        console.error('[whatsapp] Erro ao atualizar conversa/pessoa após coleta de dados:', err)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
