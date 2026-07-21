import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function resolveEmpresa(token: string): Promise<string | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario?.empresa_id ?? null
}

const STATUS_VALIDOS = ['revisada', 'descartada', 'concluida'] as const
type StatusValido = typeof STATUS_VALIDOS[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { status } = body as { status?: string }

  if (!status || !STATUS_VALIDOS.includes(status as StatusValido)) {
    return NextResponse.json(
      { error: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('apuracoes_renda')
    .update({ status })
    .eq('id', params.id)
    .eq('empresa_id', empresa_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Apuração não encontrada' }, { status: 404 })

  return NextResponse.json({ ok: true, apuracao: data })
}
