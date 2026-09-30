import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { autenticarRota, clienteDoUsuario } from '@/lib/documentos/vinculosServidor'

// Única escrita direta no modelo novo durante a B2b: "compõe renda" definido à mão na aba
// Pessoa. compoe_renda_manual é respeitado pela sincronização da Fase A (migration 331) e
// herdado pelo negócio na conversão.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const { usuario, token } = ctx

  const body = await request.json().catch(() => ({})) as { compoe_renda?: unknown }
  if (typeof body.compoe_renda !== 'boolean') {
    return NextResponse.json({ error: 'compoe_renda inválido' }, { status: 422 })
  }

  // Visível pelo JWT do usuário = dentro da carteira dele (RLS de participacoes → lead/processo).
  const { data: part, error } = await clienteDoUsuario(token)
    .from('participacoes').select('id, lead_id, processo_id').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Erro ao carregar o participante.' }, { status: 500 })
  if (!part) return NextResponse.json({ error: 'Participante não encontrado.' }, { status: 404 })

  const acao = part.lead_id ? 'leads.editar' : 'processos.editar'
  if (!(await podeServidor(usuario.id, usuario.perfil, usuario.empresa_id, acao))) {
    return NextResponse.json({ error: 'Sem permissão para editar esta proposta.' }, { status: 403 })
  }

  const { data: atualizado, error: eUp } = await supabase.from('participacoes')
    .update({ compoe_renda: body.compoe_renda, compoe_renda_manual: body.compoe_renda })
    .eq('id', part.id).eq('empresa_id', usuario.empresa_id).select('id')
  if (eUp || !atualizado?.length) {
    return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
