import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function resolveAdmin(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id, perfil')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario || usuario.perfil !== 'admin') return null
  return usuario
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const admin = await resolveAdmin(token)
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const { nome, perfil, funcao, cargo_id, ativo, telefone_whatsapp, email } = body

  // Busca o usuário alvo para verificar guards de segurança
  const { data: alvo } = await supabase
    .from('usuarios')
    .select('id, perfil, ativo, email, auth_user_id')
    .eq('id', params.id)
    .eq('empresa_id', admin.empresa_id)
    .single()

  if (!alvo) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  // Troca de e-mail: precisa atualizar tanto o Auth (login) quanto a tabela
  // usuarios, senão os dois ficam dessincronizados (login continua no antigo).
  const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : undefined
  if (emailNormalizado !== undefined && emailNormalizado !== alvo.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
    }
    if (!alvo.auth_user_id) {
      return NextResponse.json({ error: 'Usuário sem login vinculado — não é possível trocar o e-mail.' }, { status: 400 })
    }
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(alvo.auth_user_id, {
      email: emailNormalizado,
      email_confirm: true,
    })
    if (authUpdateError) {
      const jaEmUso = authUpdateError.message.toLowerCase().includes('already been registered')
        || authUpdateError.message.toLowerCase().includes('already registered')
      return NextResponse.json(
        { error: jaEmUso ? 'Este e-mail já está em uso' : authUpdateError.message },
        { status: jaEmUso ? 409 : 400 }
      )
    }
  }

  // Guard: impede desativar o próprio usuário admin logado
  const { data: adminAtual } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', (await supabase.auth.getUser(token)).data.user?.id ?? '')
    .single()

  if (ativo === false && adminAtual?.id === alvo.id) {
    return NextResponse.json({ error: 'Você não pode desativar sua própria conta.' }, { status: 400 })
  }

  // Guard: impede desativar o último admin ativo da empresa
  if (ativo === false && alvo.perfil === 'admin') {
    const { count } = await supabase
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', admin.empresa_id)
      .eq('perfil', 'admin')
      .eq('ativo', true)
      .neq('id', alvo.id)
    if ((count ?? 0) === 0) {
      return NextResponse.json({ error: 'Não é possível desativar o único administrador ativo.' }, { status: 400 })
    }
  }

  const update: Record<string, unknown> = {}
  if (nome               !== undefined) update.nome               = nome?.trim() || undefined
  if (perfil             !== undefined) update.perfil             = perfil
  if (funcao             !== undefined) update.funcao             = funcao ?? null
  if (cargo_id           !== undefined) update.cargo_id           = cargo_id ?? null
  if (ativo              !== undefined) update.ativo              = ativo
  if (telefone_whatsapp  !== undefined) update.telefone_whatsapp  = telefone_whatsapp?.trim() || null
  if (emailNormalizado   !== undefined && emailNormalizado !== alvo.email) update.email = emailNormalizado

  const { data, error } = await supabase
    .from('usuarios')
    .update(update)
    .eq('id', params.id)
    .eq('empresa_id', admin.empresa_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const admin = await resolveAdmin(token)
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: alvo } = await supabase
    .from('usuarios')
    .select('id, perfil, ativo')
    .eq('id', params.id)
    .eq('empresa_id', admin.empresa_id)
    .is('deleted_at', null)
    .single()

  if (!alvo) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  const { data: adminAtual } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', (await supabase.auth.getUser(token)).data.user?.id ?? '')
    .single()

  if (adminAtual?.id === alvo.id) {
    return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 })
  }

  if (alvo.perfil === 'admin') {
    const { count } = await supabase
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', admin.empresa_id)
      .eq('perfil', 'admin')
      .eq('ativo', true)
      .is('deleted_at', null)
      .neq('id', alvo.id)
    if ((count ?? 0) === 0) {
      return NextResponse.json({ error: 'Não é possível excluir o único administrador ativo.' }, { status: 400 })
    }
  }

  const body = await request.json().catch(() => ({}))
  const motivo = body.motivo?.trim() || null

  const { error } = await supabase
    .from('usuarios')
    .update({ deleted_at: new Date().toISOString(), ativo: false, motivo_exclusao: motivo })
    .eq('id', params.id)
    .eq('empresa_id', admin.empresa_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
