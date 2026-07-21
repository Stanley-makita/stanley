import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function resolveEmpresa(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id, perfil')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ?? null
}

// Mescla pessoa_secundaria → pessoa_principal (params.id)
// Move todos os vínculos e desativa a secundária
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveEmpresa(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Apenas admin ou gerente podem fazer merge
  if (!['admin', 'gerente'].includes(usuario.perfil)) {
    return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 })
  }

  let body: { pessoa_id_secundaria?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { pessoa_id_secundaria } = body
  if (!pessoa_id_secundaria) return NextResponse.json({ error: 'pessoa_id_secundaria é obrigatório' }, { status: 422 })
  if (pessoa_id_secundaria === params.id) return NextResponse.json({ error: 'Não é possível mesclar uma pessoa consigo mesma' }, { status: 422 })

  const empresa_id = usuario.empresa_id

  // Verifica que ambas as pessoas pertencem à empresa
  const { data: pessoas } = await supabase
    .from('pessoas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .in('id', [params.id, pessoa_id_secundaria])

  if ((pessoas?.length ?? 0) < 2) {
    return NextResponse.json({ error: 'Uma ou ambas as pessoas não encontradas' }, { status: 404 })
  }

  // Move telefones (ignora conflitos — mesmo telefone já pode existir no principal)
  await supabase
    .from('pessoa_telefones')
    .update({ pessoa_id: params.id })
    .eq('pessoa_id', pessoa_id_secundaria)
    .eq('empresa_id', empresa_id)

  // Move leads
  await supabase
    .from('leads')
    .update({ pessoa_id: params.id })
    .eq('pessoa_id', pessoa_id_secundaria)
    .eq('empresa_id', empresa_id)

  // Move conversas
  await supabase
    .from('conversas')
    .update({ pessoa_id: params.id })
    .eq('pessoa_id', pessoa_id_secundaria)
    .eq('empresa_id', empresa_id)

  // Move processo_compradores e processo_vendedores
  await supabase
    .from('processo_compradores')
    .update({ pessoa_id: params.id })
    .eq('pessoa_id', pessoa_id_secundaria)
    .eq('empresa_id', empresa_id)

  await supabase
    .from('processo_vendedores')
    .update({ pessoa_id: params.id })
    .eq('pessoa_id', pessoa_id_secundaria)
    .eq('empresa_id', empresa_id)

  // Deleta a pessoa secundária (todos os vínculos já foram movidos)
  await supabase
    .from('pessoas')
    .delete()
    .eq('id', pessoa_id_secundaria)
    .eq('empresa_id', empresa_id)

  return NextResponse.json({ ok: true, pessoa_principal_id: params.id })
}
