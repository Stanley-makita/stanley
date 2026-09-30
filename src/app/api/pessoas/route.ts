import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import type { UsuarioPerfil } from '@/types/auth'

function getAuth(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  return token
}

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id, perfil')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ?? null
}

function buildQuery(empresa_id: string, q: string, cpfParam: string, ids: string[], offset: number, pageSize: number) {
  let query = supabase
    .from('pessoas')
    .select(`
      id, nome, cpf, email, created_at,
      pessoa_telefones(id, telefone, principal, whatsapp, ativo)
    `, { count: 'exact' })
    .eq('empresa_id', empresa_id)
    .is('deleted_at', null)
    .order('nome', { ascending: true })
    .range(offset, offset + pageSize - 1)

  if (ids.length > 0) {
    query = query.in('id', ids)
  } else if (cpfParam.trim()) {
    const cpfNorm = cpfParam.replace(/\D/g, '')
    if (cpfNorm) query = query.eq('cpf', cpfNorm)
  } else if (q.trim()) {
    query = query.ilike('nome', `%${q.trim()}%`)
  }

  return query
}

export async function GET(request: NextRequest) {
  const token = getAuth(request)
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!(await podeServidor(usuario.id, usuario.perfil as UsuarioPerfil, usuario.empresa_id, 'pessoas.ver'))) {
    return NextResponse.json({ error: 'Sem permissão para ver pessoas' }, { status: 403 })
  }
  const { empresa_id } = usuario

  const q = request.nextUrl.searchParams.get('q') ?? ''
  const cpfParam = request.nextUrl.searchParams.get('cpf') ?? ''
  const idsParam = request.nextUrl.searchParams.get('ids') ?? ''
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
  // Vendedor (dono do imóvel na ponta vendedora) não é "cliente" de ninguém — restringir
  // por carteira aqui bloqueava um comercial de achar/reaproveitar um vendedor já
  // cadastrado por outro comercial ou sem lead nenhum, e ele acabava recriando a pessoa
  // (achado real, 2026-09-22: busca de vendedor sempre vazia pra quem não era dono do
  // lead da pessoa). Comprador/Cliente continua restrito — é o caso que a carteira
  // protege de verdade (ver migration 20260801_228).
  const papel = request.nextUrl.searchParams.get('papel') ?? ''
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1'))
  const pageSize = 30
  const offset = (page - 1) * pageSize

  let query = buildQuery(empresa_id, q, cpfParam, ids, offset, pageSize)

  // Rota usa service-role (supabaseAdmin), então RLS não se aplica aqui —
  // a mesma regra de carteira comercial da RLS de `pessoas` (ver migration
  // 20260724_186) precisa ser replicada manualmente: perfil comercial só
  // vê pessoas com lead atual (não excluído) onde ele é o responsável.
  // Participante (coparticipante/cônjuge na aba Pessoa do lead) segue a decisão da spec V2:
  // pode ser Pessoa de outra carteira — a resposta traz `cliente_de` para a tela avisar.
  if (usuario.perfil === 'comercial' && papel !== 'vendedor' && papel !== 'participante') {
    const { data: leadsDaCarteira } = await supabase
      .from('leads')
      .select('pessoa_id')
      .eq('responsavel_id', usuario.id)
      .is('deleted_at', null)
      .not('pessoa_id', 'is', null)

    const pessoaIds = Array.from(
      new Set((leadsDaCarteira ?? []).map((l) => l.pessoa_id).filter((id): id is string => !!id))
    )

    if (pessoaIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, pageSize })
    }

    query = query.in('id', pessoaIds)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[api/pessoas] erro ao listar:', error)
    return NextResponse.json({ error: 'Erro ao buscar pessoas' }, { status: 500 })
  }

  let resultado: Array<Record<string, unknown> & { id: string }> = (data ?? []) as Array<Record<string, unknown> & { id: string }>
  if (papel === 'participante' && resultado.length > 0) {
    const { data: leadsAbertos, error: erroLeads } = await supabase
      .from('leads')
      .select('pessoa_id, responsavel:usuarios!responsavel_id(id, nome)')
      .in('pessoa_id', resultado.map((p) => p.id))
      .is('deleted_at', null)
      .is('perdido_em', null)
      .is('convertido_em', null)
    if (erroLeads) console.error('[api/pessoas] erro ao buscar leads dos participantes:', erroLeads)
    const donoDe = new Map<string, string>()
    for (const l of (leadsAbertos ?? []) as Array<{ pessoa_id: string | null; responsavel: { id: string; nome: string } | { id: string; nome: string }[] | null }>) {
      const r = Array.isArray(l.responsavel) ? l.responsavel[0] : l.responsavel
      if (r && r.id !== usuario.id && l.pessoa_id) donoDe.set(l.pessoa_id, r.nome)
    }
    resultado = resultado.map((p) => ({ ...p, cliente_de: donoDe.get(p.id) ?? null }))
  }

  return NextResponse.json({ data: resultado, total: count ?? 0, page, pageSize })
}
