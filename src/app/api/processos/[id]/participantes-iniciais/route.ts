import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { autenticarRota, clienteDoUsuario } from '@/lib/documentos/vinculosServidor'
import { participantesIniciaisDoNegocio, type TitularNovoNegocio, type VendedorEscolhido } from '@/lib/participantes/escritaNegocio'

// POST /api/processos/[id]/participantes-iniciais — compradores/vendedores de um negócio recém-criado
// (Novo Processo, inclusive conversão do lead). Body: { lead_id?, titular?, vendedores? } (V2 B2c-C1c).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const { id: usuarioId, perfil, empresa_id: empresaId } = ctx.usuario
  const pode = await podeServidor(usuarioId, perfil, empresaId, 'processos.criar')
    || await podeServidor(usuarioId, perfil, empresaId, 'processos.editar')
  if (!pode) return NextResponse.json({ error: 'Sem permissão para criar negócio.' }, { status: 403 })

  const { data: processo, error } = await clienteDoUsuario(ctx.token).from('processos').select('id')
    .eq('id', params.id).is('deleted_at', null).maybeSingle()
  if (error) return NextResponse.json({ error: 'Erro ao verificar o negócio.' }, { status: 500 })
  if (!processo) return NextResponse.json({ error: 'Negócio não encontrado.' }, { status: 404 })

  // Só um negócio novo (sem nenhum participante ainda) — evita duplicar ao repetir a chamada.
  const { count: n, error: eN } = await supabase.from('participacoes')
    .select('id', { count: 'exact', head: true }).eq('processo_id', params.id)
  if (eN) return NextResponse.json({ error: 'Erro ao verificar o negócio.' }, { status: 500 })
  if ((n ?? 0) > 0) return NextResponse.json({ error: 'Este negócio já tem participantes.' }, { status: 409 })

  const body = await request.json().catch(() => ({})) as { lead_id?: string | null; titular?: TitularNovoNegocio | null; vendedores?: VendedorEscolhido[] | null }
  if (body.lead_id) {
    const { data: lead, error: eL } = await clienteDoUsuario(ctx.token).from('leads').select('id')
      .eq('id', body.lead_id).is('deleted_at', null).maybeSingle()
    if (eL) return NextResponse.json({ error: 'Erro ao verificar o lead.' }, { status: 500 })
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 })
  }
  const r = await participantesIniciaisDoNegocio(supabase, empresaId, params.id, {
    leadId: body.lead_id ?? null,
    titular: body.titular && typeof body.titular.nome === 'string' ? body.titular : null,
    vendedores: Array.isArray(body.vendedores) ? body.vendedores : null,
  })
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  return NextResponse.json({ ok: true })
}
