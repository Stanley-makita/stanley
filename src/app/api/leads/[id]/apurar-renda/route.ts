import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analisarExtratosRenda, registrarExtracoesApuracaoRenda } from '@/lib/documentos/apurar-renda'

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

  // Fase E (corte de leitura): lê do modelo unificado `documentos`. Quando não há seleção
  // manual, descobre os IDs via `documento_vinculos` (vínculo direto do lead).
  let idsFiltro: string[] | null = null
  if (!documentoIds?.length) {
    const { data: vinculos } = await supabase
      .from('documento_vinculos')
      .select('documento_id')
      .eq('entidade_tipo', 'lead')
      .eq('entidade_id', leadId)
      .eq('empresa_id', empresa_id)
    idsFiltro = (vinculos ?? []).map(v => v.documento_id)
  }

  let query = supabase
    .from('documentos')
    .select('id, nome_original, storage_path, storage_bucket, mime_type')
    .eq('empresa_id', empresa_id)
    .is('deleted_at', null)

  if (documentoIds?.length) {
    query = query.in('id', documentoIds)
  } else {
    query = query.in('id', idsFiltro ?? []).eq('classificacao_legado', 'extrato_bancario')
  }

  const { data: documentos } = await query

  if (!documentos?.length) {
    return NextResponse.json({ error: 'Nenhum extrato bancário encontrado para este lead' }, { status: 400 })
  }

  const inicio = Date.now()
  const documentosOcrIds = documentos.map(d => d.id)

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
        documentos_ids:        documentosOcrIds,
        confianca:             resultado.confianca,
        status:                'concluida',
        resultado_json:        resultado,
      })
      .select()
      .single()

    if (insertError) throw new Error(insertError.message)

    await registrarExtracoesApuracaoRenda(supabase, {
      empresaId: empresa_id,
      documentoIds: documentosOcrIds,
      status: 'concluido',
      dados: resultado,
      confianca: resultado.confianca,
      solicitadoPor: usuario_id,
      tempoProcessamentoMs: Date.now() - inicio,
    })

    return NextResponse.json({ ok: true, apuracao })
  } catch (err) {
    console.error('[apurar-renda lead] Erro na análise:', err)
    await registrarExtracoesApuracaoRenda(supabase, {
      empresaId: empresa_id,
      documentoIds: documentosOcrIds,
      status: 'erro',
      erroMensagem: err instanceof Error ? err.message : String(err),
      solicitadoPor: usuario_id,
      tempoProcessamentoMs: Date.now() - inicio,
    }).catch(() => {})
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao processar extratos' },
      { status: 500 },
    )
  }
}
