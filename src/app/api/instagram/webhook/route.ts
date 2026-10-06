import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { NotificationService } from '@/lib/notificacoes/notificationService'
import { buscarDestinatariosAviso } from '@/lib/instagram/destinatariosAviso'

// Recebe DMs do Instagram via Meta Graph API (webhook de "Instagram messaging").
// Escopo: só REGISTRA a conversa e as mensagens e avisa quem atende — NÃO cria
// Lead nem Pessoa. Decisão (06/10/2026): qualquer "parabéns"/emoji/palminha
// virava Lead em Captação; agora quem atende lê a conversa e, se for cliente,
// cria o Lead pela tela de Conversas ("Vincular lead" → "Criar novo lead").
// Não há bot respondendo aqui (diferente do WhatsApp/site).
//
// Aviso (sino + toast + push): ver src/lib/instagram/destinatariosAviso.ts —
// dono da conversa, senão a lista de Configurações › Canais de Captação,
// senão admin/gestor.
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

// "Resposta do anúncio" — a Meta anexa este objeto ao evento de mensagem
// quando a conversa começou a partir de um clique num anúncio ou post
// promovido (é o que o app do Instagram mostra como "Resposta do anúncio ·
// Ver" no topo da conversa). Campos conforme a doc oficial de Instagram
// Messaging (referral de Ads That Click to Instagram Direct); alguns podem
// vir ausentes dependendo do tipo de anúncio — por isso tudo opcional.
// Formato ainda não confirmado 1:1 contra um payload real desta conta (ver
// log de diagnóstico em registrarMensagemInstagram) — se o Meta mandar
// campos com nomes diferentes, ajustar aqui depois de ver o log real.
interface InstagramReferral {
  ref?: string
  ad_id?: string
  source?: string
  type?: string
  ads_context_data?: {
    ad_title?: string
    photo_url?: string
    video_url?: string
    post_id?: string
  }
}

interface InstagramMessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: { mid: string; text?: string; is_echo?: boolean; referral?: InstagramReferral }
  referral?: InstagramReferral
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

// Best-effort: busca nome/username do perfil pra não mostrar a conversa como
// "Contato Instagram" genérico. Se não tiver token configurado ainda (setup
// em andamento) ou a chamada falhar, segue com o nome placeholder.
async function buscarNomePerfil(senderId: string): Promise<string | null> {
  if (!INSTAGRAM_PAGE_ACCESS_TOKEN) return null
  try {
    // App usa o produto "API do Instagram com login do Instagram" — API própria
    // em graph.instagram.com, não graph.facebook.com (mesmo host usado no envio,
    // ver enviarMensagemInstagram.ts). O token gerado nesse fluxo não é
    // reconhecido em graph.facebook.com.
    const url = `https://graph.instagram.com/v21.0/${senderId}?fields=name,username&access_token=${INSTAGRAM_PAGE_ACCESS_TOKEN}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.error('[instagram-webhook] Falha ao buscar perfil:', res.status, await res.text())
      return null
    }
    const data = (await res.json()) as { name?: string; username?: string }
    return data.name ?? data.username ?? null
  } catch (err) {
    console.error('[instagram-webhook] Erro ao buscar perfil:', err)
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

  // Kill switch em Configurações > Canais de Captação — se desativado, não
  // cria conversa nenhuma (evita poluir a tela em caso de spam).
  const { data: canaisConfig } = await supabase
    .from('canais_leads_config')
    .select('instagram_ativo')
    .eq('empresa_id', empresa_id)
    .maybeSingle()
  if (canaisConfig?.instagram_ativo === false) {
    return NextResponse.json({ success: true, ignored: true }, { status: 200 })
  }

  for (const entry of body.entry ?? []) {
    for (const evento of entry.messaging ?? []) {
      const texto = evento.message?.text
      // Ignora eco da própria conta (nossas respostas) e eventos sem texto
      // (reação, "visualizado", anexo sem legenda, etc.)
      if (!texto || evento.message?.is_echo) continue

      const senderId = evento.sender.id
      const referral = evento.referral ?? evento.message?.referral

      // Log de diagnóstico temporário — formato do referral ainda não
      // confirmado contra um payload real desta conta. Remover depois de
      // validar em produção que os campos abaixo (ads_context_data etc.)
      // batem com o que a Meta realmente envia.
      if (referral) {
        console.log('[instagram-webhook] Referral de anúncio recebido:', JSON.stringify(referral))
      }

      try {
        await registrarMensagemInstagram(empresa_id, senderId, texto, referral)
      } catch (err) {
        console.error('[instagram-webhook] Erro ao processar mensagem:', err)
      }
    }
  }

  return NextResponse.json({ success: true })
}

async function registrarMensagemInstagram(empresa_id: string, senderId: string, texto: string, referral?: InstagramReferral) {
  const { data: conversaExistente, error: erroBusca } = await supabase
    .from('conversas')
    .select('id, contato_nome, responsavel_avisos_id')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'instagram')
    .eq('contato_telefone', senderId)
    .maybeSingle()

  // Erro na busca (ex.: migration 338 não rodada) NÃO pode cair no "conversa
  // nova" — criaria uma conversa duplicada pro mesmo contato a cada mensagem.
  if (erroBusca) {
    console.error('[instagram-webhook] Erro ao buscar conversa:', erroBusca)
    return
  }

  let conversaId: string
  let nomeContato: string | null
  let responsavelAvisosId: string | null = null

  if (conversaExistente) {
    conversaId = conversaExistente.id
    nomeContato = conversaExistente.contato_nome
    responsavelAvisosId = conversaExistente.responsavel_avisos_id
  } else {
    nomeContato = await buscarNomePerfil(senderId)

    const { data: novaConversa, error } = await supabase
      .from('conversas')
      .insert({
        empresa_id,
        canal: 'instagram',
        contato_telefone: senderId,
        contato_nome: nomeContato,
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
  }

  await supabase.from('mensagens').insert({
    conversa_id: conversaId,
    origem: 'cliente',
    conteudo: texto,
    metadata: referral ? { referral_anuncio: referral } : null,
  })

  // Aviso fora do caminho da resposta à Meta: falha aqui nunca afeta a
  // mensagem já gravada acima.
  waitUntil(avisarMensagemInstagram(empresa_id, conversaId, nomeContato, responsavelAvisosId))
}

async function avisarMensagemInstagram(
  empresa_id: string,
  conversaId: string,
  nomeContato: string | null,
  responsavelAvisosId: string | null,
) {
  try {
    const destinatarios = await buscarDestinatariosAviso(supabase, empresa_id, responsavelAvisosId)
    const titulo = `Instagram: nova mensagem de ${nomeContato ?? 'contato'}`
    await Promise.all(
      destinatarios.map((usuarioId) =>
        NotificationService.notify(
          {
            usuarioId,
            tipo: 'mensagem_instagram',
            titulo,
            mensagem: titulo,
            entidade: 'conversa',
            entidadeId: conversaId,
            origem: 'webhook-instagram',
            viaServiceRole: true,
          },
          supabase,
        ),
      ),
    )
  } catch (err) {
    console.error('[instagram-webhook] erro ao avisar nova mensagem (mensagem já foi salva normalmente):', err)
  }
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
