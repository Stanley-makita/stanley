import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analisarExtratosRenda } from '@/lib/documentos/apurar-renda'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolveUsuario(token: string): Promise<{ empresa_id: string; usuario_id: string } | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ? { empresa_id: usuario.empresa_id, usuario_id: usuario.id } : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const auth = await resolveUsuario(token)
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const leadId = params.id
  const { empresa_id, usuario_id } = auth

  // Verifica se o lead pertence à empresa
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  // Aceita lista explícita de IDs (seleção manual) ou fallback por classificação
  const body = await request.json().catch(() => ({}))
  const documentoIds: string[] | undefined = Array.isArray(body?.documento_ids) ? body.documento_ids : undefined
  const faturamentoDeclarado: number | undefined = typeof body?.faturamento_declarado === 'number' ? body.faturamento_declarado : undefined

  let query = supabase
    .from('documentos_clientes')
    .select('id, nome_original, storage_path, storage_bucket, mime_type')
    .eq('lead_id', leadId)
    .eq('empresa_id', empresa_id)
    .is('deleted_at', null)

  if (documentoIds?.length) {
    query = query.in('id', documentoIds)
  } else {
    query = query.eq('classificacao', 'extrato_bancario')
  }

  const { data: documentos } = await query

  if (!documentos?.length) {
    return NextResponse.json({ error: 'Nenhum extrato bancário encontrado para este lead' }, { status: 400 })
  }

  try {
    const resultado = await analisarExtratosRenda(supabase, documentos, { faturamentoDeclarado })

    const { data: apuracao, error: insertError } = await supabase
      .from('apuracoes_renda')
      .insert({
        empresa_id,
        lead_id: leadId,
        usuario_id,
        renda_apurada:         resultado.renda_apurada,
        media_mensal_entradas: resultado.media_mensal_entradas,
        media_mensal_saidas:   resultado.media_mensal_saidas,
        media_liquida:         resultado.media_liquida,
        periodo_inicio:        resultado.periodo_inicio,
        periodo_fim:           resultado.periodo_fim,
        documentos_ids:        documentos.map(d => d.id),
        confianca:             resultado.confianca,
        status:                'concluida',
        resultado_json:        resultado,
      })
      .select()
      .single()

    if (insertError) throw new Error(insertError.message)

    return NextResponse.json({ ok: true, apuracao })
  } catch (err) {
    console.error('[apurar-renda lead] Erro na análise:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao processar extratos' },
      { status: 500 },
    )
  }
}
