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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const isGestor = ['admin', 'gerente'].includes(usuario.perfil)

  const { data, error } = await supabase
    .from('base_conhecimento_docs')
    .select(`
      id, titulo, descricao, tipo, conteudo,
      arquivo_url, arquivo_nome, arquivo_tamanho_kb,
      link_url, tags, publicado, created_at, updated_at,
      categoria:base_conhecimento_categorias(id, nome, icone, cor),
      publicado_por_usuario:usuarios!publicado_por(nome)
    `)
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (!isGestor && !data.publicado) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })

  // Gera URL assinada para arquivos no Supabase Storage (válida por 1h)
  let arquivoUrlAssinada: string | null = null
  if (data.tipo === 'arquivo' && data.arquivo_url) {
    // arquivo_url armazena o path no storage (ex: "empresa_id/uuid/arquivo.pdf")
    const { data: signed } = await supabase.storage
      .from('base-conhecimento')
      .createSignedUrl(data.arquivo_url, 3600)
    arquivoUrlAssinada = signed?.signedUrl ?? null
  }

  return NextResponse.json({ ...data, arquivo_url_assinada: arquivoUrlAssinada })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['admin', 'gerente'].includes(usuario.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const campos: Record<string, unknown> = {}
  if (body.titulo !== undefined) campos.titulo = String(body.titulo).trim()
  if (body.descricao !== undefined) campos.descricao = body.descricao ?? null
  if (body.categoria_id !== undefined) campos.categoria_id = body.categoria_id ?? null
  if (body.conteudo !== undefined) campos.conteudo = body.conteudo ?? null
  if (body.arquivo_url !== undefined) campos.arquivo_url = body.arquivo_url ?? null
  if (body.arquivo_nome !== undefined) campos.arquivo_nome = body.arquivo_nome ?? null
  if (body.arquivo_tamanho_kb !== undefined) campos.arquivo_tamanho_kb = body.arquivo_tamanho_kb ?? null
  if (body.link_url !== undefined) campos.link_url = body.link_url ?? null
  if (body.tags !== undefined) campos.tags = Array.isArray(body.tags) ? body.tags : []
  if (body.publicado !== undefined) {
    campos.publicado = body.publicado === true
    campos.publicado_por = body.publicado === true ? usuario.id : null
  }

  const { error } = await supabase
    .from('base_conhecimento_docs')
    .update(campos)
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)

  if (error) return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['admin', 'gerente'].includes(usuario.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { error } = await supabase
    .from('base_conhecimento_docs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)

  if (error) return NextResponse.json({ error: 'Erro ao excluir' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
