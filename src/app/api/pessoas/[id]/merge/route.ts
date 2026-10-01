import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { autenticarRota, clienteDoUsuario } from '@/lib/documentos/vinculosServidor'

// Mensagens dos conflitos que a função merge_pessoas (migration 332) recusa — nada é gravado.
const MENSAGENS: Record<string, { msg: string; status: number }> = {
  merge_operador: { msg: 'Uma das pessoas é cadastro de um usuário da equipe — não pode ser mesclada.', status: 422 },
  merge_conjuges_diferentes: { msg: 'As duas pessoas têm cônjuges diferentes cadastrados. Ajuste o casamento de uma delas antes de mesclar.', status: 409 },
  // trigger de um casamento vigente por pessoa (pessoa_relacionamentos) — mesmo caso, por outro caminho
  pessoa_ja_tem_relacionamento_vigente: { msg: 'As duas pessoas têm casamentos diferentes registrados. Ajuste o casamento de uma delas antes de mesclar.', status: 409 },
  merge_dois_leads_abertos: { msg: 'As duas pessoas têm lead em aberto. Encerre ou exclua um dos leads antes de mesclar.', status: 409 },
  merge_pessoa_nao_encontrada: { msg: 'Uma ou ambas as pessoas não foram encontradas.', status: 404 },
  merge_invalido: { msg: 'Não é possível mesclar uma pessoa consigo mesma.', status: 422 },
}

// POST /api/pessoas/[id]/merge — mescla pessoa_id_secundaria → [id] (principal).
// V2 (B2c-C1d): tudo numa transação só (merge_pessoas), inclusive participantes, cônjuge e documentos.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const { id: usuarioId, perfil, empresa_id: empresaId } = ctx.usuario
  if (!(await podeServidor(usuarioId, perfil, empresaId, 'pessoas.merge'))) {
    return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { pessoa_id_secundaria?: unknown } | null
  const secundaria = typeof body?.pessoa_id_secundaria === 'string' ? body.pessoa_id_secundaria : ''
  if (!secundaria) return NextResponse.json({ error: 'pessoa_id_secundaria é obrigatório' }, { status: 422 })
  if (secundaria === params.id) return NextResponse.json({ error: MENSAGENS.merge_invalido.msg }, { status: 422 })

  // As duas precisam estar visíveis para o usuário (RLS de carteira).
  const { data: visiveis, error: eVis } = await clienteDoUsuario(ctx.token).from('pessoas').select('id')
    .in('id', [params.id, secundaria]).is('deleted_at', null)
  if (eVis) return NextResponse.json({ error: 'Erro ao verificar as pessoas.' }, { status: 500 })
  if ((visiveis ?? []).length < 2) return NextResponse.json({ error: MENSAGENS.merge_pessoa_nao_encontrada.msg }, { status: 404 })

  const { error } = await supabase.rpc('merge_pessoas', {
    p_principal: params.id, p_secundaria: secundaria, p_empresa: empresaId, p_usuario: usuarioId,
  })
  if (error) {
    const conhecido = Object.keys(MENSAGENS).find(k => error.message?.includes(k))
    if (conhecido) return NextResponse.json({ error: MENSAGENS[conhecido].msg }, { status: MENSAGENS[conhecido].status })
    console.error('[pessoas/merge] falhou:', error.message)
    return NextResponse.json({ error: 'Não foi possível mesclar as pessoas. Nada foi alterado.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, pessoa_principal_id: params.id })
}
