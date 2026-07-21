import { NextRequest, NextResponse } from 'next/server'
import { buscarOuCriarPessoa } from '@/lib/pessoa'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

// Endpoint para registrar leads QUALIFICADOS de integrações externas:
// Facebook Lead Ads, bot WhatsApp (resultado.criarLead), Instagram, formulário site.
//
// IMPORTANTE: Este endpoint NÃO deve ser chamado para toda mensagem nova de WhatsApp.
// Mensagem nova → cria Pessoa + Conversa (webhook do WhatsApp)
// Lead qualificado → bot aciona criar_lead → este endpoint é chamado
// Lead humano → atendente usa a UI do CRM (kanban de leads)
//
// Uso: POST /api/leads/webhook?source=whatsapp
// Headers: x-webhook-secret: <WEBHOOK_SECRET>
// Body: { nome, telefone, email?, empresa_id, origem?, observacoes?, produto_interesse? }

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? ''

export async function POST(request: NextRequest) {
  // Validar secret
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const source = request.nextUrl.searchParams.get('source') ?? 'outros'

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { nome, telefone, email, empresa_id, observacoes, valor_pretendido, renda_formal } = body as {
    nome?: string
    telefone?: string
    email?: string
    empresa_id?: string
    observacoes?: string
    produto_interesse?: string
    valor_pretendido?: number
    renda_formal?: number
  }

  if (!nome || !telefone || !empresa_id) {
    return NextResponse.json(
      { error: 'nome, telefone e empresa_id são obrigatórios' },
      { status: 422 }
    )
  }

  const nomeTrimmed = String(nome).trim()
  const telefoneTrimmed = String(telefone).trim()

  // Origem baseada no source do webhook
  const origens = ['whatsapp', 'instagram', 'facebook', 'site', 'indicacao', 'outros']
  const origem = origens.includes(source) ? source : 'outros'

  // Buscar primeira fase (Prospecção) da empresa
  const { data: primeiraFase, error: faseError } = await supabase
    .from('fases')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .limit(1)
    .single()

  if (faseError || !primeiraFase) {
    return NextResponse.json(
      { error: 'Empresa não encontrada ou sem fases configuradas' },
      { status: 404 }
    )
  }

  // Busca ou cria Pessoa (deduplicação central por telefone)
  let pessoaId: string | null = null
  try {
    pessoaId = await buscarOuCriarPessoa(empresa_id, telefoneTrimmed, nomeTrimmed)
  } catch (err) {
    console.error('[webhook-leads] Erro ao buscar/criar pessoa:', err)
  }

  // Deduplicação de leads: mesma pessoa + mesmo produto = lead duplicado.
  // Uma pessoa PODE ter múltiplos leads para produtos distintos (financiamento, consórcio, CGI).
  // TODO: quando produto_interesse for um enum estruturado, refinar para comparar por enum exato.
  const produtoInteresse = body.produto_interesse ? String(body.produto_interesse).trim() : null

  if (pessoaId) {
    let deduplicacaoQuery = supabase
      .from('leads')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('pessoa_id', pessoaId)
      .is('deleted_at', null)

    if (produtoInteresse) {
      // Mesmo produto → duplicata clara
      deduplicacaoQuery = deduplicacaoQuery.eq('produto_interesse', produtoInteresse)
    }
    // Sem produto informado: qualquer lead ativo da pessoa conta como duplicata
    // (comportamento conservador — evitar múltiplos leads não identificados)

    const { data: leadExistente } = await deduplicacaoQuery.maybeSingle()

    if (leadExistente) {
      console.log('[webhook-leads] Lead já existe (pessoa_id + produto), ignorando duplicata. lead_id:', leadExistente.id)
      return NextResponse.json({ success: true, lead_id: leadExistente.id, deduplicated: true }, { status: 200 })
    }
  }

  // Inserir lead vinculado à pessoa
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      empresa_id,
      nome: nomeTrimmed,
      telefone: telefoneTrimmed,
      email: email ? String(email).trim() : null,
      fase_id: primeiraFase.id,
      origem,
      ordem_kanban: 0,
      observacoes:       observacoes      ?? null,
      produto_interesse: produtoInteresse ?? null,
      valor_pretendido:  typeof valor_pretendido === 'number' ? valor_pretendido : null,
      renda_formal:      typeof renda_formal      === 'number' ? renda_formal      : null,
      pessoa_id: pessoaId ?? undefined,
    })
    .select('id, nome, fase_id')
    .single()

  if (leadError) {
    console.error('[webhook] Erro ao criar lead:', leadError)
    return NextResponse.json({ error: 'Erro ao criar lead' }, { status: 500 })
  }

  // Registra o telefone no lead_telefones para lookup futuro
  await supabase.from('lead_telefones').upsert(
    { lead_id: lead.id, empresa_id, telefone: telefoneTrimmed, principal: true },
    { onConflict: 'lead_id,telefone' }
  )

  return NextResponse.json({ success: true, lead_id: lead.id }, { status: 201 })
}

// GET para validação de webhook (Facebook exige isso na configuração)
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === WEBHOOK_SECRET) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
