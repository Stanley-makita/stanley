import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { planejarContrato } from '@/lib/contratos/planejarContrato'

export const maxDuration = 120

async function resolveEmpresaId(token: string): Promise<string | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario?.empresa_id ?? null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; contratoId: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const empresaId = await resolveEmpresaId(token)
  if (!empresaId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: contrato } = await supabase
    .from('processo_contratos')
    .select('id, tipo_modelo, resumo_negociacao_json')
    .eq('id', params.contratoId)
    .eq('processo_id', params.id)
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (!contrato) return NextResponse.json({ error: 'Rascunho de contrato não encontrado' }, { status: 404 })
  if (!contrato.resumo_negociacao_json) {
    return NextResponse.json({ error: 'Confirme o entendimento da negociação antes de planejar o contrato.' }, { status: 400 })
  }

  try {
    const plano = await planejarContrato({
      tipoContrato: contrato.tipo_modelo,
      resumo: contrato.resumo_negociacao_json,
    })
    return NextResponse.json({ plano })
  } catch (err) {
    console.error('[contratos/plano] erro ao planejar contrato:', err)
    return NextResponse.json({ error: 'Não foi possível planejar o contrato. Tente novamente.' }, { status: 500 })
  }
}
