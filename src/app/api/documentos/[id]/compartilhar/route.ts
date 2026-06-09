import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ?? null
}

function normalizarTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return `55${digits}`
}

function mimeParaTipoUazapi(mimeType: string | null): 'document' | 'image' {
  if (mimeType?.startsWith('image/')) return 'image'
  return 'document'
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const documentoId = params.id

  let body: { telefone: string; mensagem?: string; nome_destino?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { telefone, mensagem, nome_destino } = body
  if (!telefone) return NextResponse.json({ error: 'telefone é obrigatório' }, { status: 422 })

  // Busca documento
  const { data: doc } = await supabase
    .from('documentos_clientes')
    .select('id, nome_original, mime_type, storage_path, storage_bucket, lead_id, processo_id, empresa_id')
    .eq('id', documentoId)
    .eq('empresa_id', usuario.empresa_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })

  // Baixa arquivo do Storage
  const bucket = doc.storage_bucket ?? 'documentos-clientes'
  const { data: blob, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(doc.storage_path)

  if (downloadError || !blob) {
    console.error('[compartilhar] Erro ao baixar arquivo:', downloadError?.message)
    return NextResponse.json({ error: 'Não foi possível acessar o arquivo.' }, { status: 500 })
  }

  const arrayBuffer = await blob.arrayBuffer()

  // Limite ~25 MB em base64
  if (arrayBuffer.byteLength > 25_000_000) {
    return NextResponse.json({ error: 'Arquivo muito grande para enviar pelo WhatsApp (máx 25 MB).' }, { status: 413 })
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const tipoUazapi = mimeParaTipoUazapi(doc.mime_type)
  const telefoneFormatado = normalizarTelefone(telefone)
  const dígitosDestino = telefoneFormatado.replace('55', '')

  // Busca conversa existente pelo telefone
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, instancia_id')
    .eq('empresa_id', usuario.empresa_id)
    .or(`contato_telefone.ilike.%${dígitosDestino}%,contato_telefone.eq.${telefoneFormatado}`)
    .eq('arquivada', false)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Resolve instância — conversa existente → instancia dela; senão → primeira ativa da empresa
  let instanceToken = process.env.UAZAPI_INSTANCE_TOKEN ?? ''

  if (conversa?.instancia_id) {
    const { data: instancia } = await supabase
      .from('instancias')
      .select('token')
      .eq('id', conversa.instancia_id)
      .eq('ativo', true)
      .maybeSingle()
    if (instancia?.token) instanceToken = instancia.token
  } else {
    const { data: instancia } = await supabase
      .from('instancias')
      .select('token')
      .eq('empresa_id', usuario.empresa_id)
      .eq('ativo', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (instancia?.token) instanceToken = instancia.token
  }

  // Envia via Uazapi
  const uazapiBody: Record<string, unknown> = {
    number: telefoneFormatado,
    type: tipoUazapi,
    file: base64,
    docName: doc.nome_original,
    track_source: 'crm-humano',
  }
  if (mensagem?.trim()) uazapiBody.text = mensagem.trim()

  let uazapiResult: Record<string, unknown> = {}
  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/send/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify(uazapiBody),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error('[compartilhar] Uazapi error:', res.status, txt)
      return NextResponse.json({ error: 'Falha ao enviar via WhatsApp. Tente novamente.' }, { status: 502 })
    }
    uazapiResult = await res.json()
  } catch (err) {
    console.error('[compartilhar] Uazapi exception:', err)
    return NextResponse.json({ error: 'Falha ao enviar via WhatsApp. Tente novamente.' }, { status: 502 })
  }

  const conversaId = conversa?.id ?? null

  // Se há conversa, salva mensagem no histórico dela
  if (conversaId) {
    await supabase.from('mensagens').insert({
      conversa_id:  conversaId,
      origem:       'humano',
      conteudo:     mensagem?.trim() ?? '',
      metadata: {
        tipo_midia:        tipoUazapi,
        uazapi_message_id: uazapiResult?.messageid ?? null,
        nome_arquivo:      doc.nome_original,
        atendente:         usuario.nome,
      },
    })
    await supabase
      .from('conversas')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversaId)
  }

  // Registra compartilhamento
  await supabase.from('documentos_compartilhamentos').insert({
    empresa_id:       usuario.empresa_id,
    documento_id:     documentoId,
    telefone_destino: telefoneFormatado,
    conversa_id:      conversaId,
    usuario_id:       usuario.id,
    mensagem:         mensagem?.trim() ?? null,
  })

  const destino = nome_destino?.trim() ? nome_destino.trim() : telefone
  const textoHistorico = `Documento "${doc.nome_original}" enviado para ${destino}${mensagem?.trim() ? ` com mensagem: "${mensagem.trim()}"` : ''}.`

  // Histórico do lead (insert direto — RPC usa auth.uid() incompatível com service_role)
  if (doc.lead_id) {
    await supabase.from('lead_historico').insert({
      lead_id:    doc.lead_id,
      empresa_id: usuario.empresa_id,
      usuario_id: usuario.id,
      tipo:       'comentario',
      descricao:  textoHistorico,
    })
  }

  // Timeline do processo
  if (doc.processo_id) {
    await supabase.from('processo_comentarios').insert({
      empresa_id:        usuario.empresa_id,
      processo_id:       doc.processo_id,
      usuario_id:        usuario.id,
      tipo:              'alteracao',
      texto:             textoHistorico,
      notificar_cliente: false,
    })
  }

  return NextResponse.json({ ok: true, conversa_id: conversaId })
}
