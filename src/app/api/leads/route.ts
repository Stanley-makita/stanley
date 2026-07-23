import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { buscarOuCriarPessoa } from '@/lib/pessoa'
import { obterOrdemTopo } from '@/lib/leads/ordem'
import { podeExecutarPadrao } from '@/lib/auth/permissions'
import { type Lead } from '@/types/leads'

export async function POST(request: NextRequest) {
  // Autentica o usuário pela sessão (cookie)
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Carrega empresa_id e perfil do usuário
  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('id, empresa_id, perfil')
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .eq('ativo', true)
    .single()

  if (!usuario) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })
  }

  if (!podeExecutarPadrao(usuario.perfil, 'leads.criar')) {
    return NextResponse.json({ error: 'Sem permissão para criar leads' }, { status: 403 })
  }

  const body = await request.json() as {
    nome: string
    telefone: string
    email?: string
    cpf?: string
    fase_id: string
    responsavel_id?: string
    responsavel_operacional_id?: string
    origem: Lead['origem']
    valor_pretendido?: number
    observacoes?: string
    // Reaproveitamento explícito de uma Pessoa já existente (ex: vindo do
    // resumo da Busca Global, quando não há atendimento ativo com outro
    // comercial) — ver busca_pessoas_resumo, 20260725_187.
    pessoa_id?: string
  }

  const { nome, telefone, fase_id, origem } = body
  if (!nome || !telefone || !fase_id || !origem) {
    return NextResponse.json({ error: 'nome, telefone, fase_id e origem são obrigatórios' }, { status: 422 })
  }

  const empresa_id = usuario.empresa_id

  let pessoa_id: string | null = null

  if (body.pessoa_id) {
    // Pessoa explícita (reaproveitamento) — nunca confia no client: valida
    // que existe e é da mesma empresa. Se falhar, erro controlado — SEM
    // fallback para buscarOuCriarPessoa, que poderia mascarar um id
    // inválido e duplicar exatamente o cadastro que isso existe pra evitar.
    const { data: pessoaExistente } = await supabaseAdmin
      .from('pessoas')
      .select('id')
      .eq('id', body.pessoa_id)
      .eq('empresa_id', empresa_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!pessoaExistente) {
      return NextResponse.json(
        { error: 'Pessoa inválida', detail: 'pessoa_id informado não existe ou não pertence a esta empresa.' },
        { status: 404 }
      )
    }

    pessoa_id = pessoaExistente.id
  } else {
    // Busca ou cria Pessoa (deduplicação por CPF e telefone) — fluxo automático de sempre
    try {
      pessoa_id = await buscarOuCriarPessoa(empresa_id, telefone.trim(), nome.trim(), body.cpf?.trim())
    } catch (err) {
      console.error('[POST /api/leads] erro ao buscar/criar pessoa:', err)
    }
  }

  // Deduplicação: mesma pessoa + mesma fase = lead duplicado
  if (pessoa_id) {
    const { data: leadExistente } = await supabaseAdmin
      .from('leads')
      .select('id, nome, fase_id')
      .eq('empresa_id', empresa_id)
      .eq('pessoa_id', pessoa_id)
      .eq('fase_id', fase_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (leadExistente) {
      return NextResponse.json(
        { error: 'Lead duplicado', detail: 'Já existe um lead ativo para esta pessoa nesta fase.', lead_id: leadExistente.id },
        { status: 409 }
      )
    }
  }

  // Posiciona o novo lead no topo da fase (menor ordem_kanban que todos os existentes)
  const ordemTopo = await obterOrdemTopo(supabaseAdmin, empresa_id, fase_id)

  // Insere o lead já com pessoa_id vinculado
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .insert({
      empresa_id,
      nome:             nome.trim(),
      telefone:         telefone.trim(),
      email:            body.email?.trim()   || null,
      cpf:              body.cpf?.trim()     || null,
      fase_id,
      // Comercial cria sempre na própria carteira — nunca confia no que o
      // client mandar; demais perfis (gestor/admin/apoio) escolhem livremente.
      responsavel_id: usuario.perfil === 'comercial' ? usuario.id : (body.responsavel_id || null),
      responsavel_operacional_id: body.responsavel_operacional_id || null,
      origem,
      valor_pretendido: body.valor_pretendido ?? null,
      observacoes:      body.observacoes     || null,
      ordem_kanban:     ordemTopo,
      pessoa_id,
    })
    .select(`
      *,
      responsavel:usuarios!responsavel_id(id, nome),
      fase:fases!fase_id(id, nome, cor)
    `)
    .single()

  if (leadError) {
    console.error('[POST /api/leads] erro ao criar lead:', leadError)
    return NextResponse.json({ error: leadError.message }, { status: 500 })
  }

  return NextResponse.json(lead, { status: 201 })
}
