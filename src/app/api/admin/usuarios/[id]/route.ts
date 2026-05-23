import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resolveAdmin(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id, perfil')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario || usuario.perfil !== 'admin') return null
  return usuario
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const admin = await resolveAdmin(token)
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const { nome, perfil, funcao, ativo } = body

  const update: Record<string, unknown> = {}
  if (nome  !== undefined) update.nome  = nome?.trim() || undefined
  if (perfil !== undefined) update.perfil = perfil
  if (funcao !== undefined) update.funcao = funcao ?? null
  if (ativo  !== undefined) update.ativo  = ativo

  const { data, error } = await supabase
    .from('usuarios')
    .update(update)
    .eq('id', params.id)
    .eq('empresa_id', admin.empresa_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
