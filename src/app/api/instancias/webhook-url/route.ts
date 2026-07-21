import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario
}

// GET /api/instancias/webhook-url
// Retorna a URL completa (com o token de autenticação do webhook) pra colar
// no dashboard da Uazapi. O endpoint de webhook (/api/bot/whatsapp/webhook)
// exige esse token via header x-webhook-token ou query param — sem ele, a
// Uazapi recebe 401 e a instância nunca recebe mensagem nenhuma. Fica atrás
// de rota autenticada (em vez de expor UAZAPI_WEBHOOK_TOKEN via
// NEXT_PUBLIC_*) só pra não vazar o valor pra qualquer visitante do bundle.
export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const webhookToken = process.env.UAZAPI_WEBHOOK_TOKEN?.trim()
  if (!webhookToken) {
    return NextResponse.json({ error: 'UAZAPI_WEBHOOK_TOKEN não configurado' }, { status: 500 })
  }

  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host  = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_APP_URL
    : `${proto}://${host}`

  return NextResponse.json({
    webhookUrl: `${appUrl}/api/bot/whatsapp/webhook?token=${webhookToken}`,
  })
}
