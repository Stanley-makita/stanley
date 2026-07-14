import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST /api/bot/whatsapp/call
// Dispara uma chamada de voz via Uazapi (POST /call/make). Não estabelece
// áudio real dentro do Fonti — só faz o telefone do contato tocar; quem fala
// é sempre o atendente pelo aparelho físico vinculado à instância.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  let body: { conversa_id?: string; telefone?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { conversa_id, telefone } = body
  if (!conversa_id || !telefone) {
    return NextResponse.json({ error: 'conversa_id e telefone são obrigatórios' }, { status: 422 })
  }

  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, instancia_id')
    .eq('id', conversa_id)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  let instanceToken = process.env.UAZAPI_INSTANCE_TOKEN ?? ''
  if (conversa.instancia_id) {
    const { data: instancia } = await supabase
      .from('instancias')
      .select('token')
      .eq('id', conversa.instancia_id)
      .eq('ativo', true)
      .maybeSingle()
    if (instancia?.token) instanceToken = instancia.token
  }

  const telRaw = telefone.replace(/\D/g, '')
  const numero = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/call/make`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify({ number: numero }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('[call] Uazapi retornou erro:', res.status, detail)
      return NextResponse.json({ error: 'Falha ao iniciar chamada' }, { status: 502 })
    }
  } catch (err) {
    console.error('[call] Falha ao chamar Uazapi:', err)
    return NextResponse.json({ error: 'Falha de conexão com Uazapi' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
