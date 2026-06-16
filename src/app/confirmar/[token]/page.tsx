import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import ConfirmacaoForm from './ConfirmacaoForm'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export default async function ConfirmarPage({ params }: { params: { token: string } }) {
  const { data: envio } = await supabaseAdmin
    .from('email_envios')
    .select('id, template, dados_json, confirmado_em, numero_protocolo')
    .eq('token', params.token)
    .maybeSingle()

  if (!envio) return notFound()

  return (
    <ConfirmacaoForm
      token={params.token}
      template={envio.template ?? ''}
      dadosJson={envio.dados_json ?? null}
      jaConfirmado={!!envio.confirmado_em}
      confirmadoEm={envio.confirmado_em ?? null}
      protocolo={envio.numero_protocolo ?? null}
    />
  )
}
