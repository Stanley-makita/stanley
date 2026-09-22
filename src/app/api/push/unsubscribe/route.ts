import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

function getAuth(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  return token
}

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ?? null
}

// Desativa (não apaga) a inscrição deste dispositivo. Sempre filtrado por
// usuario_id do token, nunca só pelo endpoint — um usuário nunca pode
// desativar a inscrição de outro, mesmo sabendo o endpoint dele.
export async function POST(request: NextRequest) {
  const token = getAuth(request)
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { endpoint?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  if (!body.endpoint) {
    return NextResponse.json({ error: 'endpoint é obrigatório' }, { status: 422 })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ ativo: false })
    .eq('endpoint', body.endpoint)
    .eq('usuario_id', usuario.id)

  if (error) {
    console.error('[push/unsubscribe] erro ao desativar inscrição:', error)
    return NextResponse.json({ error: 'Erro ao desativar inscrição' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
