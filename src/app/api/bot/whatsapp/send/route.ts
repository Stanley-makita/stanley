import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type TipoMidia = 'text' | 'image' | 'video' | 'audio' | 'document' | 'ptt'

const UAZAPI_TIPO_MAP: Record<TipoMidia, string> = {
  text:     'text',
  image:    'image',
  video:    'video',
  audio:    'audio',
  document: 'document',
  ptt:      'ptt',
}

async function enviarUazapi(telefone: string, tipo: TipoMidia, instanceToken: string, texto?: string, arquivo?: string, nomeArquivo?: string) {
  if (tipo === 'text') {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify({ number: telefone, text: texto, track_source: 'crm-humano', delay: 800 }),
    })
    if (!res.ok) throw new Error(`Uazapi send/text: ${res.status} ${await res.text()}`)
    return res.json()
  }

  const body: Record<string, unknown> = {
    number: telefone,
    type: UAZAPI_TIPO_MAP[tipo],
    file: arquivo,
    track_source: 'crm-humano',
  }
  if (texto)       body.text = texto
  if (nomeArquivo) body.docName = nomeArquivo

  const res = await fetch(`${process.env.UAZAPI_API_URL}/send/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'token': instanceToken },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Uazapi send/media: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function POST(request: NextRequest) {
  // Autentica via Bearer token (enviado pelo cliente)
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) {
    console.error('[send] Auth error:', authError?.message)
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: usuario } = await supabaseService
    .from('usuarios')
    .select('empresa_id, nome')
    .eq('id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  let body: {
    conversa_id: string
    telefone: string
    tipo: TipoMidia
    texto?: string
    arquivo?: string
    nome_arquivo?: string
  }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { conversa_id, telefone, tipo, texto, arquivo, nome_arquivo } = body

  if (!conversa_id || !telefone || !tipo) {
    return NextResponse.json({ error: 'conversa_id, telefone e tipo são obrigatórios' }, { status: 422 })
  }
  if (tipo === 'text' && !texto?.trim()) {
    return NextResponse.json({ error: 'texto é obrigatório para tipo text' }, { status: 422 })
  }
  if (tipo !== 'text' && !arquivo) {
    return NextResponse.json({ error: 'arquivo é obrigatório para mídias' }, { status: 422 })
  }
  // Limite de tamanho no backend (~25MB em base64)
  if (arquivo && arquivo.length > 35_000_000) {
    return NextResponse.json({ error: 'Arquivo muito grande. Reduza o tamanho antes de enviar.' }, { status: 413 })
  }

  // Verifica que a conversa pertence à empresa do atendente e busca instância
  const { data: conversa } = await supabaseService
    .from('conversas')
    .select('id, instancia_id')
    .eq('id', conversa_id)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  // Resolve token da instância correta (fallback para env se não tiver instância vinculada)
  let instanceToken = process.env.UAZAPI_INSTANCE_TOKEN ?? ''
  if (conversa.instancia_id) {
    const { data: instancia } = await supabaseService
      .from('instancias')
      .select('token')
      .eq('id', conversa.instancia_id)
      .eq('ativo', true)
      .maybeSingle()
    if (instancia?.token) instanceToken = instancia.token
  }

  // Normaliza número: garante prefixo 55 para números brasileiros
  const telRaw = telefone.replace(/\D/g, '')
  const telEnvio = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  // Envia via Uazapi
  let uazapiResult
  try {
    uazapiResult = await enviarUazapi(telEnvio, tipo, instanceToken, texto, arquivo, nome_arquivo)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[send] Erro Uazapi:', detail)
    const msg = detail.includes('not on WhatsApp')
      ? `Número ${telEnvio} não está no WhatsApp. Verifique se o telefone do lead está correto (com DDD).`
      : 'Falha ao enviar mensagem. Tente novamente.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Salva no histórico
  const conteudo = tipo === 'text' ? (texto ?? '') : (texto ?? '')

  // Tenta obter URL pública do arquivo enviado
  let fileUrl: string | null = uazapiResult?.fileURL ?? null
  if (!fileUrl && uazapiResult?.messageid && tipo !== 'text') {
    try {
      const dlRes = await fetch(`${process.env.UAZAPI_API_URL}/message/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instanceToken },
        body: JSON.stringify({
          id: uazapiResult.messageid,
          return_link: true,
          generate_mp3: tipo === 'ptt' || tipo === 'audio',
        }),
      })
      if (dlRes.ok) {
        const dlData = await dlRes.json()
        fileUrl = dlData.fileURL ?? null
      }
    } catch { /* não bloqueia o envio */ }
  }

  await supabaseService.from('mensagens').insert({
    conversa_id,
    origem: 'humano',
    conteudo,
    metadata: {
      tipo_midia: tipo !== 'text' ? tipo : undefined,
      file_url: fileUrl,
      uazapi_message_id: uazapiResult?.messageid ?? null,
      nome_arquivo: nome_arquivo ?? null,
      atendente: usuario.nome,
    },
  })

  // Atualiza updated_at e cura contato_telefone se estava sem prefixo 55
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (telEnvio !== telRaw) updatePayload.contato_telefone = telEnvio
  await supabaseService
    .from('conversas')
    .update(updatePayload)
    .eq('id', conversa_id)

  return NextResponse.json({ ok: true, message_id: uazapiResult?.messageid })
}
