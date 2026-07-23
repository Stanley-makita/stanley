import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

function getAuth(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  return token
}

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id, perfil')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ?? null
}

function buildQuery(empresa_id: string, q: string, cpfParam: string, offset: number, pageSize: number) {
  let query = supabase
    .from('pessoas')
    .select(`
      id, nome, cpf, email, created_at,
      pessoa_telefones(id, telefone, principal, whatsapp, ativo)
    `, { count: 'exact' })
    .eq('empresa_id', empresa_id)
    .order('nome', { ascending: true })
    .range(offset, offset + pageSize - 1)

  if (cpfParam.trim()) {
    const cpfNorm = cpfParam.replace(/\D/g, '')
    if (cpfNorm) query = query.eq('cpf', cpfNorm)
  } else if (q.trim()) {
    query = query.ilike('nome', `%${q.trim()}%`)
  }

  return query
}

export async function GET(request: NextRequest) {
  const token = getAuth(request)
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { empresa_id } = usuario

  const q = request.nextUrl.searchParams.get('q') ?? ''
  const cpfParam = request.nextUrl.searchParams.get('cpf') ?? ''
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1'))
  const pageSize = 30
  const offset = (page - 1) * pageSize

  let query = buildQuery(empresa_id, q, cpfParam, offset, pageSize)

  // Rota usa service-role (supabaseAdmin), então RLS não se aplica aqui —
  // a mesma regra de carteira comercial da RLS de `pessoas` (ver migration
  // 20260724_186) precisa ser replicada manualmente: perfil comercial só
  // vê pessoas com lead atual (não excluído) onde ele é o responsável.
  if (usuario.perfil === 'comercial') {
    const { data: leadsDaCarteira } = await supabase
      .from('leads')
      .select('pessoa_id')
      .eq('responsavel_id', usuario.id)
      .is('deleted_at', null)
      .not('pessoa_id', 'is', null)

    const pessoaIds = Array.from(
      new Set((leadsDaCarteira ?? []).map((l) => l.pessoa_id).filter((id): id is string => !!id))
    )

    if (pessoaIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, pageSize })
    }

    query = query.in('id', pessoaIds)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[api/pessoas] erro ao listar:', error)
    return NextResponse.json({ error: 'Erro ao buscar pessoas' }, { status: 500 })
  }

  return NextResponse.json({ data, total: count ?? 0, page, pageSize })
}
