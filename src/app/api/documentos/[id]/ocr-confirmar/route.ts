import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  // Busca o documento e confirma que pertence à empresa e tem OCR pronto
  const { data: doc } = await supabase
    .from('documentos_clientes')
    .select('id, pessoa_id, ocr_dados, ocr_status')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (!doc.pessoa_id) return NextResponse.json({ error: 'Documento sem pessoa vinculada' }, { status: 400 })
  if (doc.ocr_status !== 'concluido') return NextResponse.json({ error: 'OCR não concluído' }, { status: 400 })

  const body = await request.json() as { campos: Record<string, unknown> }
  const { campos } = body

  // Campos permitidos para atualização na pessoa
  const CAMPOS_PERMITIDOS = [
    'nome', 'cpf', 'rg', 'data_nascimento', 'orgao_emissor',
    'filiacao_mae', 'filiacao_pai', 'estado_civil',
    'endereco_rua', 'endereco_numero', 'endereco_bairro',
    'endereco_cidade', 'endereco_uf', 'endereco_cep',
  ]

  const camposFiltrados: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(campos)) {
    if (CAMPOS_PERMITIDOS.includes(k) && v !== null && v !== undefined && v !== '') {
      camposFiltrados[k] = v
    }
  }

  if (Object.keys(camposFiltrados).length > 0) {
    const { error } = await supabase
      .from('pessoas')
      .update(camposFiltrados)
      .eq('id', doc.pessoa_id)

    if (error) {
      console.error('[ocr-confirmar] Erro ao atualizar pessoa:', error)
      return NextResponse.json({ error: 'Erro ao salvar dados' }, { status: 500 })
    }
  }

  // Marca documento como revisado
  await supabase
    .from('documentos_clientes')
    .update({ ocr_status: 'revisado' })
    .eq('id', documentoId)

  return NextResponse.json({ ok: true, camposSalvos: Object.keys(camposFiltrados) })
}

// Ignora o documento (não salva dados mas marca como revisado)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  await supabase
    .from('documentos_clientes')
    .update({ ocr_status: 'ignorado' })
    .eq('id', params.id)
    .eq('empresa_id', empresa_id)

  return NextResponse.json({ ok: true })
}
