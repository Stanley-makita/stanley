/**
 * Fluxo pendente de *custas — Q&A fixo e determinístico do simulador de custas.
 *
 * Armazenamento: colunas custas_pendente + custas_pendente_expira na tabela
 * conversas, keyed por empresa_id + contato_telefone do operador (mesmo padrão
 * de simula-pendente.ts). TTL: 30 minutos.
 *
 * Leitura e escrita resolvem o id da conversa pelo mesmo caminho canônico
 * (garantirConversaOperador) — ver comentário equivalente em
 * consorcio-pendente.ts pro bug real que isso corrige (linha errada lida
 * quando existem duas linhas de `conversas` pro mesmo telefone).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntradaSimulador } from '@/types/simulador'
import { garantirConversaOperador } from '@/lib/conversas/garantirConversaOperador'

export type PassoCustas =
  | 'tipo_imovel'
  | 'cidade'
  | 'valor_cv'
  | 'valor_financiado'
  | 'servico_registro'
  | 'valor_certidoes'
  | 'contrato_particular'
  | 'primeira_aquisicao'
  | 'isento_funrejus'
  | 'banco'
  | 'modalidade'
  | 'valor_terreno'         // só entra na sequência se modalidade = terreno_construcao
  | 'produto'               // último passo — gatilho do cálculo

export interface CustasPendente {
  passo: PassoCustas
  dados: Partial<EntradaSimulador>
}

const TTL_MS = 30 * 60 * 1000  // 30 minutos

export async function salvarCustasPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
  pendente: CustasPendente,
): Promise<void> {
  const expira = new Date(Date.now() + TTL_MS).toISOString()
  const conversaId = await garantirConversaOperador(supabase, empresa_id, telefone)
  await supabase.from('conversas')
    .update({ custas_pendente: pendente, custas_pendente_expira: expira })
    .eq('id', conversaId)
}

export async function buscarCustasPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<CustasPendente | null> {
  const conversaId = await garantirConversaOperador(supabase, empresa_id, telefone)
  const { data } = await supabase
    .from('conversas')
    .select('id, custas_pendente, custas_pendente_expira')
    .eq('id', conversaId)
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
  const conversaId = await garantirConversaOperador(supabase, empresa_id, telefone)
  await supabase.from('conversas')
    .update({ custas_pendente: null, custas_pendente_expira: null })
    .eq('id', conversaId)
}
