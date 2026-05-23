import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  let body: { lead_id: string; salvar_telefone: boolean }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { lead_id, salvar_telefone } = body
  if (!lead_id) return NextResponse.json({ error: 'lead_id é obrigatório' }, { status: 422 })

  const conversa_id = params.id

  // Verifica que a conversa pertence à empresa do usuário
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, contato_telefone, empresa_id')
    .eq('id', conversa_id)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  // Verifica que o lead pertence à mesma empresa
  const { data: lead } = await supabase
    .from('leads')
    .select('id, empresa_id')
    .eq('id', lead_id)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  // Vincula a conversa ao lead
  const { error: updateError } = await supabase
    .from('conversas')
    .update({ lead_id })
    .eq('id', conversa_id)
  if (updateError) {
    console.error('[vincular-lead] erro ao vincular:', updateError)
    return NextResponse.json({ error: 'Erro ao vincular' }, { status: 500 })
  }

  // Se solicitado, salva o telefone da conversa como contato do lead
  if (salvar_telefone && conversa.contato_telefone) {
    await supabase.from('lead_telefones').upsert(
      {
        lead_id,
        empresa_id: usuario.empresa_id,
        telefone: conversa.contato_telefone,
        principal: false,
      },
      { onConflict: 'lead_id,telefone' }
    )
  }

  return NextResponse.json({ ok: true })
}
