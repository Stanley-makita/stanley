import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function resolveEmpresa(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario?.empresa_id ?? null
}

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id, perfil')
    .eq('auth_user_id', user.id)
    .eq('ativo', true)
    .single()
  return usuario ?? null
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: pessoa, error } = await supabase
    .from('pessoas')
    .select(`
      id, nome, cpf, email, data_nascimento, observacoes, created_at, updated_at,
      pessoa_telefones(id, telefone, principal, whatsapp, ativo, created_at)
    `)
    .eq('id', params.id)
    .eq('empresa_id', empresa_id)
    .single()

  if (error || !pessoa) return NextResponse.json({ error: 'Pessoa não encontrada' }, { status: 404 })

  // Leads vinculados
  const { data: leads } = await supabase
    .from('leads')
    .select('id, nome, telefone, origem, created_at, fase:fases!fase_id(id, nome, cor)')
    .eq('empresa_id', empresa_id)
    .eq('pessoa_id', params.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Conversas vinculadas
  const { data: conversas } = await supabase
    .from('conversas')
    .select('id, canal, contato_telefone, contato_nome, status, bot_ativo, created_at, updated_at')
    .eq('empresa_id', empresa_id)
    .eq('pessoa_id', params.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ ...pessoa, leads: leads ?? [], conversas: conversas ?? [] })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const campos: Record<string, unknown> = {}
  if (body.nome !== undefined) campos.nome = String(body.nome).trim()
  if (body.email !== undefined) campos.email = body.email ? String(body.email).trim() : null
  if (body.cpf !== undefined) campos.cpf = body.cpf ? String(body.cpf).trim() : null
  if (body.data_nascimento !== undefined) campos.data_nascimento = body.data_nascimento ?? null
  if (body.observacoes !== undefined) campos.observacoes = body.observacoes ? String(body.observacoes).trim() : null

  const { data, error } = await supabase
    .from('pessoas')
    .update(campos)
    .eq('id', params.id)
    .eq('empresa_id', empresa_id)
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  const PERFIS_COM_EXCLUSAO = ['admin', 'gerente', 'gestor']
  if (!PERFIS_COM_EXCLUSAO.includes(usuario.perfil)) {
    return NextResponse.json({ error: 'Sem permissão para excluir pessoas' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { motivo?: string }
  const motivo = body.motivo?.trim() ?? null

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('id')
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!pessoa) return NextResponse.json({ error: 'Pessoa não encontrada' }, { status: 404 })

  const { error } = await supabase
    .from('pessoas')
    .update({ deleted_at: new Date().toISOString(), motivo_exclusao: motivo })
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)

  if (error) {
    console.error('[DELETE /api/pessoas/[id]] erro:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
