import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { enviarPushParaUsuario } from '@/lib/push/enviarPush'
import { resolverRotaNotificacao } from '@/lib/notificacoes/navegarNotificacao'

/**
 * Fase 5 do plano de push/PWA — recebe o Database Webhook do Supabase
 * (Dashboard → Database → Webhooks: tabela `notificacoes`, evento Insert),
 * configurado manualmente no painel (sem migration nenhuma — o Supabase
 * gerencia a entrega por baixo com `pg_net`; se esse recurso não estiver
 * disponível no plano, o próprio painel avisa ao tentar salvar o webhook).
 *
 * Cobre automaticamente os 6 tipos de notificação que já nascem de trigger
 * de banco (lead_atribuido, fase_avancada, processo_emitido, tarefa_atribuida,
 * solicitacao_atribuida, solicitacao_concluida) — e qualquer tipo novo que
 * ganhe um trigger no futuro, sem precisar mexer em código nenhum de novo.
 *
 * `mensagem_whatsapp` (nova mensagem, Fase 3) é ignorado aqui de propósito:
 * o push dela já é enviado direto pelo webhook do WhatsApp via
 * NotificationService.notify() — se este dispatcher também reagisse a ela,
 * o usuário receberia duas notificações pra uma mensagem só.
 *
 * Protegido por um segredo compartilhado (header, não é auth de usuário —
 * quem chama é o próprio Postgres/Supabase, não um navegador).
 */

const TIPOS_JA_TRATADOS_EM_OUTRO_LUGAR = new Set(['mensagem_whatsapp'])

interface NotificacaoWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: {
    id: string
    usuario_id: string
    tipo: string
    titulo: string
    mensagem: string | null
    entidade: string | null
    entidade_id: string | null
  } | null
}

export async function POST(request: NextRequest) {
  const segredo = request.headers.get('x-push-dispatch-secret') ?? ''
  const segredoEsperado = process.env.PUSH_DISPATCH_SECRET ?? ''
  if (!segredoEsperado || segredo !== segredoEsperado) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: NotificacaoWebhookPayload
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const registro = body.record
  if (body.type !== 'INSERT' || !registro) {
    return NextResponse.json({ ok: true, ignorado: 'não é insert' })
  }
  if (TIPOS_JA_TRATADOS_EM_OUTRO_LUGAR.has(registro.tipo)) {
    return NextResponse.json({ ok: true, ignorado: 'tipo já tem push próprio' })
  }

  // Mesma disciplina de privacidade da Fase 3: título fixo "Fonti" na
  // notificação do sistema operacional, corpo é o texto que já existe (o
  // mesmo mostrado no sino — conferido: nomes de lead/tarefa/fase, nunca
  // CPF/renda/valor).
  await enviarPushParaUsuario(supabase, registro.usuario_id, {
    titulo: 'Fonti',
    corpo: registro.mensagem ?? registro.titulo,
    url: resolverRotaNotificacao(registro.entidade, registro.entidade_id) ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
