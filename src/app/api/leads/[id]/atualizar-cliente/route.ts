import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolverOuCriarConversa } from '@/lib/conversas/resolverOuCriarConversa'
import { enviarMensagemHumano } from '@/lib/comunicacao/enviarMensagemHumano'

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type TipoInteressado = 'comprador' | 'corretor'

interface Destinatario {
  nome: string
  telefone: string
  /** Papel gravado em comunicacao_relacionamentos.papel ('cliente' para comprador, por herança da Fase 1). */
  papelRelacionamento: 'cliente' | 'corretor'
  /** Id do vínculo lead_corretores, só para tipo_interessado='corretor'. */
  leadCorretorId?: string
}

// Central de Comunicação com o Cliente — Leads (jornada de Captação).
// Espelha src/app/api/processos/[id]/atualizar-cliente/route.ts. O client nunca manda
// telefone/nome — só `tipo_interessado` + `interessado_id`; a resolução de nome/telefone e a
// validação de que o interessado pertence a este Lead acontecem inteiramente aqui.
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

  let body: { tipo_interessado: TipoInteressado; interessado_id: string; texto: string; envio_id: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { tipo_interessado, interessado_id, texto, envio_id } = body
  if (!tipo_interessado || !interessado_id || !texto?.trim() || !envio_id) {
    return NextResponse.json({ error: 'tipo_interessado, interessado_id, texto e envio_id são obrigatórios' }, { status: 422 })
  }
  if (tipo_interessado !== 'comprador' && tipo_interessado !== 'corretor') {
    return NextResponse.json({ error: 'tipo_interessado inválido' }, { status: 422 })
  }

  const { data: lead } = await supabaseService
    .from('leads')
    .select('id, empresa_id, nome, telefone, pessoa_id')
    .eq('id', leadId)
    .eq('empresa_id', usuario.empresa_id)
    .is('deleted_at', null)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  // Resolução do destinatário — feita inteiramente aqui, nunca a partir de dados do client.
  let destinatario: Destinatario
  if (tipo_interessado === 'comprador') {
    if (interessado_id !== leadId) {
      return NextResponse.json({ error: 'interessado_id inválido para tipo_interessado=comprador' }, { status: 422 })
    }
    if (!lead.telefone?.trim()) {
      return NextResponse.json({ error: 'Este lead não tem telefone cadastrado.' }, { status: 422 })
    }
    destinatario = { nome: lead.nome, telefone: lead.telefone, papelRelacionamento: 'cliente' }
  } else {
    const { data: vinculo } = await supabaseService
      .from('lead_corretores')
      .select('id, corretor:corretores(id, nome, telefone, ativo)')
      .eq('lead_id', leadId)
      .eq('corretor_id', interessado_id)
      .maybeSingle()
    const corretor = Array.isArray(vinculo?.corretor) ? vinculo?.corretor[0] : vinculo?.corretor
    if (!vinculo || !corretor) {
      return NextResponse.json({ error: 'Corretor não encontrado para este Lead.' }, { status: 404 })
    }
    if (!corretor.ativo) {
      return NextResponse.json({ error: 'Este corretor está inativo.' }, { status: 422 })
    }
    if (!corretor.telefone?.trim()) {
      return NextResponse.json({ error: 'Este corretor não tem telefone cadastrado.' }, { status: 422 })
    }
    destinatario = {
      nome: corretor.nome,
      telefone: corretor.telefone,
      papelRelacionamento: 'corretor',
      leadCorretorId: vinculo.id,
    }
  }

  // Relacionamento de comunicação — para 'cliente' (comprador), a migration 167 já cria (via
  // trigger + backfill) a linha para todo Lead; para 'corretor' não há trigger equivalente, então
  // este passo é a via de criação primária. Em ambos os casos nunca bloqueia o envio: se
  // não achar/criar, só loga e segue.
  let relacionamentoId: string | null = null
  try {
    const selecionarRelacionamento = () => destinatario.papelRelacionamento === 'cliente'
      ? supabaseService.from('comunicacao_relacionamentos').select('id').eq('papel', 'cliente').eq('lead_id', leadId).limit(1).maybeSingle()
      : supabaseService.from('comunicacao_relacionamentos').select('id').eq('papel', 'corretor').eq('lead_corretor_id', destinatario.leadCorretorId).limit(1).maybeSingle()

    const { data: relacionamento } = await selecionarRelacionamento()

    if (relacionamento) {
      relacionamentoId = relacionamento.id
    } else {
      const insertPayload = destinatario.papelRelacionamento === 'cliente'
        ? { empresa_id: usuario.empresa_id, papel: 'cliente', lead_id: leadId }
        : { empresa_id: usuario.empresa_id, papel: 'corretor', lead_id: leadId, lead_corretor_id: destinatario.leadCorretorId }

      const { data: criado, error: criarError } = await supabaseService
        .from('comunicacao_relacionamentos')
        .insert(insertPayload)
        .select('id')
        .single()

      if (criado) {
        relacionamentoId = criado.id
      } else if (criarError?.code === '23505') {
        // Corrida: outra requisição criou primeiro — re-seleciona.
        const { data: reselecionado } = await selecionarRelacionamento()
        relacionamentoId = reselecionado?.id ?? null
      }
    }
  } catch (err) {
    console.error('[leads/atualizar-cliente] Relacionamento não encontrado/criado:', err)
  }

  // Reivindicação atômica: INSERT com `envio_id UNIQUE` antes de qualquer efeito colateral —
  // protege contra duplo clique / retry de rede. Mesmo mecanismo de mensagens_processos.
  const { data: vinculoEnvio, error: vinculoError } = await supabaseService
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
      telefone:   destinatario.telefone,
      nome:       destinatario.nome,
      pessoaId:   tipo_interessado === 'comprador' ? lead.pessoa_id : null,
      leadId:     lead.id,
    })
  } catch (err) {
    await supabaseService.from('mensagens_leads').update({ status: 'falhou' }).eq('id', vinculoEnvio.id)
    console.error('[leads/atualizar-cliente] Erro ao resolver conversa:', err)
    return NextResponse.json({ error: 'Falha ao localizar/criar a conversa do destinatário.' }, { status: 500 })
  }

  const resultado = await enviarMensagemHumano({
    supabase:    supabaseService,
    conversaId,
    telefone:    destinatario.telefone,
    tipo:        'text',
    texto:       texto.trim(),
    usuarioId:   usuario.id,
    usuarioNome: usuario.nome,
  })

  if (!resultado.ok) {
    await supabaseService.from('mensagens_leads').update({ status: 'falhou' }).eq('id', vinculoEnvio.id)
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }

  await supabaseService
    .from('mensagens_leads')
    .update({ mensagem_id: resultado.mensagemId, status: 'enviado' })
    .eq('id', vinculoEnvio.id)

  // Histórico com destinatário resolvido pelo servidor. lead_historico não tem coluna estruturada
  // própria para isso (nenhuma migration nesta etapa) — a resolução (tipo do interessado,
  // identificador do vínculo/entidade e nome usado) é codificada na primeira linha de `descricao`,
  // num formato fixo e parseável, seguida da mensagem enviada. AbaHistorico interpreta essa
  // primeira linha para montar o título "Mensagem enviada ao <papel> — <nome>"; linhas antigas sem
  // esse prefixo (formato anterior) continuam caindo no título genérico.
  const identificadorVinculo = tipo_interessado === 'comprador' ? leadId : interessado_id
  const cabecalhoHistorico = `[COMUNICACAO tipo=${tipo_interessado} id=${identificadorVinculo} nome="${destinatario.nome}"]`
  await supabaseService.from('lead_historico').insert({
    lead_id:    leadId,
    empresa_id: usuario.empresa_id,
    usuario_id: usuario.id,
    tipo:       'comunicacao',
    descricao:  `${cabecalhoHistorico}\n${texto.trim()}`,
  })

  return NextResponse.json({
    ok: true,
    mensagem_id: resultado.mensagemId,
    relacionamento_id: relacionamentoId,
    tipo_interessado,
    interessado_id,
    destinatario_nome: destinatario.nome,
  })
}
