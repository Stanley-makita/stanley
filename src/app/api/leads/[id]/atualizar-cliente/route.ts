import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolverOuCriarConversa } from '@/lib/conversas/resolverOuCriarConversa'
import { enviarMensagemHumano } from '@/lib/comunicacao/enviarMensagemHumano'

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type TipoInteressado = 'comprador' | 'corretor' | 'parceiro' | 'imobiliaria' | 'construtora'

const TIPOS_INTERESSADO: TipoInteressado[] = ['comprador', 'corretor', 'parceiro', 'imobiliaria', 'construtora']

// papel gravado em comunicacao_relacionamentos.papel — igual a tipo_interessado pra todos,
// exceto 'comprador', que por herança da Fase 1 usa 'cliente'.
type PapelRelacionamento = 'cliente' | 'corretor' | 'parceiro' | 'imobiliaria' | 'construtora'

interface Destinatario {
  nome: string
  telefone: string
  papelRelacionamento: PapelRelacionamento
  leadCorretorId?: string
  leadParceiroId?: string
  leadImobiliariaId?: string
}

const LABEL_ENTIDADE: Record<'parceiro' | 'imobiliaria' | 'construtora', string> = {
  parceiro:    'parceiro',
  imobiliaria: 'imobiliária',
  construtora: 'construtora',
}

// Central de Comunicação com o Cliente — Leads (jornada de Captação).
// Espelha src/app/api/processos/[id]/atualizar-cliente/route.ts. O client nunca manda
// telefone/nome — só `tipo_interessado` + `interessado_id`; a resolução de nome/telefone e a
// validação de que o interessado pertence a este Lead acontecem inteiramente aqui.
//
// Vendedor não é suportado aqui de propósito: leads.vendedor_nome/vendedor_telefone são
// campos escalares livres, sem identidade estável — ver migration 20260719_172.
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
  if (!TIPOS_INTERESSADO.includes(tipo_interessado)) {
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
  } else if (tipo_interessado === 'corretor') {
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
    destinatario = { nome: corretor.nome, telefone: corretor.telefone, papelRelacionamento: 'corretor', leadCorretorId: vinculo.id }
  } else if (tipo_interessado === 'parceiro') {
    const { data: vinculo } = await supabaseService
      .from('lead_parceiros')
      .select('id, parceiro:parceiros(id, nome, telefone, ativo)')
      .eq('lead_id', leadId)
      .eq('parceiro_id', interessado_id)
      .maybeSingle()
    const parceiro = Array.isArray(vinculo?.parceiro) ? vinculo?.parceiro[0] : vinculo?.parceiro
    if (!vinculo || !parceiro) {
      return NextResponse.json({ error: 'Parceiro não encontrado para este Lead.' }, { status: 404 })
    }
    if (!parceiro.ativo) {
      return NextResponse.json({ error: 'Este parceiro está inativo.' }, { status: 422 })
    }
    if (!parceiro.telefone?.trim()) {
      return NextResponse.json({ error: 'Este parceiro não tem telefone cadastrado.' }, { status: 422 })
    }
    destinatario = { nome: parceiro.nome, telefone: parceiro.telefone, papelRelacionamento: 'parceiro', leadParceiroId: vinculo.id }
  } else {
    // imobiliaria | construtora — mesma tabela imobiliarias, discriminada por lead_imobiliarias.papel.
    const { data: vinculo } = await supabaseService
      .from('lead_imobiliarias')
      .select('id, imobiliaria:imobiliarias(id, nome, telefone, ativo)')
      .eq('lead_id', leadId)
      .eq('imobiliaria_id', interessado_id)
      .eq('papel', tipo_interessado)
      .maybeSingle()
    const imobiliaria = Array.isArray(vinculo?.imobiliaria) ? vinculo?.imobiliaria[0] : vinculo?.imobiliaria
    const label = LABEL_ENTIDADE[tipo_interessado]
    if (!vinculo || !imobiliaria) {
      return NextResponse.json({ error: `${label[0].toUpperCase()}${label.slice(1)} não encontrada para este Lead.` }, { status: 404 })
    }
    if (!imobiliaria.ativo) {
      return NextResponse.json({ error: `Esta ${label} está inativa.` }, { status: 422 })
    }
    if (!imobiliaria.telefone?.trim()) {
      return NextResponse.json({ error: `Esta ${label} não tem telefone cadastrado.` }, { status: 422 })
    }
    destinatario = { nome: imobiliaria.nome, telefone: imobiliaria.telefone, papelRelacionamento: tipo_interessado, leadImobiliariaId: vinculo.id }
  }

  // Relacionamento de comunicação — para 'cliente' (comprador), a migration 167 já cria (via
  // trigger + backfill) a linha para todo Lead; para os demais papéis, os triggers das
  // migrations 167/172 cobrem a criação a partir da tabela de junção correspondente. Em todos
  // os casos este passo nunca bloqueia o envio: se não achar/criar, só loga e segue.
  let relacionamentoId: string | null = null
  try {
    const colunaIdentidade =
      destinatario.papelRelacionamento === 'cliente'    ? 'lead_id' :
      destinatario.papelRelacionamento === 'corretor'    ? 'lead_corretor_id' :
      destinatario.papelRelacionamento === 'parceiro'    ? 'lead_parceiro_id' :
      'lead_imobiliaria_id' // imobiliaria | construtora

    const valorIdentidade =
      destinatario.papelRelacionamento === 'cliente'    ? leadId :
      destinatario.papelRelacionamento === 'corretor'    ? destinatario.leadCorretorId! :
      destinatario.papelRelacionamento === 'parceiro'    ? destinatario.leadParceiroId! :
      destinatario.leadImobiliariaId!

    const selecionarRelacionamento = () => supabaseService
      .from('comunicacao_relacionamentos')
      .select('id')
      .eq('papel', destinatario.papelRelacionamento)
      .eq(colunaIdentidade, valorIdentidade)
      .limit(1)
      .maybeSingle()

    const { data: relacionamento } = await selecionarRelacionamento()

    if (relacionamento) {
      relacionamentoId = relacionamento.id
    } else {
      const insertPayload: Record<string, unknown> = {
        empresa_id: usuario.empresa_id,
        papel:      destinatario.papelRelacionamento,
        lead_id:    leadId,
      }
      if (colunaIdentidade !== 'lead_id') insertPayload[colunaIdentidade] = valorIdentidade

      const { data: criado, error: criarError } = await supabaseService
        .from('comunicacao_relacionamentos')
        .insert(insertPayload)
        .select('id')
        .single()

      if (criado) {
        relacionamentoId = criado.id
      } else if (criarError?.code === '23505') {
        // Corrida: outra requisição/trigger criou primeiro — re-seleciona.
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
  // própria para isso (nenhuma migration nesta etapa toca essa tabela) — a resolução (tipo do
  // interessado, identificador do vínculo/entidade e nome usado) é codificada na primeira linha de
  // `descricao`, num formato fixo e parseável, seguida da mensagem enviada. AbaHistorico interpreta
  // essa primeira linha para montar o título "Mensagem enviada ao <papel> — <nome>".
  const cabecalhoHistorico = `[COMUNICACAO tipo=${tipo_interessado} id=${interessado_id} nome="${destinatario.nome}"]`
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
