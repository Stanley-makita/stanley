import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import {
  NOTIFICACAO_META,
  type TipoNotificacao,
  type EntidadeNotificacao,
  type Severidade,
  type Prioridade,
} from '@/types/notificacoes'

/**
 * Porta de entrada única para qualquer notificação que deva virar
 * histórico/badge/realtime (a "Central"). Toasts efêmeros de feedback de
 * formulário (toast.success() após salvar algo, etc.) NÃO passam por aqui —
 * continuam chamando `sonner` diretamente, sem mudança.
 *
 * Ver docs/central-notificacoes.md para o fluxo completo e exemplos.
 */
export interface NotifyInput {
  /** Usuário destinatário — quem vai ver a notificação. */
  usuarioId: string
  tipo: TipoNotificacao
  titulo: string
  mensagem?: string
  entidade?: EntidadeNotificacao
  entidadeId?: string
  /** Se omitido, usa `NOTIFICACAO_META[tipo].severidadePadrao`. */
  severidade?: Severidade
  /** Se omitido, usa `NOTIFICACAO_META[tipo].prioridadePadrao`. */
  prioridade?: Prioridade
  /** Payload livre para uso futuro (push/e-mail/WhatsApp/IA). */
  dadosJson?: Record<string, unknown>
  /** De onde veio a notificação (ex.: 'formulario-site', 'webhook-ocr'). */
  origem?: string
}

export interface NotifyResult {
  id: string | null
  error: Error | null
}

/**
 * Cria uma notificação via RPC `criar_notificacao` (SECURITY DEFINER — INSERT
 * direto na tabela continua bloqueado para `authenticated`). O Supabase
 * Realtime cuida de entregar a notificação ao destinatário (toast + badge +
 * drawer) sem nenhum passo extra aqui — por isso não há toast otimista local
 * neste serviço, nem quando o autor é o próprio destinatário (ver
 * docs/central-notificacoes.md, seção "por que não há toast otimista").
 *
 * Nunca lança exceção: se a RPC falhar (rede, permissão, validação), loga o
 * erro e retorna `{ id: null, error }` — quem chamou (criação de lead,
 * webhook, cron futuro) não pode quebrar por causa de notificação.
 *
 * @param client Cliente Supabase opcional. Por padrão usa o client de
 *   browser (`@/lib/supabase/client`), para chamadas vindas de componentes/
 *   hooks. Em Route Handlers/webhooks/Server Actions, passe um client de
 *   `@/lib/supabase/server` (`await createClient()`).
 */
export async function notify(
  input: NotifyInput,
  client?: SupabaseClient,
): Promise<NotifyResult> {
  const supabase = client ?? createBrowserClient()
  const meta = NOTIFICACAO_META[input.tipo]
  const severidade = input.severidade ?? meta.severidadePadrao
  const prioridade = input.prioridade ?? meta.prioridadePadrao

  const { data, error } = await supabase.rpc('criar_notificacao', {
    p_usuario_id: input.usuarioId,
    p_tipo: input.tipo,
    p_titulo: input.titulo,
    p_mensagem: input.mensagem ?? null,
    p_entidade: input.entidade ?? null,
    p_entidade_id: input.entidadeId ?? null,
    p_severidade: severidade,
    p_prioridade: prioridade,
    p_dados_json: input.dadosJson ?? null,
    p_origem: input.origem ?? null,
  })

  if (error) {
    console.error('[NotificationService.notify] falha ao criar notificação', { input, error })
    return { id: null, error }
  }

  return { id: data as string, error: null }
}

export const NotificationService = { notify }
