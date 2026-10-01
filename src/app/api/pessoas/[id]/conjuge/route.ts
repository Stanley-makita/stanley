import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { autenticarRota, clienteDoUsuario } from '@/lib/documentos/vinculosServidor'
import { registrarCasamento } from '@/lib/participantes/casamentoServidor'
import { casarComNovoConjuge, type DadosNovoConjuge } from '@/lib/participantes/escritaServidor'

// "Casado(a) com" na aba Pessoa: grava os ponteiros antigos (pessoas.conjuge_pessoa_id) e estado
// civil/regime/data NOS DOIS lados; a sincronização da Fase A (fn_pv2_pessoas) cria ou encerra o
// Relacionamento. Encerrar o casamento de OUTRA pessoa exige confirmação explícita (409).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const { usuario, token } = ctx
  if (!(await podeServidor(usuario.id, usuario.perfil, usuario.empresa_id, 'pessoas.editar'))) {
    return NextResponse.json({ error: 'Sem permissão para editar pessoas.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as {
    conjuge_pessoa_id?: string | null; estado_civil?: string; regime_casamento?: string | null
    data_casamento?: string | null; confirmar_encerrar?: boolean
    /** Cônjuge digitado (seção Cônjuge de quem ainda não tem cônjuge cadastrado) — cria/reaproveita e liga. */
    novo_conjuge?: DadosNovoConjuge
  }
  const pessoaId = params.id
  const conjugeId = body.conjuge_pessoa_id ?? null
  const estadoCivil = body.estado_civil === 'uniao_estavel' ? 'uniao_estavel' : 'casado'

  // As duas Pessoas têm que ser visíveis pelo JWT do usuário (carteira + participação).
  const ids = conjugeId ? [pessoaId, conjugeId] : [pessoaId]
  const { data: visiveis, error: eVis } = await clienteDoUsuario(token)
    .from('pessoas').select('id').in('id', ids).is('deleted_at', null)
  if (eVis) return NextResponse.json({ error: 'Erro ao verificar acesso.' }, { status: 500 })
  if ((visiveis ?? []).length !== ids.length) return NextResponse.json({ error: 'Pessoa não encontrada.' }, { status: 404 })

  if (!conjugeId && body.novo_conjuge?.nome?.trim()) {
    const n = await casarComNovoConjuge(supabase, usuario.empresa_id, pessoaId, body.novo_conjuge, {
      estadoCivil, regime: body.regime_casamento ?? null, data: body.data_casamento ?? null,
      confirmarEncerrar: !!body.confirmar_encerrar,
    })
    if ('erro' in n) return NextResponse.json({ error: n.erro }, { status: n.status })
    if ('confirmar' in n) return NextResponse.json({ error: 'confirmar_encerrar', encerra: n.confirmar, conjuge_pessoa_id: n.conjugeId }, { status: 409 })
    return NextResponse.json({ ok: true, conjuge_pessoa_id: n.conjugeId })
  }

  const r = await registrarCasamento(supabase, usuario.empresa_id, pessoaId, conjugeId, {
    estadoCivil, regime: body.regime_casamento ?? null, data: body.data_casamento ?? null,
    confirmarEncerrar: !!body.confirmar_encerrar,
  })
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  if ('confirmar' in r) return NextResponse.json({ error: 'confirmar_encerrar', encerra: r.confirmar }, { status: 409 })
  return NextResponse.json({ ok: true, conjuge_pessoa_id: conjugeId })
}
