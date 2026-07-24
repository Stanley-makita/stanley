import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { entenderNegociacao, type DocumentoOcrResumo } from '@/lib/contratos/entenderNegociacao'

export const maxDuration = 120

async function resolveUsuario(token: string): Promise<{ empresa_id: string } | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ? { empresa_id: usuario.empresa_id } : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const auth = await resolveUsuario(token)
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const processoId = params.id
  const { empresa_id } = auth

  const { data: processo } = await supabase
    .from('processos')
    .select('id, tipo_contrato, valor_contrato')
    .eq('id', processoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!processo) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const descricao: string = typeof body?.descricao === 'string' ? body.descricao : ''

  const { data: vinculos } = await supabase
    .from('documento_vinculos')
    .select('documento_id')
    .eq('entidade_tipo', 'processo')
    .eq('entidade_id', processoId)
    .eq('empresa_id', empresa_id)
  const documentoIds = (vinculos ?? []).map((v) => v.documento_id)

  let documentos: DocumentoOcrResumo[] = []
  if (documentoIds.length > 0) {
    const [{ data: docs }, { data: extracoes }] = await Promise.all([
      supabase
        .from('documentos')
        .select('id, nome_original, classificacao:classificacao_legado')
        .in('id', documentoIds)
        .is('deleted_at', null),
      supabase
        .from('extracoes_ocr')
        .select('documento_id, dados, dados_validados')
        .in('documento_id', documentoIds)
        .eq('vigente', true),
    ])

    const ocrPorDocumento = new Map((extracoes ?? []).map((e) => [e.documento_id, e.dados_validados ?? e.dados ?? null]))
    documentos = (docs ?? []).map((d) => ({
      nome_arquivo: d.nome_original,
      tipo_documento: d.classificacao ?? null,
      dados: ocrPorDocumento.get(d.id) ?? null,
    }))
  }

  try {
    const resumo = await entenderNegociacao({
      tipoContrato: processo.tipo_contrato,
      valorContrato: processo.valor_contrato,
      descricao,
      documentos,
    })
    return NextResponse.json({ resumo })
  } catch (err) {
    console.error('[contratos/entender] erro ao consolidar negociação:', err)
    const mensagem = err instanceof Error ? err.message : 'Não foi possível entender a negociação. Tente novamente.'
    return NextResponse.json({ error: mensagem }, { status: 500 })
  }
}
