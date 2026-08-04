/**
 * Fluxo pendente de *consorcio — Q&A fixo e determinístico do simulador de
 * consórcio (mesmo padrão de custas-pendente.ts).
 *
 * Armazenamento: colunas consorcio_pendente + consorcio_pendente_expira na
 * tabela conversas, keyed por empresa_id + contato_telefone do operador.
 * TTL: 30 minutos.
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

function buildSufixoQuery(telefone: string) {
  return telefone.replace(/\D/g, '').slice(-11)
}

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
  const sufixo = buildSufixoQuery(telefone)
  const { data } = await supabase
    .from('conversas')
    .select('id, consorcio_pendente, consorcio_pendente_expira')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .ilike('contato_telefone', `%${sufixo}`)
    .order('updated_at', { ascending: false })
    .limit(1)
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
  const sufixo = buildSufixoQuery(telefone)
  await supabase.from('conversas')
    .update({ consorcio_pendente: null, consorcio_pendente_expira: null })
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .ilike('contato_telefone', `%${sufixo}`)
}
