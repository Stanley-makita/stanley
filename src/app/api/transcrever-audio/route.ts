import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  let body: { mensagem_id: string; file_url: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { mensagem_id, file_url } = body
  if (!mensagem_id || !file_url) {
    return NextResponse.json({ error: 'mensagem_id e file_url são obrigatórios' }, { status: 422 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 503 })
  }

  // Baixa o áudio
  let audioBuffer: ArrayBuffer
  try {
    const audioRes = await fetch(file_url)
    if (!audioRes.ok) throw new Error(`HTTP ${audioRes.status}`)
    audioBuffer = await audioRes.arrayBuffer()
  } catch (err) {
    console.error('[transcrever] erro ao baixar áudio:', err)
    return NextResponse.json({ error: 'Não foi possível baixar o áudio.' }, { status: 502 })
  }

  // Envia para OpenAI Whisper
  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3')
  formData.append('model', 'whisper-1')
  formData.append('language', 'pt')

  let transcricao: string
  try {
    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    })
    if (!whisperRes.ok) {
      const err = await whisperRes.text()
      console.error('[transcrever] whisper error:', whisperRes.status, err)
      return NextResponse.json({ error: 'Erro na transcrição.' }, { status: 502 })
    }
    const json = await whisperRes.json()
    transcricao = json.text ?? ''
  } catch (err) {
    console.error('[transcrever] exceção whisper:', err)
    return NextResponse.json({ error: 'Erro na transcrição.' }, { status: 502 })
  }

  // Salva a transcrição no metadata da mensagem
  const { data: mensagem } = await supabase
    .from('mensagens')
    .select('metadata, conversa_id')
    .eq('id', mensagem_id)
    .single()

  if (mensagem) {
    const { data: conversa } = await supabase
      .from('conversas')
      .select('empresa_id')
      .eq('id', mensagem.conversa_id)
      .single()

    if (conversa?.empresa_id === usuario.empresa_id) {
      await supabase
        .from('mensagens')
        .update({ metadata: { ...(mensagem.metadata ?? {}), transcricao } })
        .eq('id', mensagem_id)
    }
  }

  return NextResponse.json({ transcricao })
}
