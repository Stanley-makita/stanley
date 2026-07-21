import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const admin = await resolveAdmin(token)
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { novaSenha } = await request.json()
  if (!novaSenha || novaSenha.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter ao menos 6 caracteres' }, { status: 400 })
  }

  // Busca o auth_user_id do usuário alvo
  const { data: usuario, error: findError } = await supabase
    .from('usuarios')
    .select('auth_user_id')
    .eq('id', params.id)
    .eq('empresa_id', admin.empresa_id)
    .single()

  if (findError || !usuario?.auth_user_id) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  const { error } = await supabase.auth.admin.updateUserById(
    usuario.auth_user_id,
    { password: novaSenha }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
