import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/**
 * Camada de entrega de Web Push — server-only. Chamada de dentro de
 * `NotificationService.notify()` (nunca diretamente pelo produtor do
 * evento, ex. o webhook do WhatsApp, que só conhece `notify()`).
 *
 * NUNCA lança exceção: falha de VAPID mal configurado, subscription
 * inválida, rede fora ou qualquer erro do provedor de push é só logado —
 * quem chamou (via `notify()`, dentro de um `waitUntil` do webhook) não
 * pode quebrar por causa disso. A mensagem do WhatsApp já foi gravada em
 * `mensagens` antes desta função sequer ser chamada.
 */

let vapidConfigurado = false

function garantirVapidConfigurado(): boolean {
  if (vapidConfigurado) return true
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    console.error('[push] VAPID não configurado (NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes) — push desativado')
    return false
  }
  try {
    webpush.setVapidDetails('mailto:suporte@fonti.app.br', publicKey, privateKey)
    vapidConfigurado = true
    return true
  } catch (err) {
    console.error('[push] falha ao configurar VAPID:', err)
    return false
  }
}

export interface PayloadPush {
  titulo: string
  corpo: string
  /** Rota relativa pra abrir ao tocar na notificação, ex. '/conversas?id=...'. */
  url?: string
}

interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Manda push pra todas as inscrições ATIVAS do usuário (pode ter várias —
 * celular, notebook, etc.). Cada envio é isolado: uma subscription inválida
 * (404/410, revogada pelo navegador) é desativada sem afetar as demais, e um
 * erro de rede numa não impede a tentativa nas outras.
 */
export async function enviarPushParaUsuario(
  supabase: SupabaseClient,
  usuarioId: string,
  payload: PayloadPush,
): Promise<void> {
  try {
    if (!garantirVapidConfigurado()) return

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('usuario_id', usuarioId)
      .eq('ativo', true)

    if (error) {
      console.error('[push] erro ao buscar inscrições:', error)
      return
    }
    if (!subscriptions?.length) return

    const corpoJson = JSON.stringify(payload)

    await Promise.all(
      (subscriptions as PushSubscriptionRow[]).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            corpoJson,
          )
          await supabase.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id)
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode
          if (status === 404 || status === 410) {
            // Subscription não existe mais no navegador (usuário desinstalou, trocou de
            // dispositivo, revogou permissão) — desativa, não apaga (mantém histórico).
            await supabase.from('push_subscriptions').update({ ativo: false }).eq('id', sub.id)
          } else {
            console.error('[push] erro ao enviar pra uma inscrição:', err)
          }
        }
      }),
    )
  } catch (err) {
    console.error('[push] falha inesperada ao enviar push:', err)
  }
}
