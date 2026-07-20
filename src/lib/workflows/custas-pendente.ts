/**
 * Fluxo pendente de *custas — Q&A fixo e determinístico do simulador de custas.
 *
 * Armazenamento: colunas custas_pendente + custas_pendente_expira na tabela
 * conversas, keyed por empresa_id + contato_telefone do operador (mesmo padrão
 * de simula-pendente.ts). TTL: 30 minutos.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntradaSimulador } from '@/types/simulador'

export type PassoCustas =
  | 'tipo_imovel'
  | 'cidade'
  | 'valor_cv'
  | 'valor_financiado'
  | 'modalidade'
  | 'valor_terreno'         // só entra na sequência se modalidade = terreno_construcao
  | 'servico_registro'
  | 'valor_certidoes'
  | 'contrato_particular'
  | 'primeira_aquisicao'
  | 'isento_funrejus'
  | 'produto'
  | 'banco'                 // último passo — gatilho do cálculo

export interface CustasPendente {
  passo: PassoCustas
  dados: Partial<EntradaSimulador>
}

const TTL_MS = 30 * 60 * 1000  // 30 minutos

function buildSufixoQuery(telefone: string) {
  return telefone.replace(/\D/g, '').slice(-11)
}

export async function salvarCustasPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
  pendente: CustasPendente,
): Promise<void> {
  const sufixo = buildSufixoQuery(telefone)
  const expira = new Date(Date.now() + TTL_MS).toISOString()
  await supabase.from('conversas')
    .update({ custas_pendente: pendente, custas_pendente_expira: expira })
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .ilike('contato_telefone', `%${sufixo}`)
}

export async function buscarCustasPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<CustasPendente | null> {
  const sufixo = buildSufixoQuery(telefone)
  const { data } = await supabase
    .from('conversas')
    .select('id, custas_pendente, custas_pendente_expira')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .ilike('contato_telefone', `%${sufixo}`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.custas_pendente) return null

  if (data.custas_pendente_expira && new Date(data.custas_pendente_expira) < new Date()) {
    await supabase.from('conversas')
      .update({ custas_pendente: null, custas_pendente_expira: null })
      .eq('id', data.id)
    return null
  }

  return data.custas_pendente as CustasPendente
}

export async function limparCustasPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<void> {
  const sufixo = buildSufixoQuery(telefone)
  await supabase.from('conversas')
    .update({ custas_pendente: null, custas_pendente_expira: null })
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .ilike('contato_telefone', `%${sufixo}`)
}
