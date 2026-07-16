import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolverOuCriarConversa } from '@/lib/conversas/resolverOuCriarConversa'
import { enviarMensagemHumano } from '@/lib/comunicacao/enviarMensagemHumano'

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Central de Comunicação com o Cliente (Fase 1 — comunicação manual). Orquestra: reivindicação
// atômica do envio (idempotência própria, sem depender de `fonti_events`) → resolver/criar a
// conversa do comprador escolhido → enviar via WhatsApp (reaproveitando enviarMensagemHumano,
// a mesma lógica de /api/bot/whatsapp/send) → registrar no histórico do Negócio.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) {
    console.error('[atualizar-cliente] Auth error:', authError?.message)
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: usuario } = await supabaseService
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  const processoId = params.id

  let body: { comprador_id: string; texto: string; envio_id: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { comprador_id, texto, envio_id } = body
  if (!comprador_id || !texto?.trim() || !envio_id) {
    return NextResponse.json({ error: 'comprador_id, texto e envio_id são obrigatórios' }, { status: 422 })
  }

  const { data: processo } = await supabaseService
    .from('processos')
    .select('id, empresa_id, lead_id')
    .eq('id', processoId)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!processo) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  const { data: comprador } = await supabaseService
    .from('processo_compradores')
    .select('id, nome, telefone, pessoa_id')
    .eq('id', comprador_id)
    .eq('processo_id', processoId)
    .single()
  if (!comprador) return NextResponse.json({ error: 'Comprador não encontrado' }, { status: 404 })
  if (!comprador.telefone?.trim()) {
    return NextResponse.json({ error: 'Este comprador não tem telefone cadastrado.' }, { status: 422 })
  }

  // Reivindicação atômica: INSERT com `envio_id UNIQUE` antes de qualquer efeito colateral —
  // protege contra duplo clique / retry de rede. Mecanismo próprio, separado de
  // `fonti_events` (exclusiva da idempotência do webhook recebido).
  const { data: vinculo, error: vinculoError } = await supabaseService
    .from('mensagens_processos')
    .insert({
      empresa_id:  usuario.empresa_id,
      processo_id: processoId,
      envio_id,
      usuario_id:  usuario.id,
      status:      'enviando',
    })
    .select('id')
    .single()

  if (vinculoError) {
    if (vinculoError.code === '23505') {
      // Já reivindicado por outra requisição — não reenvia, não é erro do ponto de vista do chamador.
      return NextResponse.json({ ok: true, duplicado: true })
    }
    console.error('[atualizar-cliente] Erro ao reivindicar envio:', vinculoError.message)
    return NextResponse.json({ error: 'Falha ao registrar envio. Tente novamente.' }, { status: 500 })
  }

  let conversaId: string
  try {
    conversaId = await resolverOuCriarConversa({
      supabase:   supabaseService,
      empresaId:  usuario.empresa_id,
      telefone:   comprador.telefone,
      nome:       comprador.nome,
      pessoaId:   comprador.pessoa_id,
      leadId:     processo.lead_id,
    })
  } catch (err) {
    await supabaseService.from('mensagens_processos').update({ status: 'falhou' }).eq('id', vinculo.id)
    console.error('[atualizar-cliente] Erro ao resolver conversa:', err)
    return NextResponse.json({ error: 'Falha ao localizar/criar a conversa do cliente.' }, { status: 500 })
  }

  const resultado = await enviarMensagemHumano({
    supabase:    supabaseService,
    conversaId,
    telefone:    comprador.telefone,
    tipo:        'text',
    texto:       texto.trim(),
    usuarioId:   usuario.id,
    usuarioNome: usuario.nome,
  })

  if (!resultado.ok) {
    await supabaseService.from('mensagens_processos').update({ status: 'falhou' }).eq('id', vinculo.id)
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }

  await supabaseService
    .from('mensagens_processos')
    .update({ mensagem_id: resultado.mensagemId, status: 'enviado' })
    .eq('id', vinculo.id)

  await supabaseService.from('processo_comentarios').insert({
    empresa_id:        usuario.empresa_id,
    processo_id:       processoId,
    usuario_id:        usuario.id,
    tipo:              'comunicacao_cliente',
    texto:             texto.trim(),
    notificar_cliente: true,
  })

  return NextResponse.json({ ok: true, mensagem_id: resultado.mensagemId })
}
