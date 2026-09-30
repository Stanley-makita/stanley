import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { autenticarRota, clienteDoUsuario } from '@/lib/documentos/vinculosServidor'
import { planoCasamento } from '@/lib/participantes/casamento'

const REGIMES = ['comunhao_parcial', 'comunhao_total', 'separacao_total', 'participacao_final']

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
  }
  const pessoaId = params.id
  const conjugeId = body.conjuge_pessoa_id ?? null
  const estadoCivil = body.estado_civil === 'uniao_estavel' ? 'uniao_estavel' : 'casado'
  const regime = body.regime_casamento && REGIMES.includes(body.regime_casamento) ? body.regime_casamento : null
  const dataCasamento = body.data_casamento && /^\d{4}-\d{2}-\d{2}$/.test(body.data_casamento) ? body.data_casamento : null

  // As duas Pessoas têm que ser visíveis pelo JWT do usuário (carteira + participação).
  const ids = conjugeId ? [pessoaId, conjugeId] : [pessoaId]
  const { data: visiveis, error: eVis } = await clienteDoUsuario(token)
    .from('pessoas').select('id').in('id', ids).is('deleted_at', null)
  if (eVis) return NextResponse.json({ error: 'Erro ao verificar acesso.' }, { status: 500 })
  if ((visiveis ?? []).length !== ids.length) return NextResponse.json({ error: 'Pessoa não encontrada.' }, { status: 404 })

  const { data: atuais, error: eAt } = await supabase.from('pessoas')
    .select('id, nome, conjuge_pessoa_id').eq('empresa_id', usuario.empresa_id).in('id', ids).is('deleted_at', null)
  if (eAt || !atuais || atuais.length !== ids.length) return NextResponse.json({ error: 'Pessoa não encontrada.' }, { status: 404 })
  const conjugeAtualDe: Record<string, string | null> = {}
  for (const p of atuais) conjugeAtualDe[p.id] = p.conjuge_pessoa_id
  const outros = atuais.map(p => p.conjuge_pessoa_id).filter((x): x is string => !!x && !ids.includes(x))
  if (outros.length) {
    const { data: ex, error: eEx } = await supabase.from('pessoas').select('id, conjuge_pessoa_id').in('id', outros)
    if (eEx) return NextResponse.json({ error: 'Erro ao carregar o casamento atual.' }, { status: 500 })
    for (const p of ex ?? []) conjugeAtualDe[p.id] = p.conjuge_pessoa_id
  }

  let plano: ReturnType<typeof planoCasamento>
  try { plano = planoCasamento({ conjugeAtualDe }, pessoaId, conjugeId) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }) }

  // Desfazer o casamento da própria pessoa é o que ela pediu; encerrar o de terceiros exige confirmação.
  const terceiros = plano.encerrar.filter(id => id !== pessoaId && id !== conjugeAtualDe[pessoaId])
  if (terceiros.length && !body.confirmar_encerrar) {
    const { data: nomes } = await supabase.from('pessoas').select('id, nome').in('id', terceiros)
    return NextResponse.json({ error: 'confirmar_encerrar', encerra: nomes ?? [] }, { status: 409 })
  }

  for (const id of plano.encerrar) {
    const { error } = await supabase.from('pessoas').update({ conjuge_pessoa_id: null })
      .eq('id', id).eq('empresa_id', usuario.empresa_id)
    if (error) return NextResponse.json({ error: 'Erro ao atualizar o casamento.' }, { status: 500 })
  }
  if (plano.ligar) {
    const [a, b] = plano.ligar
    for (const [de, para] of [[a, b], [b, a]] as const) {
      const { data, error } = await supabase.from('pessoas')
        .update({ conjuge_pessoa_id: para, estado_civil: estadoCivil, regime_casamento: regime, data_casamento: dataCasamento })
        .eq('id', de).eq('empresa_id', usuario.empresa_id).select('id')
      if (error || !data?.length) return NextResponse.json({ error: 'Erro ao gravar o casamento.' }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
