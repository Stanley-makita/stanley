import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getAuth(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  return token
}

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

export async function GET(request: NextRequest) {
  const token = getAuth(request)
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q') ?? ''
  const cpfParam = request.nextUrl.searchParams.get('cpf') ?? ''
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1'))
  const pageSize = 30
  const offset = (page - 1) * pageSize

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

  const { data, count, error } = await query

  if (error) {
    console.error('[api/pessoas] erro ao listar:', error)
    return NextResponse.json({ error: 'Erro ao buscar pessoas' }, { status: 500 })
  }

  return NextResponse.json({ data, total: count ?? 0, page, pageSize })
}
