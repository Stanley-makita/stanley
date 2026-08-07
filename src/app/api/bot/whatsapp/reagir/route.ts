import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabaseService } from '@/lib/supabase/admin'
import { resolverInstanceToken } from '@/lib/workflows/uazapi-helpers'

// Reage a uma mensagem com um emoji via Uazapi (POST /message/react) — reação real,
// visível no WhatsApp do cliente, não só um badge local. Emoji vazio remove a reação.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabaseService
    .from('usuarios')
    .select('id, empresa_id')
    .eq('id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  let body: { conversa_id: string; mensagem_id: string; telefone: string; emoji: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { conversa_id, mensagem_id, telefone, emoji } = body
  if (!conversa_id || !mensagem_id || !telefone) {
    return NextResponse.json({ error: 'conversa_id, mensagem_id e telefone são obrigatórios' }, { status: 422 })
  }

  // Verifica que a conversa pertence à empresa do atendente
  const { data: conversa } = await supabaseService
    .from('conversas')
    .select('id')
    .eq('id', conversa_id)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  const { data: mensagem } = await supabaseService
    .from('mensagens')
    .select('id, metadata')
    .eq('id', mensagem_id)
    .eq('conversa_id', conversa_id)
    .single()
  if (!mensagem) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })

  const uazapiMessageId = (mensagem.metadata as { uazapi_message_id?: string } | null)?.uazapi_message_id
  if (!uazapiMessageId) {
    return NextResponse.json({ error: 'Esta mensagem é antiga e não tem ID do WhatsApp — não é possível reagir a ela.' }, { status: 422 })
  }

  const instanceToken = await resolverInstanceToken(supabaseService, conversa_id)

  // Grupo: `telefone` aqui é o JID do grupo (contato_grupo_id) — não pode passar
  // pela normalização de telefone BR, que destruiria o JID.
  const ehGrupo = telefone.includes('@g.us')
  const telRaw = telefone.replace(/\D/g, '')
  const telEnvio = ehGrupo
    ? telefone
    : (telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw)

  const res = await fetch(`${process.env.UAZAPI_API_URL}/message/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'token': instanceToken },
    body: JSON.stringify({ number: telEnvio, id: uazapiMessageId, text: emoji ?? '' }),
  })
  if (!res.ok) {
    console.error('[reagir] Uazapi /message/react falhou:', res.status, await res.text())
    return NextResponse.json({ error: 'Falha ao enviar reação. Tente novamente.' }, { status: 502 })
  }

  const novoMetadata = { ...(mensagem.metadata as Record<string, unknown> ?? {}), reacao: emoji || null }
  await supabaseService.from('mensagens').update({ metadata: novoMetadata }).eq('id', mensagem_id)

  return NextResponse.json({ ok: true })
}
