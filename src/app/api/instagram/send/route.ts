import { NextRequest, NextResponse } from 'next/server'
import { enviarMensagemInstagram } from '@/lib/comunicacao/enviarMensagemInstagram'
import { supabaseAdmin as supabaseService } from '@/lib/supabase/admin'

// Espelha src/app/api/bot/whatsapp/send/route.ts, mas pra Instagram
// (chamado pelo PainelComposicao quando conversaSelecionada.canal === 'instagram').

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) {
    console.error('[instagram-send] Auth error:', authError?.message)
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: usuario } = await supabaseService
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  let body: { conversa_id: string; destinatario_id: string; texto: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { conversa_id, destinatario_id, texto } = body
  if (!conversa_id || !destinatario_id || !texto?.trim()) {
    return NextResponse.json({ error: 'conversa_id, destinatario_id e texto são obrigatórios' }, { status: 422 })
  }

  // Verifica que a conversa pertence à empresa do atendente e é mesmo do canal Instagram
  const { data: conversa } = await supabaseService
    .from('conversas')
    .select('id')
    .eq('id', conversa_id)
    .eq('empresa_id', usuario.empresa_id)
    .eq('canal', 'instagram')
    .single()
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  const resultado = await enviarMensagemInstagram({
    supabase: supabaseService,
    conversaId: conversa_id,
    destinatarioId: destinatario_id,
    texto: texto.trim(),
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }

  return NextResponse.json({ ok: true, message_id: resultado.messageId, mensagem_id: resultado.mensagemId })
}
