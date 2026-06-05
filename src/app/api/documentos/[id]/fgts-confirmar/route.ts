import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolveUsuario(token: string): Promise<{ empresa_id: string; pessoa_id?: string } | null> {
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
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const documentoId = params.id
  const { empresa_id } = usuario

  const { data: doc } = await supabase
    .from('documentos_clientes')
    .select('id, pessoa_id, ocr_dados, ocr_status')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (!doc.pessoa_id) return NextResponse.json({ error: 'Documento sem pessoa vinculada' }, { status: 400 })
  if (doc.ocr_status !== 'concluido') return NextResponse.json({ error: 'OCR não concluído' }, { status: 400 })

  const body = await request.json() as {
    cod_empregador?: string
    nro_conta_fgts?: string
    pis_pasep?: string
    saldo_disponivel?: string
    data_extrato?: string
  }

  const saldo = body.saldo_disponivel ? parseFloat(body.saldo_disponivel.replace(',', '.')) : null

  const { error: insertError } = await supabase
    .from('pessoa_fgts_contas')
    .insert({
      empresa_id,
      pessoa_id: doc.pessoa_id,
      cod_empregador:   body.cod_empregador   || null,
      nro_conta_fgts:   body.nro_conta_fgts   || null,
      pis_pasep:        body.pis_pasep         || null,
      saldo_disponivel: isNaN(saldo!) ? null : saldo,
      data_extrato:     body.data_extrato      || null,
      documento_id:     documentoId,
    })

  if (insertError) {
    console.error('[fgts-confirmar] Erro ao inserir conta FGTS:', insertError)
    return NextResponse.json({ error: 'Erro ao salvar dados FGTS' }, { status: 500 })
  }

  await supabase
    .from('documentos_clientes')
    .update({ ocr_status: 'revisado' })
    .eq('id', documentoId)

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  await supabase
    .from('documentos_clientes')
    .update({ ocr_status: 'ignorado' })
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)

  return NextResponse.json({ ok: true })
}
