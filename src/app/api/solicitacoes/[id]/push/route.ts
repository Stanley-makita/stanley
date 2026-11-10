import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota } from '@/lib/documentos/vinculosServidor'
import { enviarPushNotificacoesSolicitacao } from '@/lib/solicitacoes/pushNotificacoes'

/**
 * Push das notificações recém-criadas de uma solicitação (resposta, mensagem ou nova solicitação atribuída).
 * A tela chama logo depois de gravar; responde na hora e envia em segundo plano. Ver pushNotificacoes.ts.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx

  const { data: sol, error } = await supabase
    .from('solicitacoes_operacionais').select('id, empresa_id').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sol || sol.empresa_id !== ctx.usuario.empresa_id) {
    return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 })
  }

  waitUntil(
    enviarPushNotificacoesSolicitacao(supabase, params.id)
      .catch(err => console.error(`[solicitacoes/push] solicitação ${params.id}:`, err)),
  )
  return NextResponse.json({ agendado: true }, { status: 202 })
}
