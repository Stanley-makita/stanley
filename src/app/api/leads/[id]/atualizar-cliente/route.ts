import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolverOuCriarConversa } from '@/lib/conversas/resolverOuCriarConversa'
import { enviarMensagemHumano } from '@/lib/comunicacao/enviarMensagemHumano'

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Central de Comunicação com o Cliente — Entrega 1 para Leads (jornada de Captação).
// Espelha src/app/api/processos/[id]/atualizar-cliente/route.ts; diferença estrutural real:
// Lead já tem telefone próprio (sem "comprador" intermediário). Reaproveita
// resolverOuCriarConversa e enviarMensagemHumano sem nenhuma alteração.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) {
    console.error('[leads/atualizar-cliente] Auth error:', authError?.message)
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: usuario } = await supabaseService
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  const leadId = params.id

  let body: { texto: string; envio_id: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { texto, envio_id } = body
  if (!texto?.trim() || !envio_id) {
    return NextResponse.json({ error: 'texto e envio_id são obrigatórios' }, { status: 422 })
  }

  const { data: lead } = await supabaseService
    .from('leads')
    .select('id, empresa_id, nome, telefone, pessoa_id')
    .eq('id', leadId)
    .eq('empresa_id', usuario.empresa_id)
    .is('deleted_at', null)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  if (!lead.telefone?.trim()) {
    return NextResponse.json({ error: 'Este lead não tem telefone cadastrado.' }, { status: 422 })
  }

  // Relacionamento de comunicação — a migration 167 já cria (via trigger + backfill) um
  // comunicacao_relacionamentos papel='cliente' para todo Lead, então este passo normalmente só
  // lê. O insert de fallback é defensivo (linha faltante por algum motivo excepcional) e nunca
  // bloqueia o envio: se não achar/criar, só loga e segue — a mensagem ao cliente não pode
  // depender dessa leitura, que nesta entrega é só prova de arquitetura.
  let relacionamentoId: string | null = null
  try {
    const { data: relacionamento } = await supabaseService
      .from('comunicacao_relacionamentos')
      .select('id')
      .eq('lead_id', leadId)
      .eq('papel', 'cliente')
      .limit(1)
      .maybeSingle()

    if (relacionamento) {
      relacionamentoId = relacionamento.id
    } else {
      const { data: criado, error: criarError } = await supabaseService
        .from('comunicacao_relacionamentos')
        .insert({ empresa_id: usuario.empresa_id, papel: 'cliente', lead_id: leadId })
        .select('id')
        .single()

      if (criado) {
        relacionamentoId = criado.id
      } else if (criarError?.code === '23505') {
        // Corrida: outra requisição criou primeiro — re-seleciona.
        const { data: reselecionado } = await supabaseService
          .from('comunicacao_relacionamentos')
          .select('id')
          .eq('lead_id', leadId)
          .eq('papel', 'cliente')
          .limit(1)
          .maybeSingle()
        relacionamentoId = reselecionado?.id ?? null
      }
    }
  } catch (err) {
    console.error('[leads/atualizar-cliente] Relacionamento não encontrado/criado:', err)
  }

  // Reivindicação atômica: INSERT com `envio_id UNIQUE` antes de qualquer efeito colateral —
  // protege contra duplo clique / retry de rede. Mesmo mecanismo de mensagens_processos.
  const { data: vinculo, error: vinculoError } = await supabaseService
    .from('mensagens_leads')
    .insert({
      empresa_id: usuario.empresa_id,
      lead_id:    leadId,
      envio_id,
      usuario_id: usuario.id,
      status:     'enviando',
    })
    .select('id')
    .single()

  if (vinculoError) {
    if (vinculoError.code === '23505') {
      return NextResponse.json({ ok: true, duplicado: true })
    }
    console.error('[leads/atualizar-cliente] Erro ao reivindicar envio:', vinculoError.message)
    return NextResponse.json({ error: 'Falha ao registrar envio. Tente novamente.' }, { status: 500 })
  }

  let conversaId: string
  try {
    conversaId = await resolverOuCriarConversa({
      supabase:   supabaseService,
      empresaId:  usuario.empresa_id,
      telefone:   lead.telefone,
      nome:       lead.nome,
      pessoaId:   lead.pessoa_id,
      leadId:     lead.id,
    })
  } catch (err) {
    await supabaseService.from('mensagens_leads').update({ status: 'falhou' }).eq('id', vinculo.id)
    console.error('[leads/atualizar-cliente] Erro ao resolver conversa:', err)
    return NextResponse.json({ error: 'Falha ao localizar/criar a conversa do cliente.' }, { status: 500 })
  }

  const resultado = await enviarMensagemHumano({
    supabase:    supabaseService,
    conversaId,
    telefone:    lead.telefone,
    tipo:        'text',
    texto:       texto.trim(),
    usuarioId:   usuario.id,
    usuarioNome: usuario.nome,
  })

  if (!resultado.ok) {
    await supabaseService.from('mensagens_leads').update({ status: 'falhou' }).eq('id', vinculo.id)
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }

  await supabaseService
    .from('mensagens_leads')
    .update({ mensagem_id: resultado.mensagemId, status: 'enviado' })
    .eq('id', vinculo.id)

  await supabaseService.from('lead_historico').insert({
    lead_id:    leadId,
    empresa_id: usuario.empresa_id,
    usuario_id: usuario.id,
    tipo:       'comunicacao',
    descricao:  texto.trim(),
  })

  return NextResponse.json({ ok: true, mensagem_id: resultado.mensagemId, relacionamento_id: relacionamentoId })
}
