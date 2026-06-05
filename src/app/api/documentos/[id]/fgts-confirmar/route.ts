import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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
  const { empresa_id } = usuario

  const { data: doc } = await supabase
    .from('documentos_clientes')
    .select('id, pessoa_id, lead_id, processo_id, ocr_status')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (doc.ocr_status !== 'concluido') return NextResponse.json({ error: 'OCR não concluído' }, { status: 400 })

  // Resolve pessoa_id: 1) direto no doc, 2) via lead, 3) via comprador principal do processo
  let pessoa_id: string | null = doc.pessoa_id ?? null
  if (!pessoa_id && doc.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('pessoa_id')
      .eq('id', doc.lead_id)
      .maybeSingle()
    pessoa_id = lead?.pessoa_id ?? null
  }
  if (!pessoa_id && doc.processo_id) {
    const { data: comprador } = await supabase
      .from('processo_compradores')
      .select('pessoa_id, cpf, nome')
      .eq('processo_id', doc.processo_id)
      .eq('empresa_id', empresa_id)
      .eq('principal', true)
      .maybeSingle()
    if (comprador?.pessoa_id) {
      pessoa_id = comprador.pessoa_id
    } else if (comprador?.cpf) {
      const { data: p } = await supabase
        .from('pessoas')
        .select('id')
        .eq('empresa_id', empresa_id)
        .eq('cpf', comprador.cpf)
        .maybeSingle()
      pessoa_id = p?.id ?? null
    } else if (comprador?.nome) {
      const { data: p } = await supabase
        .from('pessoas')
        .select('id')
        .eq('empresa_id', empresa_id)
        .ilike('nome', comprador.nome)
        .maybeSingle()
      pessoa_id = p?.id ?? null
    }
  }

  if (!pessoa_id) return NextResponse.json({ error: 'Não foi possível encontrar a pessoa vinculada a este documento' }, { status: 400 })

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
    .from('documentos_clientes')
    .update({ ocr_status: 'revisado' })
    .eq('id', documentoId)

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
    .from('documentos_clientes')
    .update({ ocr_status: 'ignorado' })
    .eq('id', params.id)
    .eq('empresa_id', usuario.empresa_id)

  return NextResponse.json({ ok: true })
}
