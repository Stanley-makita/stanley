import type { SupabaseClient } from '@supabase/supabase-js'

// Espelha enviarMensagemHumano.ts (WhatsApp/Uazapi), mas pro Instagram —
// escopo atual: só texto (mesma limitação do webhook de recebimento em
// src/app/api/instagram/webhook/route.ts, que também só trata `message.text`).
// Sem suporte a mídia/áudio/citação por enquanto.

const INSTAGRAM_PAGE_ACCESS_TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ?? ''

// App usa o produto "API do Instagram com login do Instagram" (não Facebook
// Login) — API própria em graph.instagram.com, não graph.facebook.com.
const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com/v21.0/me/messages'

// A Meta só deixa responder em até 24h depois da última mensagem do cliente
// (erro code 10, subcode 2534022). A tag HUMAN_AGENT estende pra 7 dias, mas só
// funciona com o recurso "Human Agent" aprovado no app — sem ele, a 2ª
// tentativa falha igual e o atendente recebe a explicação da janela.
const SUBCODE_FORA_DA_JANELA = 2534022

export const MENSAGEM_JANELA_FECHADA =
  'O Instagram só permite responder em até 24h depois da última mensagem do cliente. ' +
  'Aguarde ele escrever de novo para responder por aqui.'

export class ErroEnvioInstagram extends Error {
  constructor(readonly status: number, readonly corpo: string) {
    super(`Instagram send: ${status} ${corpo}`)
  }

  get foraDaJanela(): boolean {
    try {
      return JSON.parse(this.corpo)?.error?.error_subcode === SUBCODE_FORA_DA_JANELA
    } catch {
      return false
    }
  }
}

async function enviarInstagram(destinatarioId: string, texto: string, comTagHumanAgent = false): Promise<{ message_id?: string }> {
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
      ...(comTagHumanAgent ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    throw new ErroEnvioInstagram(res.status, await res.text())
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
    try {
      resultado = await enviarInstagram(destinatarioId, texto)
    } catch (err) {
      if (!(err instanceof ErroEnvioInstagram && err.foraDaJanela)) throw err
      resultado = await enviarInstagram(destinatarioId, texto, true)
    }
  } catch (err) {
    console.error('[enviarMensagemInstagram] Erro:', err instanceof Error ? err.message : err)
    if (err instanceof ErroEnvioInstagram && err.foraDaJanela) {
      return { ok: false, status: 422, error: MENSAGEM_JANELA_FECHADA }
    }
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
