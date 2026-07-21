import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('id, empresa_id, perfil')
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .eq('ativo', true)
    .single()

  if (!usuario) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })
  }

  // Verifica permissão leads.excluir no perfil
  const PERFIS_COM_EXCLUSAO = ['admin', 'gerente', 'gestor']
  if (!PERFIS_COM_EXCLUSAO.includes(usuario.perfil)) {
    return NextResponse.json({ error: 'Sem permissão para excluir leads' }, { status: 403 })
  }

  const { id: leadId } = params
  const body = await request.json().catch(() => ({})) as { motivo?: string }
  const motivo = body.motivo?.trim() ?? null

  // Verifica que o lead pertence à empresa
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('empresa_id', usuario.empresa_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  }

  const { error } = await supabaseAdmin
    .from('leads')
    .update({
      deleted_at: new Date().toISOString(),
      motivo_exclusao: motivo,
    })
    .eq('id', leadId)
    .eq('empresa_id', usuario.empresa_id)

  if (error) {
    console.error('[DELETE /api/leads/[id]] erro:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
