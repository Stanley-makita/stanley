// POST /api/processos/[id]/emails/confirmacao-valores/send
// Envia o e-mail de confirmação de valores e registra em email_envios.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { podeExecutar } from '@/lib/auth/permissions'
import { sendEmail } from '@/lib/email/sendEmail'
import { blocoConfirmacao } from '@/lib/email/templates/confirmacaoValores/_helpers'

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolverUsuarioCompleto() {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('id, empresa_id, perfil, nome, email, telefone_whatsapp')
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .eq('ativo', true)
    .single()

  return usuario
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const usuario = await resolverUsuarioCompleto()
    if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!podeExecutar(usuario.perfil, 'processos.editar')) {
      return NextResponse.json({ error: 'Sem permissão para enviar e-mails neste processo' }, { status: 403 })
    }

    const body = await request.json()
    const { para_email, assunto, corpo, template, dados } = body as {
      para_email: string
      assunto: string
      corpo: string
      template: string
      dados?: Record<string, unknown> | null
    }

    if (!para_email || !assunto || !corpo || !template) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes: para_email, assunto, corpo, template' }, { status: 400 })
    }

    // Verifica que o processo pertence à empresa
    const { data: processo } = await supabaseAdmin
      .from('processos')
      .select('id, empresa_id, lead_id, pessoa_id')
      .eq('id', params.id)
      .eq('empresa_id', usuario.empresa_id)
      .maybeSingle()

    if (!processo) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })

    // Gera token único para a página de confirmação
    const token = randomUUID()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const urlConfirmacao = `${appUrl}/confirmar/${token}`

    // Injeta botão de confirmação antes do rodapé do e-mail
    const blocoHtml = blocoConfirmacao(urlConfirmacao)
    const corpoFinal = corpo.replace(
      /(<\/td>(\s*)<\/tr>(\s*)<tr>(\s*)<td[^>]*f9f9f6[^>]*>)/,
      `${blocoHtml}\n$1`
    )

    // Registra como pendente com token e dados_json
    const { data: registro } = await supabaseAdmin
      .from('email_envios')
      .insert({
        empresa_id:  usuario.empresa_id,
        processo_id: params.id,
        lead_id:     (processo as any).lead_id ?? null,
        pessoa_id:   (processo as any).pessoa_id ?? null,
        usuario_id:  usuario.id,
        para_email,
        assunto,
        corpo:       corpoFinal,
        template,
        status:      'pendente',
        token,
        dados_json:  dados ?? null,
      })
      .select('id')
      .single()

    // Envia o e-mail
    const replyTo = usuario.email ?? process.env.EMAIL_FROM
    const resultado = await sendEmail({ to: para_email, subject: assunto, html: corpoFinal, replyTo })

    const agora = new Date().toISOString()

    if (resultado.ok) {
      await supabaseAdmin
        .from('email_envios')
        .update({ status: 'enviado', sent_at: agora })
        .eq('id', registro!.id)

      // Registra na timeline como comentário do tipo 'observacao'
      await supabaseAdmin.from('processo_comentarios').insert({
        processo_id:      params.id,
        empresa_id:       usuario.empresa_id,
        usuario_id:       usuario.id,
        tipo:             'observacao',
        texto:            `E-mail de confirmação de valores enviado para ${para_email} (template: ${template}). Aguardando aceite do cliente.`,
        notificar_cliente: false,
      })

      return NextResponse.json({ ok: true, mensagem: `E-mail enviado para ${para_email} com sucesso.` })
    } else {
      await supabaseAdmin
        .from('email_envios')
        .update({ status: 'erro', erro: resultado.error })
        .eq('id', registro!.id)

      return NextResponse.json(
        { error: resultado.error ?? 'Falha ao enviar e-mail.' },
        { status: 500 }
      )
    }
  } catch (err: any) {
    console.error('[confirmacao-valores/send]', err)
    return NextResponse.json(
      { error: err?.message ?? 'Erro ao enviar e-mail' },
      { status: 500 }
    )
  }
}
