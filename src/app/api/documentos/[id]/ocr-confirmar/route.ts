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
    'nome', 'cpf', 'rg', 'data_nascimento', 'data_emissao', 'orgao_emissor',
    'filiacao_mae', 'filiacao_pai', 'cidade_nascimento', 'estado_civil',
    'regime_casamento', 'data_casamento',
    'endereco_rua', 'endereco_numero', 'endereco_bairro',
    'endereco_cidade', 'endereco_uf', 'endereco_cep',
    'registro_cnh', 'validade_cnh', 'primeira_habilitacao_cnh',
  ]

  const ESTADO_CIVIL_VALIDOS = ['solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo']
  const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/
  const DATA_FIELDS = ['data_nascimento', 'data_casamento', 'data_emissao', 'validade_cnh', 'primeira_habilitacao_cnh']

  const camposFiltrados: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(campos)) {
    if (!CAMPOS_PERMITIDOS.includes(k)) continue
    if (v === null || v === undefined || v === '') continue
    const s = String(v).trim()
    // Validações por campo para evitar rejeição no banco
    if (k === 'cpf' && s.replace(/\D/g, '').length !== 11) continue
    if (DATA_FIELDS.includes(k) && !DATA_REGEX.test(s)) continue
    if (k === 'estado_civil' && !ESTADO_CIVIL_VALIDOS.includes(s)) continue
    camposFiltrados[k] = s
  }

  if (Object.keys(camposFiltrados).length > 0) {
    const { error } = await supabase
      .from('pessoas')
      .update(camposFiltrados)
      .eq('id', doc.pessoa_id)

    if (error) {
      console.error('[ocr-confirmar] Erro ao atualizar pessoa:', error.message, '| campos:', Object.keys(camposFiltrados))
      return NextResponse.json({ error: 'Erro ao salvar dados', detail: error.message }, { status: 500 })
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
