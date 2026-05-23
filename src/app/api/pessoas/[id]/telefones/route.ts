import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('id')
    .eq('id', params.id)
    .eq('empresa_id', empresa_id)
    .single()
  if (!pessoa) return NextResponse.json({ error: 'Pessoa não encontrada' }, { status: 404 })

  let body: { telefone?: string; whatsapp?: boolean; principal?: boolean }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const telefone = String(body.telefone ?? '').trim()
  if (!telefone) return NextResponse.json({ error: 'Telefone é obrigatório' }, { status: 422 })

  // Se marcado como principal, remove o flag dos outros
  if (body.principal) {
    await supabase
      .from('pessoa_telefones')
      .update({ principal: false })
      .eq('pessoa_id', params.id)
  }

  const { data, error } = await supabase
    .from('pessoa_telefones')
    .insert({
      pessoa_id: params.id,
      empresa_id,
      telefone,
      whatsapp: body.whatsapp ?? true,
      principal: body.principal ?? false,
      ativo: true,
    })
    .select('id, telefone, principal, whatsapp, ativo')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Telefone já cadastrado para esta pessoa' }, { status: 409 })
    return NextResponse.json({ error: 'Erro ao adicionar telefone' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
