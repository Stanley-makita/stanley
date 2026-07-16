import type { SupabaseClient } from '@supabase/supabase-js'

// Extraído de src/app/api/bot/whatsapp/send/route.ts (comportamento idêntico, sem mudança de
// lógica) pra ser reaproveitado também pelo endpoint da Central de Comunicação
// (src/app/api/processos/[id]/atualizar-cliente/route.ts), sem duplicar a chamada à Uazapi
// nem a gravação em `mensagens`.

export type TipoMidiaEnvio = 'text' | 'image' | 'video' | 'audio' | 'document' | 'ptt'

const UAZAPI_TIPO_MAP: Record<TipoMidiaEnvio, string> = {
  text:     'text',
  image:    'image',
  video:    'video',
  audio:    'audio',
  document: 'document',
  ptt:      'ptt',
}

async function enviarUazapi(telefone: string, tipo: TipoMidiaEnvio, instanceToken: string, texto?: string, arquivo?: string, nomeArquivo?: string) {
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

export interface EnviarMensagemHumanoParams {
  supabase: SupabaseClient
  conversaId: string
  telefone: string
  tipo: TipoMidiaEnvio
  texto?: string
  arquivo?: string
  nomeArquivo?: string
  usuarioId: string
  usuarioNome: string
}

export type EnviarMensagemHumanoResultado =
  | { ok: true; messageId?: string; mensagemId: string | null }
  | { ok: false; status: number; error: string }

export async function enviarMensagemHumano(params: EnviarMensagemHumanoParams): Promise<EnviarMensagemHumanoResultado> {
  const { supabase, conversaId, telefone, tipo, texto, arquivo, nomeArquivo, usuarioId, usuarioNome } = params

  // Resolve token da instância correta (fallback para env se não tiver instância vinculada)
  const { data: conversa } = await supabase
    .from('conversas')
    .select('instancia_id')
    .eq('id', conversaId)
    .single()

  let instanceToken = process.env.UAZAPI_INSTANCE_TOKEN ?? ''
  if (conversa?.instancia_id) {
    const { data: instancia } = await supabase
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

  let uazapiResult
  try {
    uazapiResult = await enviarUazapi(telEnvio, tipo, instanceToken, texto, arquivo, nomeArquivo)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[enviarMensagemHumano] Erro Uazapi:', detail)
    const msg = detail.includes('not on WhatsApp')
      ? `Número ${telEnvio} não está no WhatsApp. Verifique se o telefone está correto (com DDD).`
      : 'Falha ao enviar mensagem. Tente novamente.'
    return { ok: false, status: 502, error: msg }
  }

  const conteudo = texto ?? ''

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

  const { data: mensagemInserida } = await supabase.from('mensagens').insert({
    conversa_id: conversaId,
    origem: 'humano',
    conteudo,
    usuario_id: usuarioId,
    metadata: {
      tipo_midia: tipo !== 'text' ? tipo : undefined,
      file_url: fileUrl,
      uazapi_message_id: uazapiResult?.messageid ?? null,
      nome_arquivo: nomeArquivo ?? null,
      atendente: usuarioNome,
    },
  }).select('id').single()

  // Atualiza updated_at e cura contato_telefone se estava sem prefixo 55
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (telEnvio !== telRaw) updatePayload.contato_telefone = telEnvio
  await supabase
    .from('conversas')
    .update(updatePayload)
    .eq('id', conversaId)

  return { ok: true, messageId: uazapiResult?.messageid, mensagemId: mensagemInserida?.id ?? null }
}
