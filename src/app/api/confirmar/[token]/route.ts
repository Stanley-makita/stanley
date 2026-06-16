// POST /api/confirmar/[token]
// Registra o aceite do cliente na página pública de confirmação de valores.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { data: envio } = await supabaseAdmin
      .from('email_envios')
      .select('id, confirmado_em, processo_id, empresa_id, usuario_id, para_email, template')
      .eq('token', params.token)
      .maybeSingle()

    if (!envio) {
      return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 })
    }
    if (envio.confirmado_em) {
      return NextResponse.json(
        { error: 'Este aceite já foi registrado.', jaConfirmado: true },
        { status: 409 }
      )
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? request.headers.get('x-real-ip')
      ?? null
    const userAgent = request.headers.get('user-agent') ?? null
    const agora = new Date()
    const protocolo = `CONF-${agora.getFullYear()}-${params.token.replace(/-/g, '').substring(0, 8).toUpperCase()}`

    await supabaseAdmin
      .from('email_envios')
      .update({
        confirmado_em:          agora.toISOString(),
        confirmado_valores:     true,
        confirmado_variacoes:   true,
        confirmado_prazos:      true,
        confirmacao_ip:         ip,
        confirmacao_user_agent: userAgent,
        numero_protocolo:       protocolo,
      })
      .eq('id', envio.id)

    // Registra na timeline do processo
    if (envio.processo_id) {
      await supabaseAdmin.from('processo_comentarios').insert({
        processo_id:       envio.processo_id,
        empresa_id:        envio.empresa_id,
        usuario_id:        envio.usuario_id,
        tipo:              'observacao',
        texto:             `Cliente (${envio.para_email}) confirmou ciência e aceite dos valores — Protocolo: ${protocolo}.`,
        notificar_cliente: false,
      })
    }

    return NextResponse.json({ ok: true, protocolo, confirmadoEm: agora.toISOString() })
  } catch (err: any) {
    console.error('[confirmar/token POST]', err)
    return NextResponse.json({ error: err?.message ?? 'Erro ao registrar confirmação.' }, { status: 500 })
  }
}
