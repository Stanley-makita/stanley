import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverInstanceToken } from '@/lib/workflows/uazapi-helpers'

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

async function enviarUazapi(telefone: string, tipo: TipoMidiaEnvio, instanceToken: string, texto?: string, arquivo?: string, nomeArquivo?: string, replyId?: string) {
  if (tipo === 'text') {
    const body: Record<string, unknown> = { number: telefone, text: texto, track_source: 'crm-humano', delay: 800 }
    if (replyId) body.replyid = replyId

    const res = await fetch(`${process.env.UAZAPI_API_URL}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify(body),
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
  if (replyId)     body.replyid = replyId

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
  /** ID da mensagem (na Uazapi) a que esta responde — vira citação real no WhatsApp do cliente. */
  replyId?: string
  /** Prévia (autor + trecho) da mensagem respondida, só pra exibir a citação na bolha do Fonti. */
  replyPreview?: { autor: string; texto: string }
}

export type EnviarMensagemHumanoResultado =
  | { ok: true; messageId?: string; mensagemId: string | null }
  | { ok: false; status: number; error: string }

export async function enviarMensagemHumano(params: EnviarMensagemHumanoParams): Promise<EnviarMensagemHumanoResultado> {
  const { supabase, conversaId, telefone, tipo, texto, arquivo, nomeArquivo, usuarioId, usuarioNome, replyId, replyPreview } = params

  // Resolve token da instância correta (fallback para env se não tiver instância vinculada)
  const instanceToken = await resolverInstanceToken(supabase, conversaId)

  // Grupo: `telefone` aqui é na verdade o JID do grupo (contato_grupo_id, ex.:
  // "1203...@g.us") — não é um telefone BR, não pode passar pela normalização
  // de dígitos (isso destruiria o JID) nem pela "cura" de contato_telefone abaixo.
  const ehGrupo = telefone.includes('@g.us')

  // Normaliza número: garante prefixo 55 para números brasileiros
  const telRaw = telefone.replace(/\D/g, '')
  const telEnvio = ehGrupo
    ? telefone
    : (telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw)

  // Assinatura visível no WhatsApp de verdade só em grupo — numa conversa 1:1 o
  // cliente já sabe que fala com a empresa, mas num grupo com várias pessoas da
  // equipe (e do cliente) ninguém sabe quem digitou sem essa marca. O rótulo que
  // já aparece na bolha do Fonti (metadata.atendente) continua vindo do texto
  // original, sem prefixo — só o que vai pro WhatsApp leva a assinatura.
  const textoParaEnvio = ehGrupo && texto ? `*${usuarioNome}:*\n${texto}` : texto

  let uazapiResult
  try {
    uazapiResult = await enviarUazapi(telEnvio, tipo, instanceToken, textoParaEnvio, arquivo, nomeArquivo, replyId)
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
      reply_preview: replyPreview ?? undefined,
    },
  }).select('id').single()

  // Atualiza updated_at e cura contato_telefone se estava sem prefixo 55
  // (nunca em grupo — lá quem identifica a conversa é contato_grupo_id)
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (!ehGrupo && telEnvio !== telRaw) updatePayload.contato_telefone = telEnvio
  await supabase
    .from('conversas')
    .update(updatePayload)
    .eq('id', conversaId)

  return { ok: true, messageId: uazapiResult?.messageid, mensagemId: mensagemInserida?.id ?? null }
}
