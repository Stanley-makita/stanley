import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function resolveUsuario(token: string): Promise<{ id: string; empresa_id: string } | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ?? null
}

// POST /api/conversas/grupo
// Cria um grupo de WhatsApp via Uazapi (POST /group/create) e já registra a
// conversa correspondente (contato_grupo_id = JID retornado), reaproveitando
// o mesmo modelo que o webhook usa para grupos recebidos organicamente.
export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { nome?: string; participantes?: string[]; instancia_id?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const nome = body.nome?.trim() ?? ''
  const participantesRaw = (body.participantes ?? []).map((p) => p.replace(/\D/g, '')).filter(Boolean)

  if (!nome) return NextResponse.json({ error: 'Nome do grupo é obrigatório' }, { status: 422 })
  if (participantesRaw.length === 0) {
    return NextResponse.json({ error: 'Informe ao menos um participante' }, { status: 422 })
  }

  // Normaliza para formato internacional (mesmo padrão usado em useIniciarConversa)
  const participantes = participantesRaw.map((p) => (p.length <= 11 && !p.startsWith('55') ? `55${p}` : p))

  // Resolve token da instância (a informada, ou a primeira ativa da empresa, ou env)
  let instanciaToken = process.env.UAZAPI_INSTANCE_TOKEN ?? ''
  let instanciaId: string | null = body.instancia_id ?? null
  if (instanciaId) {
    const { data: instancia } = await supabase
      .from('instancias')
      .select('id, token')
      .eq('id', instanciaId)
      .eq('empresa_id', usuario.empresa_id)
      .eq('ativo', true)
      .maybeSingle()
    if (instancia?.token) instanciaToken = instancia.token
  } else {
    const { data: instancia } = await supabase
      .from('instancias')
      .select('id, token')
      .eq('empresa_id', usuario.empresa_id)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle()
    if (instancia?.token) {
      instanciaToken = instancia.token
      instanciaId = instancia.id
    }
  }

  // A doc da Uazapi anuncia resposta plana ({JID, Name, ...}), mas a resposta
  // real vem aninhada em { group: {...}, failed: [...] } — confirmado testando
  // o endpoint direto.
  let resultado: { group?: { JID?: string; Name?: string }; failed?: unknown[] | null }
  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/group/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanciaToken },
      body: JSON.stringify({ name: nome, participants: participantes }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('[conversas/grupo] Uazapi retornou erro:', res.status, detail)
      return NextResponse.json({ error: 'Falha ao criar grupo na Uazapi', detail }, { status: 502 })
    }
    resultado = await res.json()
  } catch (err) {
    console.error('[conversas/grupo] Falha ao chamar Uazapi:', err)
    return NextResponse.json({ error: 'Falha de conexão com Uazapi' }, { status: 502 })
  }

  const grupoId = resultado.group?.JID
  if (!grupoId) {
    console.error('[conversas/grupo] Uazapi não retornou o JID do grupo criado. Resposta:', JSON.stringify(resultado))
    return NextResponse.json({ error: 'Uazapi não retornou o JID do grupo criado' }, { status: 502 })
  }

  const { data: conversa, error: erroConversa } = await supabase
    .from('conversas')
    .insert({
      empresa_id: usuario.empresa_id,
      canal: 'whatsapp',
      contato_nome: resultado.group?.Name ?? nome,
      contato_grupo_id: grupoId,
      status: 'ativo',
      bot_ativo: false,
      instancia_id: instanciaId,
    })
    .select('id')
    .single()

  if (erroConversa || !conversa) {
    console.error('[conversas/grupo] Grupo criado na Uazapi mas falhou ao salvar conversa:', erroConversa)
    return NextResponse.json({ error: 'Grupo criado, mas falhou ao registrar a conversa no Fonti' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, conversa_id: conversa.id, jid: grupoId })
}
