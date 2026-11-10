import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarPushParaUsuario } from '@/lib/push/enviarPush'
import { resolverRotaNotificacao } from '@/lib/notificacoes/navegarNotificacao'

/**
 * Push das notificações de uma solicitação (resposta, mensagem, nova atribuída).
 *
 * As notificações nascem no banco (RPCs responder_solicitacao / enviar_mensagem_solicitacao e o trigger de
 * atribuição), e o push automático de notificação criada no banco (Fase 5, Database Webhook) está pausado —
 * por isso o sininho mostrava a resposta, mas nunca chegava push (caso real 09/11/2026: a Fabricia não soube
 * que o Bruno tinha respondido). A tela chama /api/solicitacoes/[id]/push logo depois de gravar; aqui manda o
 * push das notificações recentes da solicitação que ainda não tiveram push. Cada uma é "reservada" antes
 * (dados_json.push_enviado, UPDATE condicional) — duas chamadas seguidas nunca mandam o mesmo push duas vezes.
 */
export const JANELA_PUSH_MS = 5 * 60 * 1000

type Notificacao = {
  id: string
  usuario_id: string
  titulo: string
  mensagem: string | null
  entidade: string | null
  entidade_id: string | null
  dados_json: Record<string, unknown> | null
}

export async function enviarPushNotificacoesSolicitacao(
  sb: SupabaseClient, solicitacaoId: string, agora = Date.now(),
): Promise<number> {
  const desde = new Date(agora - JANELA_PUSH_MS).toISOString()
  const { data, error } = await sb.from('notificacoes')
    .select('id, usuario_id, titulo, mensagem, entidade, entidade_id, dados_json')
    .eq('entidade', 'solicitacao').eq('entidade_id', solicitacaoId)
    .gte('criado_em', desde)
    .is('dados_json->>push_enviado', null)
  if (error) throw new Error(`notificações: ${error.message}`)

  let enviados = 0
  for (const n of (data ?? []) as Notificacao[]) {
    const { data: reservada, error: eRes } = await sb.from('notificacoes')
      .update({ dados_json: { ...(n.dados_json ?? {}), push_enviado: new Date(agora).toISOString() } })
      .eq('id', n.id).is('dados_json->>push_enviado', null)
      .select('id')
    if (eRes) { console.error('[solicitacoes/push] reservar:', eRes.message); continue }
    if (!reservada?.length) continue  // outra chamada já mandou

    await enviarPushParaUsuario(sb, n.usuario_id, {
      titulo: 'Fonti',
      corpo: n.mensagem ? `${n.titulo}: ${n.mensagem}` : n.titulo,
      url: resolverRotaNotificacao(n.entidade, n.entidade_id) ?? undefined,
    })
    enviados++
  }
  return enviados
}
