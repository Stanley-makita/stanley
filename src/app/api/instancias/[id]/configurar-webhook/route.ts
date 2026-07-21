import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function resolveUsuario(token: string): Promise<{ empresa_id: string } | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ? { empresa_id: usuario.empresa_id } : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: instancia } = await supabase
    .from('instancias')
    .select('id, token')
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)
    .maybeSingle()

  if (!instancia) return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 })

  // Monta URL do webhook usando o host da requisição para funcionar em qualquer ambiente.
  // Precisa incluir ?token=UAZAPI_WEBHOOK_TOKEN — sem ele, o endpoint de
  // webhook responde 401 pra Uazapi e a instância nunca recebe mensagem.
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host  = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_APP_URL
    : `${proto}://${host}`
  const webhookToken = process.env.UAZAPI_WEBHOOK_TOKEN?.trim()
  if (!webhookToken) {
    return NextResponse.json({ error: 'UAZAPI_WEBHOOK_TOKEN não configurado' }, { status: 500 })
  }
  const webhookUrl = `${appUrl}/api/bot/whatsapp/webhook?token=${webhookToken}`

  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/webhook`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'token': instancia.token,
        'apikey': process.env.UAZAPI_API_KEY ?? '',
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: ['messages', 'messages_update', 'contacts', 'sender'],
        exclude: ['fromMeYes', 'isGroupYes'],
        addUrlEvents: false,
        addUrlTypesMessages: false,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.warn('[configurar-webhook] Uazapi retornou erro:', res.status, body)
      return NextResponse.json(
        { ok: false, error: `Uazapi: ${res.status}`, detail: body },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true, webhookUrl })
  } catch (err) {
    console.error('[configurar-webhook] Falha ao chamar Uazapi:', err)
    return NextResponse.json({ ok: false, error: 'Falha de conexão com Uazapi' }, { status: 502 })
  }
}
