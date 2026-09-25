import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import type { UsuarioPerfil } from '@/types/auth'
import type { EntidadeVinculo } from '@/lib/documentos/vinculos'

export interface UsuarioRota { id: string; empresa_id: string; perfil: UsuarioPerfil; nome: string }
export interface ContextoRota { usuario: UsuarioRota; token: string }

/** Bearer da sessão do navegador → usuário interno ativo (mesmo padrão de resolverUsuarioELead). */
export async function autenticarRota(request: NextRequest): Promise<ContextoRota | NextResponse> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: usuario } = await supabase
    .from('usuarios').select('id, empresa_id, perfil, nome')
    .eq('auth_user_id', user.id).eq('ativo', true).maybeSingle()
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return { usuario: usuario as UsuarioRota, token }
}

/** Cliente com o JWT do usuário: a RLS decide o que ele enxerga (carteira comercial). */
export function clienteDoUsuario(token: string): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** null = pode alterar; senão a resposta de erro pronta. `cliente` só é injetado em teste. */
export async function verificarDestino(
  ctx: ContextoRota,
  entidadeTipo: EntidadeVinculo,
  entidadeId: string,
  cliente?: SupabaseClient,
): Promise<NextResponse | null> {
  const acao = entidadeTipo === 'lead' ? 'leads.editar' : 'processos.editar'
  const negado = () => NextResponse.json(
    { error: `Você não pode alterar este ${entidadeTipo === 'lead' ? 'lead' : 'negócio'}.` },
    { status: 403 },
  )
  if (!await podeServidor(ctx.usuario.id, ctx.usuario.perfil, ctx.usuario.empresa_id, acao)) return negado()
  const tabela = entidadeTipo === 'lead' ? 'leads' : 'processos'
  const { data, error } = await (cliente ?? clienteDoUsuario(ctx.token))
    .from(tabela).select('id').eq('id', entidadeId).is('deleted_at', null).maybeSingle()
  if (error) {
    console.error('[documentos/vinculos] erro ao checar visibilidade:', error.message)
    return NextResponse.json({ error: 'Não foi possível verificar o destino.' }, { status: 500 })
  }
  return data ? null : negado()
}

export interface Participantes { pessoaIds: string[]; compradorasIds: string[]; vendedorasIds: string[]; titularLeadPessoaId: string | null }

/** Pessoas do lead (titular + cônjuge) ou do negócio (compradores, inclui cônjuge/coparticipante, + vendedores). */
export async function participantesDaEntidade(entidadeTipo: EntidadeVinculo, entidadeId: string, empresaId: string): Promise<Participantes> {
  if (entidadeTipo === 'lead') {
    const { data: lead, error } = await supabase.from('leads').select('pessoa_id, conjuge_pessoa_id')
      .eq('id', entidadeId).eq('empresa_id', empresaId).maybeSingle()
    if (error) throw new Error(`leads: ${error.message}`)
    const ids = [lead?.pessoa_id, lead?.conjuge_pessoa_id].filter((x): x is string => !!x)
    return { pessoaIds: Array.from(new Set(ids)), compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: lead?.pessoa_id ?? null }
  }
  const [{ data: comp, error: e1 }, { data: vend, error: e2 }] = await Promise.all([
    supabase.from('processo_compradores').select('pessoa_id').eq('processo_id', entidadeId).eq('empresa_id', empresaId),
    supabase.from('processo_vendedores').select('pessoa_id').eq('processo_id', entidadeId).eq('empresa_id', empresaId),
  ])
  if (e1 || e2) throw new Error(`participantes: ${(e1 ?? e2)!.message}`)
  const compradorasIds = (comp ?? []).map(c => c.pessoa_id as string | null).filter((x): x is string => !!x)
  const vendedorasIds = (vend ?? []).map(v => v.pessoa_id as string | null).filter((x): x is string => !!x)
  return { pessoaIds: Array.from(new Set([...compradorasIds, ...vendedorasIds])), compradorasIds, vendedorasIds, titularLeadPessoaId: null }
}
