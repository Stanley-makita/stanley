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
  | 'valor_bem'
  | 'valor_carta'
  | 'mes_contemplacao'
  | 'prazo_meses'
  | 'taxa_adm'
  | 'indice_correcao'
  | 'parcela_reduzida'
  | 'fundo_reserva'         // último passo — gatilho do cálculo

export interface ConsorcioPendente {
  passo: PassoConsorcio
  dados: Partial<InputConsorcio>
}

const TTL_MS = 30 * 60 * 1000  // 30 minutos

export async function salvarConsorcioPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
  pendente: ConsorcioPendente,
): Promise<void> {
  const expira = new Date(Date.now() + TTL_MS).toISOString()
  const conversaId = await garantirConversaOperador(supabase, empresa_id, telefone)
  await supabase.from('conversas')
    .update({ consorcio_pendente: pendente, consorcio_pendente_expira: expira })
    .eq('id', conversaId)
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
