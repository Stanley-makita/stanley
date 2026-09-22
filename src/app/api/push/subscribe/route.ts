import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

// Mesmo padrão de autenticação usado em ~25 rotas do projeto (ex.
// src/app/api/pessoas/route.ts): Bearer token -> supabase.auth.getUser ->
// resolve a linha de `usuarios` pelo auth_user_id.
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

// Registra (ou reativa) a inscrição de Web Push deste dispositivo pro
// usuário logado. Um mesmo usuário pode ter várias linhas (celular,
// notebook, etc.) — `endpoint` é único por navegador/dispositivo, então
// UPSERT por endpoint cobre tanto "primeira vez" quanto "já tinha
// desativado e ativou de novo".
export async function POST(request: NextRequest) {
  const token = getAuth(request)
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; userAgent?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { endpoint, keys, userAgent } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'endpoint, keys.p256dh e keys.auth são obrigatórios' }, { status: 422 })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        usuario_id: usuario.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent ?? null,
        ativo: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    console.error('[push/subscribe] erro ao salvar inscrição:', error)
    return NextResponse.json({ error: 'Erro ao salvar inscrição' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
