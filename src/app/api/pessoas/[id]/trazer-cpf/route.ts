import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { autenticarRota, clienteDoUsuario, type ContextoRota } from '@/lib/documentos/vinculosServidor'
import { cpfValido } from '@/lib/cpf'
import { avaliarCadastroSolto } from '@/lib/participantes/cadastroSolto'

// CPF recusado (UNIQUE) porque está noutro cadastro. GET: quem é o dono e se dá para juntar.
// POST: junta o cadastro solto NESTE (merge_pessoas, migration 332) e grava o CPF aqui e no lead.
// Só pede `pessoas.editar` (não `pessoas.merge`) porque só aceita duplicado fora de qualquer proposta.

type Avaliado =
  | { erro: string; status: number }
  | { principal: { id: string; nome: string }; dono: { id: string; nome: string } | null; cpf: string; pode: boolean; motivo?: string }

async function avaliar(ctx: ContextoRota, pessoaId: string, cpfBruto: string): Promise<Avaliado> {
  const { id: usuarioId, perfil, empresa_id: empresaId } = ctx.usuario
  if (!(await podeServidor(usuarioId, perfil, empresaId, 'pessoas.editar'))) {
    return { erro: 'Permissão insuficiente', status: 403 }
  }
  const cpf = cpfBruto.replace(/\D/g, '')
  if (!cpfValido(cpf)) return { erro: 'CPF inválido.', status: 422 }

  const { data: principal, error: ePri } = await clienteDoUsuario(ctx.token).from('pessoas')
    .select('id, nome').eq('id', pessoaId).is('deleted_at', null).maybeSingle()
  if (ePri) return { erro: 'Erro ao carregar a pessoa.', status: 500 }
  if (!principal) return { erro: 'Pessoa não encontrada.', status: 404 }

  // Dono do CPF pelo service role: um duplicado sem lead fica fora da carteira do usuário (RLS) e a tela
  // nem conseguia mostrar o nome dele.
  const { data: dono, error: eDono } = await supabase.from('pessoas').select('id, nome')
    .eq('empresa_id', empresaId).eq('cpf', cpf).is('deleted_at', null).neq('id', pessoaId)
    .abortSignal(AbortSignal.timeout(10_000)).maybeSingle()
  if (eDono) return { erro: 'Erro ao buscar o dono do CPF.', status: 500 }
  if (!dono) return { principal, dono: null, cpf, pode: false, motivo: 'cpf_livre' }

  const [{ count: nParticipacoes, error: eP }, { count: nLeads, error: eL }] = await Promise.all([
    supabase.from('participacoes').select('id', { count: 'exact', head: true }).eq('pessoa_id', dono.id),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('pessoa_id', dono.id).is('deleted_at', null),
  ])
  if (eP || eL) return { erro: 'Erro ao verificar o outro cadastro.', status: 500 }

  const r = avaliarCadastroSolto(principal.nome as string, {
    nome: dono.nome as string, emProposta: (nParticipacoes ?? 0) + (nLeads ?? 0) > 0,
  })
  return { principal, dono, cpf, pode: r.pode, motivo: r.pode ? undefined : r.motivo }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const r = await avaliar(ctx, params.id, request.nextUrl.searchParams.get('cpf') ?? '')
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  return NextResponse.json({ dono: r.dono ? { nome: r.dono.nome } : null, pode_juntar: r.pode, motivo: r.motivo ?? null })
}

// Mesmas mensagens da rota de Mesclar para os conflitos que merge_pessoas recusa.
const MENSAGENS: Record<string, string> = {
  merge_operador: 'O outro cadastro é de um usuário da equipe — não pode ser juntado.',
  merge_conjuges_diferentes: 'Os dois cadastros têm cônjuges diferentes. Ajuste o casamento antes de juntar.',
  pessoa_ja_tem_relacionamento_vigente: 'Os dois cadastros têm casamentos diferentes registrados. Ajuste o casamento antes de juntar.',
  merge_dois_leads_abertos: 'Os dois cadastros têm lead em aberto.',
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => null) as { cpf?: unknown } | null
  const r = await avaliar(ctx, params.id, typeof body?.cpf === 'string' ? body.cpf : '')
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  if (!r.dono) return NextResponse.json({ error: 'Esse CPF não está em outro cadastro — salve de novo.' }, { status: 409 })
  if (!r.pode) {
    const msg = r.motivo === 'em_proposta'
      ? `O CPF é de "${r.dono.nome}", que está em outro lead ou negócio. Se for a mesma pessoa, use "Mesclar" em Pessoas.`
      : `O CPF é de "${r.dono.nome}", com outro nome. Confira o CPF digitado.`
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const { empresa_id: empresaId, id: usuarioId } = ctx.usuario
  const { error } = await supabase.rpc('merge_pessoas', {
    p_principal: r.principal.id, p_secundaria: r.dono.id, p_empresa: empresaId, p_usuario: usuarioId,
  })
  if (error) {
    const conhecido = Object.keys(MENSAGENS).find(k => error.message?.includes(k))
    if (conhecido) return NextResponse.json({ error: MENSAGENS[conhecido] }, { status: 409 })
    console.error('[pessoas/trazer-cpf] merge falhou:', error.message)
    return NextResponse.json({ error: 'Não foi possível juntar os cadastros. Nada foi alterado.' }, { status: 500 })
  }

  // merge_pessoas só preenche o CPF se a principal não tinha nenhum; aqui o usuário digitou ESTE CPF.
  const { error: eCpf } = await supabase.from('pessoas').update({ cpf: r.cpf }).eq('id', r.principal.id)
  if (eCpf) {
    console.error('[pessoas/trazer-cpf] CPF não gravado após juntar:', eCpf.message)
    return NextResponse.json({ error: 'Cadastros juntados, mas o CPF não foi gravado. Salve de novo.' }, { status: 500 })
  }
  await supabase.from('leads').update({ cpf: r.cpf })
    .eq('pessoa_id', r.principal.id).eq('empresa_id', empresaId).is('deleted_at', null)

  return NextResponse.json({ ok: true, juntado: r.dono.nome })
}
