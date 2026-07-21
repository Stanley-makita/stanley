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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; telefone_id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Não permite remover o único telefone ativo
  const { count } = await supabase
    .from('pessoa_telefones')
    .select('*', { count: 'exact', head: true })
    .eq('pessoa_id', params.id)
    .eq('ativo', true)

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'Não é possível remover o único telefone ativo' }, { status: 422 })
  }

  // Soft delete: marca como inativo em vez de deletar (preserva histórico)
  const { error } = await supabase
    .from('pessoa_telefones')
    .update({ ativo: false })
    .eq('id', params.telefone_id)
    .eq('pessoa_id', params.id)
    .eq('empresa_id', empresa_id)

  if (error) return NextResponse.json({ error: 'Erro ao remover telefone' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
