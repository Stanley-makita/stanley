import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

// POST /api/bot/whatsapp/chat-read
// Marca o chat como lido/não lido no WhatsApp de verdade (POST /chat/read da
// Uazapi) — reflete no aparelho físico vinculado à instância, não é um status
// interno do Fonti.
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

  let body: { conversa_id?: string; read?: boolean }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { conversa_id, read } = body
  if (!conversa_id || typeof read !== 'boolean') {
    return NextResponse.json({ error: 'conversa_id e read são obrigatórios' }, { status: 422 })
  }

  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, instancia_id, contato_telefone, contato_grupo_id')
    .eq('id', conversa_id)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  const number = conversa.contato_grupo_id ?? (conversa.contato_telefone ? `${conversa.contato_telefone}@s.whatsapp.net` : null)
  if (!number) return NextResponse.json({ error: 'Conversa sem telefone/grupo vinculado' }, { status: 422 })

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

  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/chat/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify({ number, read }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('[chat-read] Uazapi retornou erro:', res.status, detail)
      return NextResponse.json({ error: 'Falha ao atualizar status de leitura' }, { status: 502 })
    }
  } catch (err) {
    console.error('[chat-read] Falha ao chamar Uazapi:', err)
    return NextResponse.json({ error: 'Falha de conexão com Uazapi' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
