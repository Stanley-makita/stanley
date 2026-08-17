import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { COMPROMISSO_LOCAL_LABELS, type CompromissoLocal } from '@/types/agenda'

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('auth_user_id', user.id)
    .single()
  return usuario
}

async function buscarInstanciaToken(empresaId: string): Promise<string> {
  const { data } = await supabase
    .from('instancias')
    .select('token')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
  return data?.token ?? process.env.UAZAPI_INSTANCE_TOKEN ?? ''
}

async function enviarWhatsApp(telefone: string, texto: string, instanciaToken: string) {
  const telRaw = telefone.replace(/\D/g, '')
  const telEnvio = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  const res = await fetch(`${process.env.UAZAPI_API_URL}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: instanciaToken },
    body: JSON.stringify({ number: telEnvio, text: texto, delay: 800 }),
  })
  if (!res.ok) throw new Error(`Uazapi ${res.status}: ${await res.text()}`)
  return res.json()
}

function fmtData(data: string) {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function montarMensagem(opts: {
  titulo: string
  data: string
  horaInicio: string | null
  horaFim: string | null
  local: CompromissoLocal
  descricao: string | null
  criadorNome: string
  paraRecepcao: boolean
  donoNome: string
}) {
  const horario = opts.horaInicio
    ? `${opts.horaInicio.slice(0, 5)}${opts.horaFim ? ` às ${opts.horaFim.slice(0, 5)}` : ''}`
    : null
  const linhas = [
    opts.paraRecepcao ? `📅 *Fonti — Compromisso na Sede*` : `📅 *Fonti — Novo Compromisso*`,
    ``,
    opts.paraRecepcao ? `*${opts.donoNome}* tem um compromisso na sede:` : `*${opts.titulo}*`,
    opts.paraRecepcao ? `*${opts.titulo}*` : null,
    `Data: ${fmtData(opts.data)}${horario ? ` às ${horario}` : ''}`,
    `Local: ${COMPROMISSO_LOCAL_LABELS[opts.local]}`,
    opts.descricao ? `\n${opts.descricao}` : null,
    ``,
    `Agendado por: ${opts.criadorNome}`,
  ].filter((l): l is string => l !== null)
  return linhas.join('\n')
}

// POST /api/agenda/compromissos
// Body: { usuario_id, titulo, descricao?, local, data, hora_inicio?, hora_fim? }
//
// Cria o compromisso e dispara WhatsApp pro dono; se local='sede_fontinhas',
// também notifica o usuário marcado como recepção (empresas.recepcao_usuario_id,
// configurável em Configurações). Falha no envio de WhatsApp não desfaz a
// criação — o compromisso já fica salvo e visível na Agenda de qualquer forma.
export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as {
    usuario_id?: string
    titulo?: string
    descricao?: string | null
    local?: CompromissoLocal
    data?: string
    hora_inicio?: string | null
    hora_fim?: string | null
  }

  if (!body.usuario_id || !body.titulo?.trim() || !body.local || !body.data) {
    return NextResponse.json({ error: 'Campos obrigatórios: usuario_id, titulo, local, data' }, { status: 422 })
  }

  const { data: compromisso, error: insertError } = await supabase
    .from('compromissos')
    .insert({
      empresa_id:  usuario.empresa_id,
      usuario_id:  body.usuario_id,
      criado_por:  usuario.id,
      titulo:      body.titulo.trim(),
      descricao:   body.descricao?.trim() || null,
      local:       body.local,
      data:        body.data,
      hora_inicio: body.hora_inicio || null,
      hora_fim:    body.hora_fim || null,
    })
    .select('id')
    .single()

  if (insertError || !compromisso) {
    return NextResponse.json({ error: insertError?.message ?? 'Erro ao criar compromisso' }, { status: 500 })
  }

  // A partir daqui, tudo é notificação — best-effort, não bloqueia a resposta
  // de sucesso da criação em si.
  try {
    const { data: dono } = await supabase
      .from('usuarios')
      .select('nome, telefone, telefone_whatsapp')
      .eq('id', body.usuario_id)
      .single()

    if (dono) {
      const instanciaToken = await buscarInstanciaToken(usuario.empresa_id)
      const telDono = dono.telefone_whatsapp ?? dono.telefone

      if (telDono) {
        const msg = montarMensagem({
          titulo: body.titulo.trim(),
          data: body.data,
          horaInicio: body.hora_inicio ?? null,
          horaFim: body.hora_fim ?? null,
          local: body.local,
          descricao: body.descricao?.trim() || null,
          criadorNome: usuario.nome,
          paraRecepcao: false,
          donoNome: dono.nome,
        })
        await enviarWhatsApp(telDono, msg, instanciaToken).catch((e) =>
          console.error('[agenda/compromissos] Erro ao notificar dono:', e))
      }

      await supabase.from('notificacoes').insert({
        empresa_id:  usuario.empresa_id,
        usuario_id:  body.usuario_id,
        tipo:        'compromisso_criado',
        titulo:      'Novo compromisso',
        mensagem:    `${body.titulo.trim()} — ${fmtData(body.data)}${body.hora_inicio ? ` às ${body.hora_inicio.slice(0, 5)}` : ''}`,
        entidade:    'compromisso',
        entidade_id: compromisso.id,
      })

      // Recepção — só quando o local é a sede, e só se for alguém diferente
      // do próprio dono (evita mandar a msg duplicada pra mesma pessoa).
      if (body.local === 'sede_fontinhas') {
        const { data: empresa } = await supabase
          .from('empresas')
          .select('recepcao_usuario_id')
          .eq('id', usuario.empresa_id)
          .single()

        if (empresa?.recepcao_usuario_id && empresa.recepcao_usuario_id !== body.usuario_id) {
          const { data: recepcao } = await supabase
            .from('usuarios')
            .select('nome, telefone, telefone_whatsapp')
            .eq('id', empresa.recepcao_usuario_id)
            .single()

          if (recepcao) {
            const telRecepcao = recepcao.telefone_whatsapp ?? recepcao.telefone
            if (telRecepcao) {
              const msgRecepcao = montarMensagem({
                titulo: body.titulo.trim(),
                data: body.data,
                horaInicio: body.hora_inicio ?? null,
                horaFim: body.hora_fim ?? null,
                local: body.local,
                descricao: body.descricao?.trim() || null,
                criadorNome: usuario.nome,
                paraRecepcao: true,
                donoNome: dono.nome,
              })
              await enviarWhatsApp(telRecepcao, msgRecepcao, instanciaToken).catch((e) =>
                console.error('[agenda/compromissos] Erro ao notificar recepção:', e))
            }

            await supabase.from('notificacoes').insert({
              empresa_id:  usuario.empresa_id,
              usuario_id:  empresa.recepcao_usuario_id,
              tipo:        'compromisso_recepcao',
              titulo:      'Compromisso na sede',
              mensagem:    `${dono.nome} — ${body.titulo.trim()} — ${fmtData(body.data)}${body.hora_inicio ? ` às ${body.hora_inicio.slice(0, 5)}` : ''}`,
              entidade:    'compromisso',
              entidade_id: compromisso.id,
            })
          }
        }
      }
    }

    await supabase.from('compromissos').update({ notificado_em: new Date().toISOString() }).eq('id', compromisso.id)
  } catch (err) {
    console.error('[agenda/compromissos] Erro ao notificar:', err)
  }

  return NextResponse.json({ ok: true, id: compromisso.id })
}
