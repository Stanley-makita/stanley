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

/**
 * `pendenteAnterior`: guard de concorrência otimista — mesmo achado/fix de
 * consorcio-pendente.ts: sem isso, duas respostas quase simultâneas ao mesmo passo
 * podiam processar o mesmo estado em paralelo e a escrita mais lenta sobrescrevia o
 * avanço da mais rápida. Passando o estado lido no início do processamento, o UPDATE só
 * aplica se `custas_pendente` na linha ainda for exatamente esse snapshot — retorna
 * `false` (sem escrever) se outra invocação já avançou o passo nesse meio-tempo.
 */
export async function salvarCustasPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
  pendente: CustasPendente,
  pendenteAnterior?: CustasPendente,
): Promise<boolean> {
  const expira = new Date(Date.now() + TTL_MS).toISOString()
  const conversaId = await garantirConversaOperador(supabase, empresa_id, telefone)
  let query = supabase.from('conversas')
    .update({ custas_pendente: pendente, custas_pendente_expira: expira })
    .eq('id', conversaId)
  if (pendenteAnterior) {
    query = query.eq('custas_pendente', pendenteAnterior as unknown as Record<string, unknown>)
  }
  const { data, error } = await query.select('id')
  if (error) {
    console.error('[custas-pendente] salvarCustasPendente falhou:', error)
    return false
  }
  return (data?.length ?? 0) > 0
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
