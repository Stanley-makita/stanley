import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

interface ContaFgts {
  cod_empregador?: string
  nro_conta_fgts?: string
  saldo_disponivel?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const documentoId = params.id
  const { empresa_id, usuario_id } = usuario

  // Modelo definitivo: documentos.pessoa_id é sempre preenchido (constraint do acervo
  // documental) — não precisa mais resolver via lead/processo/CPF/nome como antes.
  const { data: doc } = await supabase
    .from('documentos')
    .select('id, pessoa_id, ocr_status:status_ocr')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (doc.ocr_status !== 'concluido') return NextResponse.json({ error: 'OCR não concluído' }, { status: 400 })

  const pessoa_id = doc.pessoa_id

  const body = await request.json() as {
    nome?: string
    pis_pasep?: string
    data_extrato?: string
    contas?: ContaFgts[]
  }

  const contas = body.contas ?? []
  const pis_pasep = body.pis_pasep || null
  const data_extrato = body.data_extrato || null

  // Insere cada conta como uma linha em pessoa_fgts_contas
  let salvas = 0
  for (const conta of contas) {
    const saldo = conta.saldo_disponivel
      ? parseFloat(conta.saldo_disponivel.replace(',', '.'))
      : null

    const { error: insertError } = await supabase
      .from('pessoa_fgts_contas')
      .insert({
        empresa_id,
        pessoa_id,
        cod_empregador:   conta.cod_empregador   || null,
        nro_conta_fgts:   conta.nro_conta_fgts   || null,
        pis_pasep,
        saldo_disponivel: saldo != null && !isNaN(saldo) ? saldo : null,
        data_extrato,
        documento_id:     documentoId,
      })

    if (insertError) {
      console.error('[fgts-confirmar] Erro ao inserir conta FGTS:', insertError)
    } else {
      salvas++
    }
  }

  // Se não havia contas mas havia dados avulsos (formato antigo), insere uma linha
  if (contas.length === 0) {
    await supabase.from('pessoa_fgts_contas').insert({
      empresa_id,
      pessoa_id,
      pis_pasep,
      data_extrato,
      documento_id: documentoId,
    })
    salvas = 1
  }

  await supabase
    .from('documentos')
    .update({ status_ocr: 'revisado' })
    .eq('id', documentoId)

  // Fase C (validação): operador confirmou as contas FGTS — promove a
  // extração vigente a "Validado".
  await supabase
    .from('extracoes_ocr')
    .update({
      validado_em: new Date().toISOString(),
      validado_por: usuario_id,
      dados_validados: { nome: body.nome ?? null, pis_pasep, data_extrato, contas },
    })
    .eq('documento_id', documentoId)
    .eq('vigente', true)

  return NextResponse.json({ ok: true, salvas })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  await supabase
    .from('documentos')
    .update({ status_ocr: 'ignorado' })
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)

  return NextResponse.json({ ok: true })
}
