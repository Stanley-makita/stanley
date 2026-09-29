import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import type { UsuarioPerfil } from '@/types/auth'
import type { EntidadeVinculo } from '@/lib/documentos/vinculos'
import { PAPEIS_COMPRA, PAPEIS_VENDA, type PapelParticipacao } from '@/lib/participantes/tipos'

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

/** Pessoas do lead (lado da compra) ou do negócio (compra + venda), via participacoes. */
export async function participantesDaEntidade(entidadeTipo: EntidadeVinculo, entidadeId: string, empresaId: string): Promise<Participantes> {
  const coluna = entidadeTipo === 'lead' ? 'lead_id' : 'processo_id'
  const { data, error } = await supabase.from('participacoes').select('pessoa_id, papel')
    .eq(coluna, entidadeId).eq('empresa_id', empresaId)
  if (error) throw new Error(`participantes: ${error.message}`)
  const linhas = (data ?? []) as Array<{ pessoa_id: string; papel: PapelParticipacao }>
  const compra = linhas.filter(l => PAPEIS_COMPRA.includes(l.papel)).map(l => l.pessoa_id)
  const venda = linhas.filter(l => PAPEIS_VENDA.includes(l.papel)).map(l => l.pessoa_id)
  if (entidadeTipo === 'lead') {
    // Lead: pasta sugerida não distingue comprador/vendedor (comportamento anterior).
    const titular = linhas.find(l => l.papel === 'titular')?.pessoa_id ?? null
    return { pessoaIds: Array.from(new Set(compra)), compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: titular }
  }
  return { pessoaIds: Array.from(new Set([...compra, ...venda])), compradorasIds: compra, vendedorasIds: venda, titularLeadPessoaId: null }
}
