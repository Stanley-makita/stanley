import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('id, empresa_id, perfil')
    .eq('auth_user_id', user.id)
    .single()
  return data ?? null
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('base_conhecimento_categorias')
    .select('id, nome, icone, cor, ordem')
    .eq('empresa_id', usuario.empresa_id)
    .order('ordem', { ascending: true })

  if (error) return NextResponse.json({ error: 'Erro ao buscar categorias' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['admin', 'gerente'].includes(usuario.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: { nome?: string; icone?: string; cor?: string; ordem?: number }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  if (!body.nome) return NextResponse.json({ error: 'nome é obrigatório' }, { status: 422 })

  const { data, error } = await supabase
    .from('base_conhecimento_categorias')
    .insert({
      empresa_id: usuario.empresa_id,
      nome: String(body.nome).trim(),
      icone: body.icone ?? 'FolderOpen',
      cor: body.cor ?? '#6B7280',
      ordem: body.ordem ?? 0,
    })
    .select('id, nome, icone, cor, ordem')
    .single()

  if (error) return NextResponse.json({ error: 'Erro ao criar categoria' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
