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

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const admin = await resolveAdmin(token)
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const { nome, email, senha, perfil, funcao, ativo = true } = body

  if (!nome?.trim() || !email?.trim() || !senha?.trim() || !perfil) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  // Cria no Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: senha,
    email_confirm: true,
  })
  if (authError) {
    if (authError.message.includes('already registered')) {
      return NextResponse.json({ error: 'Este e-mail já está em uso' }, { status: 409 })
    }
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Verifica se já existe registro na tabela usuarios com esse email
  const { data: existente } = await supabase
    .from('usuarios')
    .select('id')
    .eq('empresa_id', admin.empresa_id)
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  if (existente) {
    // Atualiza o registro existente vinculando o novo auth_user_id
    const { data, error } = await supabase
      .from('usuarios')
      .update({
        auth_user_id: authData.user.id,
        nome: nome.trim(),
        perfil,
        funcao: funcao ?? null,
        ativo,
      })
      .eq('id', existente.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 200 })
  }

  // Cria registro na tabela usuarios (id = auth_user_id, sem DEFAULT na coluna)
  const { data, error: insertError } = await supabase
    .from('usuarios')
    .insert({
      id: authData.user.id,
      empresa_id: admin.empresa_id,
      auth_user_id: authData.user.id,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      perfil,
      funcao: funcao ?? null,
      ativo,
    })
    .select()
    .single()

  if (insertError) {
    // Limpa o auth user criado para não deixar órfão
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
