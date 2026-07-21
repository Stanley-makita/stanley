import { NextRequest, NextResponse } from 'next/server'
import { resolverOuCriarConversa } from '@/lib/conversas/resolverOuCriarConversa'
import { enviarMensagemHumano } from '@/lib/comunicacao/enviarMensagemHumano'
import { type TipoInteressado } from '@/types/comunicacao'
import { supabaseAdmin as supabaseService } from '@/lib/supabase/admin'

const TIPOS_INTERESSADO: TipoInteressado[] = ['comprador', 'corretor', 'parceiro', 'imobiliaria', 'construtora']

// papel gravado em comunicacao_relacionamentos.papel — igual a tipo_interessado pra todos,
// exceto 'comprador', que por herança da Fase 1 usa 'cliente'.
type PapelRelacionamento = 'cliente' | 'corretor' | 'parceiro' | 'imobiliaria' | 'construtora'

// Coluna de identidade em comunicacao_relacionamentos pro lado Processo — diferente do Lead,
// aqui TODO papel (inclusive comprador) tem sua própria FK de identidade além de processo_id;
// não existe autorreferência (processo_compradores é uma tabela própria, não o Processo em si).
type ColunaIdentidadeProcesso = 'processo_comprador_id' | 'processo_corretor_id' | 'processo_parceiro_id' | 'processo_imobiliaria_id'

interface Destinatario {
  nome: string
  telefone: string
  pessoaId: string | null
  papelRelacionamento: PapelRelacionamento
  colunaIdentidade: ColunaIdentidadeProcesso
  valorIdentidade: string
}

const LABEL_ENTIDADE: Record<'parceiro' | 'imobiliaria' | 'construtora', string> = {
  parceiro:    'parceiro',
  imobiliaria: 'imobiliária',
  construtora: 'construtora',
}

// Central de Comunicação com o Cliente — Negócios (Processo). Espelha
// src/app/api/leads/[id]/atualizar-cliente/route.ts. O client nunca manda telefone/nome — só
// `tipo_interessado` + `interessado_id`; a resolução de nome/telefone e a validação de que o
// interessado pertence a este Processo acontecem inteiramente aqui.
//
// Vendedor não é suportado aqui de propósito (mesma exclusão do Lead — sem identidade estável).
// `processo_imobiliarias.papel = 'vendedora'` também fica de fora (sem equivalente no Lead).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) {
    console.error('[processos/atualizar-cliente] Auth error:', authError?.message)
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: usuario } = await supabaseService
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  const processoId = params.id

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

  const { data: processo } = await supabaseService
    .from('processos')
    .select('id, empresa_id, lead_id')
    .eq('id', processoId)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!processo) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  // Resolução do destinatário — feita inteiramente aqui, nunca a partir de dados do client.
  let destinatario: Destinatario
  if (tipo_interessado === 'comprador') {
    const { data: comprador } = await supabaseService
      .from('processo_compradores')
      .select('id, nome, telefone, pessoa_id')
      .eq('id', interessado_id)
      .eq('processo_id', processoId)
      .maybeSingle()
    if (!comprador) {
      return NextResponse.json({ error: 'Comprador não encontrado para este Negócio.' }, { status: 404 })
    }
    if (!comprador.telefone?.trim()) {
      return NextResponse.json({ error: 'Este comprador não tem telefone cadastrado.' }, { status: 422 })
    }
    destinatario = {
      nome: comprador.nome, telefone: comprador.telefone, pessoaId: comprador.pessoa_id,
      papelRelacionamento: 'cliente', colunaIdentidade: 'processo_comprador_id', valorIdentidade: comprador.id,
    }
  } else if (tipo_interessado === 'corretor') {
    const { data: vinculo } = await supabaseService
      .from('processo_corretores')
      .select('id, corretor:corretores(id, nome, telefone, ativo)')
      .eq('processo_id', processoId)
      .eq('corretor_id', interessado_id)
      .maybeSingle()
    const corretor = Array.isArray(vinculo?.corretor) ? vinculo?.corretor[0] : vinculo?.corretor
    if (!vinculo || !corretor) {
      return NextResponse.json({ error: 'Corretor não encontrado para este Negócio.' }, { status: 404 })
    }
    if (!corretor.ativo) {
      return NextResponse.json({ error: 'Este corretor está inativo.' }, { status: 422 })
    }
    if (!corretor.telefone?.trim()) {
      return NextResponse.json({ error: 'Este corretor não tem telefone cadastrado.' }, { status: 422 })
    }
    destinatario = {
      nome: corretor.nome, telefone: corretor.telefone, pessoaId: null,
      papelRelacionamento: 'corretor', colunaIdentidade: 'processo_corretor_id', valorIdentidade: vinculo.id,
    }
  } else if (tipo_interessado === 'parceiro') {
    const { data: vinculo } = await supabaseService
      .from('processo_parceiros')
      .select('id, parceiro:parceiros(id, nome, telefone, ativo)')
      .eq('processo_id', processoId)
      .eq('parceiro_id', interessado_id)
      .maybeSingle()
    const parceiro = Array.isArray(vinculo?.parceiro) ? vinculo?.parceiro[0] : vinculo?.parceiro
    if (!vinculo || !parceiro) {
      return NextResponse.json({ error: 'Parceiro não encontrado para este Negócio.' }, { status: 404 })
    }
    if (!parceiro.ativo) {
      return NextResponse.json({ error: 'Este parceiro está inativo.' }, { status: 422 })
    }
    if (!parceiro.telefone?.trim()) {
      return NextResponse.json({ error: 'Este parceiro não tem telefone cadastrado.' }, { status: 422 })
    }
    destinatario = {
      nome: parceiro.nome, telefone: parceiro.telefone, pessoaId: null,
      papelRelacionamento: 'parceiro', colunaIdentidade: 'processo_parceiro_id', valorIdentidade: vinculo.id,
    }
  } else {
    // imobiliaria | construtora — mesma tabela imobiliarias, discriminada por processo_imobiliarias.papel.
    const { data: vinculo } = await supabaseService
      .from('processo_imobiliarias')
      .select('id, imobiliaria:imobiliarias(id, nome, telefone, ativo)')
      .eq('processo_id', processoId)
      .eq('imobiliaria_id', interessado_id)
      .eq('papel', tipo_interessado)
      .maybeSingle()
    const imobiliaria = Array.isArray(vinculo?.imobiliaria) ? vinculo?.imobiliaria[0] : vinculo?.imobiliaria
    const label = LABEL_ENTIDADE[tipo_interessado]
    if (!vinculo || !imobiliaria) {
      return NextResponse.json({ error: `${label[0].toUpperCase()}${label.slice(1)} não encontrada para este Negócio.` }, { status: 404 })
    }
    if (!imobiliaria.ativo) {
      return NextResponse.json({ error: `Esta ${label} está inativa.` }, { status: 422 })
    }
    if (!imobiliaria.telefone?.trim()) {
      return NextResponse.json({ error: `Esta ${label} não tem telefone cadastrado.` }, { status: 422 })
    }
    destinatario = {
      nome: imobiliaria.nome, telefone: imobiliaria.telefone, pessoaId: null,
      papelRelacionamento: tipo_interessado, colunaIdentidade: 'processo_imobiliaria_id', valorIdentidade: vinculo.id,
    }
  }

  // Relacionamento de comunicação — os triggers das migrations 167/173 já materializam a
  // linha a partir da tabela de junção correspondente. Nunca bloqueia o envio: se não
  // achar/criar, só loga e segue.
  let relacionamentoId: string | null = null
  try {
    const { colunaIdentidade, valorIdentidade, papelRelacionamento } = destinatario

    const selecionarRelacionamento = () => supabaseService
      .from('comunicacao_relacionamentos')
      .select('id')
      .eq('papel', papelRelacionamento)
      .eq(colunaIdentidade, valorIdentidade)
      .limit(1)
      .maybeSingle()

    const { data: relacionamento } = await selecionarRelacionamento()

    if (relacionamento) {
      relacionamentoId = relacionamento.id
    } else {
      const { data: criado, error: criarError } = await supabaseService
        .from('comunicacao_relacionamentos')
        .insert({
          empresa_id: usuario.empresa_id,
          papel:      papelRelacionamento,
          processo_id: processoId,
          [colunaIdentidade]: valorIdentidade,
        })
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
    console.error('[processos/atualizar-cliente] Relacionamento não encontrado/criado:', err)
  }

  // Reivindicação atômica: INSERT com `envio_id UNIQUE` antes de qualquer efeito colateral.
  const { data: vinculoEnvio, error: vinculoError } = await supabaseService
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
      return NextResponse.json({ ok: true, duplicado: true })
    }
    console.error('[processos/atualizar-cliente] Erro ao reivindicar envio:', vinculoError.message)
    return NextResponse.json({ error: 'Falha ao registrar envio. Tente novamente.' }, { status: 500 })
  }

  let conversaId: string
  try {
    conversaId = await resolverOuCriarConversa({
      supabase:   supabaseService,
      empresaId:  usuario.empresa_id,
      telefone:   destinatario.telefone,
      nome:       destinatario.nome,
      pessoaId:   destinatario.pessoaId,
      leadId:     processo.lead_id,
    })
  } catch (err) {
    await supabaseService.from('mensagens_processos').update({ status: 'falhou' }).eq('id', vinculoEnvio.id)
    console.error('[processos/atualizar-cliente] Erro ao resolver conversa:', err)
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
    await supabaseService.from('mensagens_processos').update({ status: 'falhou' }).eq('id', vinculoEnvio.id)
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }

  await supabaseService
    .from('mensagens_processos')
    .update({ mensagem_id: resultado.mensagemId, status: 'enviado' })
    .eq('id', vinculoEnvio.id)

  // Histórico com destinatário resolvido pelo servidor — mesmo formato de cabeçalho parseável
  // já usado em lead_historico (processo_comentarios também não tem coluna estruturada própria
  // pra destinatário). notificar_cliente só fica true quando o destinatário É o cliente
  // (comprador) — pros demais papéis não faz sentido marcar como "notificação ao cliente".
  const cabecalhoHistorico = `[COMUNICACAO tipo=${tipo_interessado} id=${interessado_id} nome="${destinatario.nome}"]`
  await supabaseService.from('processo_comentarios').insert({
    empresa_id:        usuario.empresa_id,
    processo_id:       processoId,
    usuario_id:        usuario.id,
    tipo:              'comunicacao_cliente',
    texto:             `${cabecalhoHistorico}\n${texto.trim()}`,
    notificar_cliente: tipo_interessado === 'comprador',
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
