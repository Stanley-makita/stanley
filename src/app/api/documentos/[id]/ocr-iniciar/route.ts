import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processarOcrDocumento } from '@/lib/documentos/ocr'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const documentoId = params.id

  const { data: doc } = await supabase
    .from('documentos_clientes')
    .select('id, ocr_status')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (doc.ocr_status && doc.ocr_status !== 'pendente' && doc.ocr_status !== 'erro') {
    return NextResponse.json({ error: 'OCR já processado' }, { status: 400 })
  }

  await processarOcrDocumento(supabase, documentoId, empresa_id)

  const { data: atualizado } = await supabase
    .from('documentos_clientes')
    .select('ocr_status, ocr_dados, classificacao')
    .eq('id', documentoId)
    .single()

  return NextResponse.json({ ok: true, ocr_status: atualizado?.ocr_status, classificacao: atualizado?.classificacao })
}
