import type { SupabaseClient } from '@supabase/supabase-js'

// Reivindicação atômica de um evento do webhook do WhatsApp (Uazapi) antes de qualquer
// efeito colateral (Pessoa, Conversa, Mensagem, comandos *fonti, etc.) — ver
// docs/protocolo-seguranca-recuperacao.md e docs/sprint-protecao-imediata-etapa-a.md.
//
// A idempotência é dada pela constraint UNIQUE (messageid, instancia_id, tipo_evento) em
// `fonti_events` (migration 20260715_163) — o INSERT abaixo é a operação atômica; se
// violar a constraint, o evento já foi (ou está sendo) processado por outra requisição.
// Não usar SELECT seguido de INSERT: isso teria uma janela de corrida entre duas
// requisições simultâneas (exatamente o cenário de duas instâncias do incidente).

export type StatusEventoFonti = 'processando' | 'processado' | 'falhou' | 'ignorado'

interface ReivindicarEventoParams {
  supabase: SupabaseClient
  messageid: string
  instanciaId: string
  tipoEvento: string
  empresaId: string
}

interface ReivindicarEventoResultado {
  /** true = esta requisição deve processar o evento; false = duplicado, encerrar sem side effect. */
  reivindicado: boolean
  eventoId?: string
}

export async function reivindicarEvento(
  params: ReivindicarEventoParams
): Promise<ReivindicarEventoResultado> {
  const { supabase, messageid, instanciaId, tipoEvento, empresaId } = params

  const { data, error } = await supabase
    .from('fonti_events')
    .insert({
      messageid,
      instancia_id: instanciaId,
      tipo_evento: tipoEvento,
      empresa_id: empresaId,
      status: 'processando',
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = violação de constraint UNIQUE — evento já reivindicado por outra requisição.
    if (error.code === '23505') {
      return { reivindicado: false }
    }
    throw error
  }

  return { reivindicado: true, eventoId: data.id as string }
}

// Best-effort: não lança erro se o UPDATE falhar (ex.: problema transitório de rede) —
// o evento já foi processado ou falhou de fato, e isso não deve derrubar a resposta ao
// webhook. Não há retry automático aqui nem em `reivindicarEvento`.
export async function marcarEventoConcluido(
  supabase: SupabaseClient,
  eventoId: string,
  sucesso: boolean
): Promise<void> {
  const { error } = await supabase
    .from('fonti_events')
    .update({ status: sucesso ? 'processado' : 'falhou' })
    .eq('id', eventoId)

  if (error) {
    console.error('[idempotencia-webhook] falha ao atualizar status (best-effort, ignorado):', error.message)
  }
}
