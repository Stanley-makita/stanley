import type { SupabaseClient } from '@supabase/supabase-js'

// Espelha enviarMensagemHumano.ts (WhatsApp/Uazapi), mas pro Instagram —
// escopo atual: só texto (mesma limitação do webhook de recebimento em
// src/app/api/instagram/webhook/route.ts, que também só trata `message.text`).
// Sem suporte a mídia/áudio/citação por enquanto.

const INSTAGRAM_PAGE_ACCESS_TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ?? ''

// App usa o produto "API do Instagram com login do Instagram" (não Facebook
// Login) — API própria em graph.instagram.com, não graph.facebook.com.
const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com/v21.0/me/messages'

async function enviarInstagram(destinatarioId: string, texto: string): Promise<{ message_id?: string }> {
  if (!INSTAGRAM_PAGE_ACCESS_TOKEN) {
    throw new Error('INSTAGRAM_PAGE_ACCESS_TOKEN não configurado')
  }

  const res = await fetch(INSTAGRAM_GRAPH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${INSTAGRAM_PAGE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      recipient: { id: destinatarioId },
      message: { text: texto },
    }),
  })

  if (!res.ok) {
    throw new Error(`Instagram send: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export interface EnviarMensagemInstagramParams {
  supabase: SupabaseClient
  conversaId: string
  /** sender_id do Instagram, salvo em conversas.contato_telefone (mesma convenção do chat do site) */
  destinatarioId: string
  texto: string
  usuarioId: string
  usuarioNome: string
}

export type EnviarMensagemInstagramResultado =
  | { ok: true; messageId?: string; mensagemId: string | null }
  | { ok: false; status: number; error: string }

export async function enviarMensagemInstagram(params: EnviarMensagemInstagramParams): Promise<EnviarMensagemInstagramResultado> {
  const { supabase, conversaId, destinatarioId, texto, usuarioId, usuarioNome } = params

  let resultado: { message_id?: string }
  try {
    resultado = await enviarInstagram(destinatarioId, texto)
  } catch (err) {
    console.error('[enviarMensagemInstagram] Erro:', err instanceof Error ? err.message : err)
    return { ok: false, status: 502, error: 'Falha ao enviar mensagem pelo Instagram. Tente novamente.' }
  }

  const { data: mensagemInserida } = await supabase.from('mensagens').insert({
    conversa_id: conversaId,
    origem: 'humano',
    conteudo: texto,
    usuario_id: usuarioId,
    metadata: {
      atendente: usuarioNome,
      instagram_message_id: resultado.message_id ?? null,
    },
  }).select('id').single()

  await supabase.from('conversas').update({ updated_at: new Date().toISOString() }).eq('id', conversaId)

  return { ok: true, messageId: resultado.message_id, mensagemId: mensagemInserida?.id ?? null }
}
