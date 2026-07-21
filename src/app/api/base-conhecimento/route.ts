import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

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

function getToken(req: NextRequest) {
  return req.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
}

export async function GET(request: NextRequest) {
  const token = getToken(request)
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q') ?? ''
  const categoria_id = request.nextUrl.searchParams.get('categoria_id') ?? ''
  const tipo = request.nextUrl.searchParams.get('tipo') ?? ''
  const isGestor = ['admin', 'gerente', 'gestor'].includes(usuario.perfil)

  let query = supabase
    .from('base_conhecimento_docs')
    .select(`
      id, titulo, descricao, tipo, arquivo_nome, arquivo_tamanho_kb,
      link_url, tags, publicado, created_at, updated_at,
      categoria:base_conhecimento_categorias(id, nome, icone, cor),
      publicado_por_usuario:usuarios!publicado_por(nome)
    `)
    .eq('empresa_id', usuario.empresa_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (!isGestor) query = query.eq('publicado', true)
  if (categoria_id) query = query.eq('categoria_id', categoria_id)
  if (tipo) query = query.eq('tipo', tipo)
  if (q.trim()) query = query.ilike('titulo', `%${q.trim()}%`)

  const { data, error } = await query

  if (error) {
    console.error('[api/biblioteca] erro:', error)
    return NextResponse.json({ error: 'Erro ao buscar documentos' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const token = getToken(request)
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['admin', 'gerente', 'gestor'].includes(usuario.perfil)) {
    return NextResponse.json({ error: 'Sem permissão para publicar' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { titulo, descricao, tipo, categoria_id, conteudo, arquivo_url, arquivo_nome, arquivo_tamanho_kb, link_url, tags, publicado } = body as Record<string, unknown>

  if (!titulo || !tipo) return NextResponse.json({ error: 'titulo e tipo são obrigatórios' }, { status: 422 })

  const { data, error } = await supabase
    .from('base_conhecimento_docs')
    .insert({
      empresa_id: usuario.empresa_id,
      titulo: String(titulo).trim(),
      descricao: descricao ? String(descricao).trim() : null,
      tipo,
      categoria_id: categoria_id ?? null,
      conteudo: conteudo ?? null,
      arquivo_url: arquivo_url ?? null,
      arquivo_nome: arquivo_nome ?? null,
      arquivo_tamanho_kb: arquivo_tamanho_kb ?? null,
      link_url: link_url ?? null,
      tags: Array.isArray(tags) ? tags : [],
      publicado: publicado === true,
      publicado_por: publicado === true ? usuario.id : null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[api/biblioteca] erro ao criar:', error)
    return NextResponse.json({ error: 'Erro ao criar documento' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
