import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { enviarPushParaUsuario } from '@/lib/push/enviarPush'
import { resolverRotaNotificacao } from '@/lib/notificacoes/navegarNotificacao'
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
  /**
   * true quando quem chama é um webhook/cron/rota de servidor rodando com a
   * chave de serviço (sem sessão de usuário nenhuma) — ex. o webhook do
   * WhatsApp. A RPC `criar_notificacao` foi desenhada só pra chamada de
   * usuário autenticado no navegador: ela exige `auth.uid()` pertencendo à
   * mesma empresa do destinatário, e `auth.uid()` é sempre NULL numa chamada
   * de service role, então a RPC sempre rejeitava com "Sem permissão para
   * notificar este usuário" (achado real, 2026-09-22 — o push de nova
   * mensagem nunca disparava por causa disso, mesmo com tudo mais certo).
   * Com `viaServiceRole: true`, insere direto na tabela — mesmo padrão já
   * usado por outras rotas de servidor (ex. agenda/compromissos/route.ts,
   * telefonia/chamada-recebida/route.ts), que sempre contornaram essa RPC
   * pelo mesmo motivo.
   */
  viaServiceRole?: boolean
}

export interface NotifyResult {
  id: string | null
  error: Error | null
}

/**
 * Cria uma notificação. Usuário autenticado no navegador (padrão, sem
 * `viaServiceRole`): via RPC `criar_notificacao` (SECURITY DEFINER — INSERT
 * direto na tabela continua bloqueado para `authenticated`). Webhook/cron/
 * rota rodando com service role (`viaServiceRole: true`): INSERT direto,
 * porque a RPC exige `auth.uid()` de um usuário da mesma empresa, que nunca
 * existe numa chamada de service role — ver o comentário de `viaServiceRole`
 * em `NotifyInput`. O Supabase Realtime cuida de entregar a notificação ao
 * destinatário (toast + badge + drawer) sem nenhum passo extra aqui — por
 * isso não há toast otimista local neste serviço, nem quando o autor é o
 * próprio destinatário (ver docs/central-notificacoes.md, seção "por que não
 * há toast otimista").
 *
 * Nunca lança exceção: se a criação falhar (rede, permissão, validação), loga
 * o erro e retorna `{ id: null, error }` — quem chamou (criação de lead,
 * webhook, cron futuro) não pode quebrar por causa de notificação.
 *
 * @param client Cliente Supabase opcional. Por padrão usa o client de
 *   browser (`@/lib/supabase/client`), para chamadas vindas de componentes/
 *   hooks. Em Route Handlers/webhooks/Server Actions, passe o client de
 *   service role da rota e `input.viaServiceRole: true`.
 */
export async function notify(
  input: NotifyInput,
  client?: SupabaseClient,
): Promise<NotifyResult> {
  const supabase = client ?? createBrowserClient()
  const meta = NOTIFICACAO_META[input.tipo]
  const severidade = input.severidade ?? meta.severidadePadrao
  const prioridade = input.prioridade ?? meta.prioridadePadrao

  let data: string | null = null
  let error: Error | null = null

  if (input.viaServiceRole) {
    const { data: usuario, error: erroUsuario } = await supabase
      .from('usuarios')
      .select('empresa_id')
      .eq('id', input.usuarioId)
      .eq('ativo', true)
      .maybeSingle()

    if (erroUsuario || !usuario) {
      error = new Error('Usuário destinatário inválido ou inativo')
    } else {
      const { data: linha, error: erroInsert } = await supabase
        .from('notificacoes')
        .insert({
          empresa_id: usuario.empresa_id,
          usuario_id: input.usuarioId,
          tipo: input.tipo,
          titulo: input.titulo,
          mensagem: input.mensagem ?? null,
          entidade: input.entidade ?? null,
          entidade_id: input.entidadeId ?? null,
          severidade,
          prioridade,
          dados_json: input.dadosJson ?? null,
          origem: input.origem ?? null,
        })
        .select('id')
        .single()
      data = linha?.id ?? null
      error = erroInsert
    }
  } else {
    const { data: rpcData, error: rpcError } = await supabase.rpc('criar_notificacao', {
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
    data = rpcData as string | null
    error = rpcError
  }

  if (error) {
    console.error('[NotificationService.notify] falha ao criar notificação', { input, error })
    return { id: null, error }
  }

  // Push é efeito colateral da notificação já persistida (fonte de verdade é a
  // linha em `notificacoes`, inserida acima) — quem chamou `notify()` não
  // precisa saber nada de Web Push. Isolado em try/catch próprio: uma falha
  // aqui (VAPID mal configurado, subscription inválida, rede fora) nunca faz
  // `notify()` rejeitar — a notificação já está gravada e visível no sino
  // independente do push ter saído ou não.
  try {
    // Título fixo "Fonti" no push (não `input.titulo`) de propósito: `titulo` é o
    // texto em negrito mostrado no SINO (ex. "Nova mensagem de João Silva"), faz
    // sentido lá; no push, quem aparece em negrito é o nome do app na notificação
    // do sistema operacional — usar o mesmo texto do sino ali seria redundante e,
    // pra outros tipos futuros, arriscaria vazar informação sensível no título
    // sem ninguém ter pensado nisso caso a caso. `mensagem` (o corpo) já é
    // decidido pelo chamador com a privacidade em mente (ver webhook do WhatsApp).
    await enviarPushParaUsuario(supabase, input.usuarioId, {
      titulo: 'Fonti',
      corpo: input.mensagem ?? input.titulo,
      url: resolverRotaNotificacao(input.entidade ?? null, input.entidadeId ?? null) ?? undefined,
    })
  } catch (err) {
    console.error('[NotificationService.notify] falha ao enviar push (notificação já foi criada normalmente)', err)
  }

  return { id: data as string, error: null }
}

export const NotificationService = { notify }
