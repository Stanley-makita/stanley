import { NextRequest, NextResponse } from 'next/server'
import { enviarMensagemHumano, type TipoMidiaEnvio } from '@/lib/comunicacao/enviarMensagemHumano'
import { supabaseAdmin as supabaseService } from '@/lib/supabase/admin'

type TipoMidia = TipoMidiaEnvio

export async function POST(request: NextRequest) {
  // Autentica via Bearer token (enviado pelo cliente)
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) {
    console.error('[send] Auth error:', authError?.message)
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: usuario } = await supabaseService
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  let body: {
    conversa_id: string
    telefone: string
    tipo: TipoMidia
    texto?: string
    arquivo?: string
    nome_arquivo?: string
  }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { conversa_id, telefone, tipo, texto, arquivo, nome_arquivo } = body

  if (!conversa_id || !telefone || !tipo) {
    return NextResponse.json({ error: 'conversa_id, telefone e tipo são obrigatórios' }, { status: 422 })
  }
  if (tipo === 'text' && !texto?.trim()) {
    return NextResponse.json({ error: 'texto é obrigatório para tipo text' }, { status: 422 })
  }
  if (tipo !== 'text' && !arquivo) {
    return NextResponse.json({ error: 'arquivo é obrigatório para mídias' }, { status: 422 })
  }
  // Limite de tamanho no backend (~25MB em base64)
  if (arquivo && arquivo.length > 35_000_000) {
    return NextResponse.json({ error: 'Arquivo muito grande. Reduza o tamanho antes de enviar.' }, { status: 413 })
  }

  // Verifica que a conversa pertence à empresa do atendente
  const { data: conversa } = await supabaseService
    .from('conversas')
    .select('id')
    .eq('id', conversa_id)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  const resultado = await enviarMensagemHumano({
    supabase: supabaseService,
    conversaId: conversa_id,
    telefone,
    tipo,
    texto,
    arquivo,
    nomeArquivo: nome_arquivo,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }

  // mensagem_id (linha inserida em `mensagens`) permite ao chamador vincular este envio a
  // outras entidades (ex.: Central de Comunicação do Negócio) sem precisar de um segundo
  // round-trip para descobrir o id gerado.
  return NextResponse.json({ ok: true, message_id: resultado.messageId, mensagem_id: resultado.mensagemId })
}
