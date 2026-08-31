import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

// Recebe DMs do Instagram via Meta Graph API (webhook de "Instagram messaging").
// Escopo atual: apenas REGISTRA a conversa e cria/atualiza o Lead — não há bot
// respondendo automaticamente aqui (diferente do WhatsApp/site). Um humano
// responde pela tela de Conversas do CRM.
//
// URL de callback a cadastrar no Meta for Developers:
//   https://fonti.app.br/api/instagram/webhook?empresa_id=<uuid da empresa>
// (o empresa_id vai na query string porque o Meta chama sempre a mesma URL
// fixa — sem isso não teríamos como saber de qual empresa é a mensagem)
//
// "Verificar token" no painel do Meta = mesmo valor de WEBHOOK_SECRET.

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? ''
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET ?? ''
const INSTAGRAM_PAGE_ACCESS_TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ?? ''

interface InstagramMessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: { mid: string; text?: string; is_echo?: boolean }
}

interface InstagramWebhookBody {
  object: string
  entry: Array<{
    id: string
    time: number
    messaging?: InstagramMessagingEvent[]
  }>
}

function assinaturaValida(rawBody: string, assinaturaHeader: string | null): boolean {
  if (!INSTAGRAM_APP_SECRET || !assinaturaHeader) return false
  const esperada = 'sha256=' + createHmac('sha256', INSTAGRAM_APP_SECRET).update(rawBody).digest('hex')
  const a = Buffer.from(assinaturaHeader)
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Best-effort: busca nome/username do perfil pra não criar o lead como
// "Contato Instagram" genérico. Se não tiver token configurado ainda (setup
// em andamento) ou a chamada falhar, segue com o nome placeholder.
async function buscarNomePerfil(senderId: string): Promise<string | null> {
  if (!INSTAGRAM_PAGE_ACCESS_TOKEN) return null
  try {
    const url = `https://graph.facebook.com/v21.0/${senderId}?fields=name,username&access_token=${INSTAGRAM_PAGE_ACCESS_TOKEN}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { name?: string; username?: string }
    return data.name ?? data.username ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const assinatura = request.headers.get('x-hub-signature-256')

  if (!assinaturaValida(rawBody, assinatura)) {
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }

  const empresa_id = request.nextUrl.searchParams.get('empresa_id')
  if (!empresa_id) {
    console.error('[instagram-webhook] empresa_id ausente na URL de callback')
    return NextResponse.json({ error: 'empresa_id ausente' }, { status: 400 })
  }

  let body: InstagramWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  for (const entry of body.entry ?? []) {
    for (const evento of entry.messaging ?? []) {
      const texto = evento.message?.text
      // Ignora eco da própria conta (nossas respostas) e eventos sem texto
      // (reação, "visualizado", anexo sem legenda, etc.)
      if (!texto || evento.message?.is_echo) continue

      const senderId = evento.sender.id

      try {
        await registrarMensagemInstagram(empresa_id, senderId, texto)
      } catch (err) {
        console.error('[instagram-webhook] Erro ao processar mensagem:', err)
      }
    }
  }

  return NextResponse.json({ success: true })
}

async function registrarMensagemInstagram(empresa_id: string, senderId: string, texto: string) {
  const { data: conversaExistente } = await supabase
    .from('conversas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'instagram')
    .eq('contato_telefone', senderId)
    .maybeSingle()

  let conversaId: string

  if (conversaExistente) {
    conversaId = conversaExistente.id
  } else {
    const nomePerfil = await buscarNomePerfil(senderId)

    const { data: novaConversa, error } = await supabase
      .from('conversas')
      .insert({
        empresa_id,
        canal: 'instagram',
        contato_telefone: senderId,
        contato_nome: nomePerfil,
        bot_ativo: false,
        status: 'humano',
      })
      .select('id')
      .single()

    if (error || !novaConversa) {
      console.error('[instagram-webhook] Erro ao criar conversa:', error)
      return
    }
    conversaId = novaConversa.id

    // Primeira mensagem desse contato: cria o Lead via o webhook central
    // (mesma dedup por pessoa/telefone usada por WhatsApp/site/Facebook),
    // usando o sender_id do Instagram no lugar do telefone real — mesma
    // convenção já usada pelo chat do site com session_id.
    const webhookUrl = new URL('/api/leads/webhook', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    webhookUrl.searchParams.set('source', 'instagram')

    const resposta = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({
        nome: nomePerfil ?? 'Contato Instagram',
        telefone: senderId,
        empresa_id,
        origem: 'instagram',
        observacoes: `Primeira mensagem via Instagram: "${texto}"`,
      }),
    })

    if (resposta.ok) {
      const { lead_id } = (await resposta.json()) as { lead_id?: string }
      if (lead_id) {
        await supabase.from('conversas').update({ lead_id }).eq('id', conversaId)
      }
    } else {
      console.error('[instagram-webhook] Erro ao criar lead:', await resposta.text())
    }
  }

  await supabase.from('mensagens').insert({
    conversa_id: conversaId,
    origem: 'cliente',
    conteudo: texto,
  })
}

// GET para validação de webhook (Meta exige isso ao cadastrar a URL de callback)
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === WEBHOOK_SECRET) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
