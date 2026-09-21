/**
 * Fluxo pendente de *consorcio — Q&A fixo e determinístico do simulador de
 * consórcio (mesmo padrão de custas-pendente.ts).
 *
 * Armazenamento: colunas consorcio_pendente + consorcio_pendente_expira na
 * tabela conversas, keyed por empresa_id + contato_telefone do operador.
 * TTL: 30 minutos.
 *
 * Leitura e escrita SEMPRE resolvem o id da conversa pelo mesmo caminho
 * canônico (garantirConversaOperador → RPC obter_ou_criar_conversa, que
 * normaliza o telefone e é a fonte da verdade). Antes, a leitura fazia uma
 * busca solta por sufixo de telefone (ILIKE + ORDER BY updated_at) — se
 * existisse mais de uma linha de `conversas` pro mesmo número (ex.: uma
 * canônica "5544..." e uma crua "44..." criada por outro caminho que não
 * canonicaliza), a leitura podia pegar a linha errada e o fluxo "travava"
 * silenciosamente na resposta seguinte, sem erro nenhum. Achado real em
 * produção durante teste com múltiplos comerciais simultâneos (2026-09-15).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InputConsorcio } from '@/lib/simuladorConsorcio/tipos'
import { garantirConversaOperador } from '@/lib/conversas/garantirConversaOperador'

export type PassoConsorcio =
  | 'tipo_bem'              // primeiro passo — Imóvel ou Auto
  | 'valor_bem'
  | 'valor_carta'
  | 'mes_contemplacao'
  | 'prazo_meses'
  | 'taxa_adm'
  | 'indice_correcao'
  | 'indexador_fixo'        // logo após índice de correção — fixo ou variável
  | 'parcela_reduzida'
  | 'fundo_reserva'         // último passo — gatilho do cálculo

export interface ConsorcioPendente {
  passo: PassoConsorcio
  dados: Partial<InputConsorcio>
}

const TTL_MS = 30 * 60 * 1000  // 30 minutos

/**
 * `pendenteAnterior`: guard de concorrência otimista — achado real de auditoria: sem
 * isso, duas respostas do operador quase simultâneas ao mesmo passo (mensagens
 * encaminhadas rapidamente) podiam processar o MESMO estado em paralelo, e a escrita
 * mais lenta sobrescrevia o avanço da mais rápida, perdendo um passo do fluxo sem erro
 * nenhum. Passando o estado lido no início do processamento, o UPDATE só aplica se
 * `consorcio_pendente` na linha ainda for exatamente esse snapshot — retorna `false`
 * (sem escrever nada) se outra invocação já avançou o passo nesse meio-tempo.
 */
export async function salvarConsorcioPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
  pendente: ConsorcioPendente,
  pendenteAnterior?: ConsorcioPendente,
): Promise<boolean> {
  const expira = new Date(Date.now() + TTL_MS).toISOString()
  const conversaId = await garantirConversaOperador(supabase, empresa_id, telefone)
  let query = supabase.from('conversas')
    .update({ consorcio_pendente: pendente, consorcio_pendente_expira: expira })
    .eq('id', conversaId)
  if (pendenteAnterior) {
    // JSON.stringify, NÃO o objeto: o supabase-js serializa objeto como "[object Object]" e o
    // Postgres rejeita (22P02) — o UPDATE nunca aplicava e o fluxo travava no 1º passo.
    // Comparação jsonb ignora a ordem das chaves.
    query = query.eq('consorcio_pendente', JSON.stringify(pendenteAnterior))
  }
  const { data, error } = await query.select('id')
  if (error) {
    console.error('[consorcio-pendente] salvarConsorcioPendente falhou:', error)
    return false
  }
  return (data?.length ?? 0) > 0
}

export async function buscarConsorcioPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<ConsorcioPendente | null> {
  const conversaId = await garantirConversaOperador(supabase, empresa_id, telefone)
  const { data } = await supabase
    .from('conversas')
    .select('id, consorcio_pendente, consorcio_pendente_expira')
    .eq('id', conversaId)
    .maybeSingle()

  if (!data?.consorcio_pendente) return null

  if (data.consorcio_pendente_expira && new Date(data.consorcio_pendente_expira) < new Date()) {
    await supabase.from('conversas')
      .update({ consorcio_pendente: null, consorcio_pendente_expira: null })
      .eq('id', data.id)
    return null
  }

  return data.consorcio_pendente as ConsorcioPendente
}

export async function limparConsorcioPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<void> {
  const conversaId = await garantirConversaOperador(supabase, empresa_id, telefone)
  await supabase.from('conversas')
    .update({ consorcio_pendente: null, consorcio_pendente_expira: null })
    .eq('id', conversaId)
}
