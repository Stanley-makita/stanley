import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

async function resolverEmpresaId(): Promise<string | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabaseAdmin
    .from('usuarios')
    .select('empresa_id')
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .eq('ativo', true)
    .single()

  return data?.empresa_id ?? null
}

// GET — prévia do próximo número (NÃO incrementa)
export async function GET() {
  const empresaId = await resolverEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin.rpc('previa_numero_contrato_assessoria', {
    p_empresa_id: empresaId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ numero: data as string })
}

// POST — gera e reserva o número definitivo (incrementa)
export async function POST() {
  const empresaId = await resolverEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin.rpc('gerar_numero_contrato_assessoria', {
    p_empresa_id: empresaId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ numero: data as string })
}
