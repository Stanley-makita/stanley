import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

interface UazapiCheckResult {
  query: string
  jid?: string
  isInWhatsapp: boolean
  verifiedName?: string
  groupName?: string
  error?: string
}

// POST /api/bot/whatsapp/verificar-numero
// Verifica se números estão registrados no WhatsApp (POST /chat/check da
// Uazapi) antes de criar conversa/grupo — evita desperdiçar Lead/mensagem
// num telefone digitado errado.
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

  let body: { numbers?: string[]; instancia_id?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const numbersRaw = (body.numbers ?? []).map((n) => n.replace(/\D/g, '')).filter(Boolean)
  if (numbersRaw.length === 0) {
    return NextResponse.json({ error: 'Informe ao menos um número' }, { status: 422 })
  }
  const numbers = numbersRaw.map((n) => (n.length <= 11 && !n.startsWith('55') ? `55${n}` : n))

  // Usa a instância informada pelo chamador (a que vai efetivamente criar a
  // conversa/grupo) sempre que possível — sem isso, cai numa instância
  // "qualquer" da empresa que pode estar desconectada mesmo com outra em uso.
  let instanceToken = ''
  if (body.instancia_id) {
    const { data: instancia } = await supabase
      .from('instancias')
      .select('token')
      .eq('id', body.instancia_id)
      .eq('empresa_id', usuario.empresa_id)
      .eq('ativo', true)
      .maybeSingle()
    instanceToken = instancia?.token ?? ''
  }
  if (!instanceToken) {
    const { data: instancia } = await supabase
      .from('instancias')
      .select('token')
      .eq('empresa_id', usuario.empresa_id)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle()
    instanceToken = instancia?.token ?? process.env.UAZAPI_INSTANCE_TOKEN ?? ''
  }

  let resultado: UazapiCheckResult[]
  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/chat/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify({ numbers }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('[verificar-numero] Uazapi retornou erro:', res.status, detail)
      return NextResponse.json({ error: `Falha ao verificar número (Uazapi ${res.status}): ${detail.slice(0, 200)}` }, { status: 502 })
    }
    resultado = await res.json()
  } catch (err) {
    console.error('[verificar-numero] Falha ao chamar Uazapi:', err)
    return NextResponse.json({ error: 'Falha de conexão com Uazapi' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, resultados: resultado })
}
