import { NextRequest, NextResponse } from 'next/server'
import { processarOcrDocumento } from '@/lib/documentos/ocr'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

export const maxDuration = 300

async function resolveUsuario(token: string): Promise<{ empresa_id: string; usuario_id: string } | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return null
  return { empresa_id: usuario.empresa_id, usuario_id: usuario.id }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const resolvido = await resolveUsuario(token)
  if (!resolvido) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { empresa_id, usuario_id } = resolvido

  const documentoId = params.id

  // Modelo definitivo: lê e escreve exclusivamente em `documentos`.
  const { data: doc } = await supabase
    .from('documentos')
    .select('id, ocr_status:status_ocr, classificacao:classificacao_legado')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (['concluido', 'aguardando_apuracao'].includes(doc.ocr_status ?? '')) {
    return NextResponse.json({ error: 'OCR já processado' }, { status: 400 })
  }

  const classificacao = doc.classificacao ?? null

  if (classificacao === 'extrato_bancario') {
    await supabase.from('documentos')
      .update({ status_ocr: 'aguardando_apuracao' })
      .eq('id', documentoId)
    return NextResponse.json({ ok: true, skipped: true, motivo: 'aguardando_apuracao' })
  }

  const { erro } = await processarOcrDocumento(supabase, documentoId, empresa_id, { solicitadoPor: usuario_id })

  const { data: atualizado } = await supabase
    .from('documentos')
    .select('ocr_status:status_ocr, classificacao:classificacao_legado, mime_type')
    .eq('id', documentoId)
    .single()

  return NextResponse.json({
    ok: true,
    ocr_status: atualizado?.ocr_status,
    classificacao: atualizado?.classificacao,
    mime_type: atualizado?.mime_type,
    ...(erro ? { ocr_erro: erro } : {}),
  })
}
