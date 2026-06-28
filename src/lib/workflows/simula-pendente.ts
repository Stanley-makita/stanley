/**
 * Workflow pendente de *simula — permite retomar uma simulação incompleta
 * quando o operador responde a uma pergunta do Fonti sem repetir *simula.
 *
 * Armazenamento: colunas simula_pendente + simula_pendente_expira na tabela
 * conversas, keyed por empresa_id + contato_telefone do operador.
 * TTL: 30 minutos.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DadosCaptacaoNormalizados } from './normalizador-captacao'

export interface WorkflowPendente {
  /** Motivo da pendência — só influencia qual pergunta fazer; nunca limita o parser. */
  motivo: 'esclarecer_tipo_construcao' | 'completar_dados_simulacao' | 'confirmacao'
  /** Dados já capturados na mensagem original (snapshot de DadosCaptacaoNormalizados). */
  dadosCapturados: Partial<DadosCaptacaoNormalizados>
  /** true = chamar executarWorkflowConsulta; false = executarWorkflowCaptacao */
  usouConsulta: boolean
  leadIdExistente?: string
  pessoaIdExistente?: string
}

const TTL_MS = 30 * 60 * 1000  // 30 minutos

// ── Helpers internos ──────────────────────────────────────────────────────────

function buildSufixoQuery(telefone: string) {
  return telefone.replace(/\D/g, '').slice(-11)
}

// ── API pública ───────────────────────────────────────────────────────────────

export async function salvarSimulaPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
  pendente: WorkflowPendente,
): Promise<void> {
  const sufixo = buildSufixoQuery(telefone)
  const expira = new Date(Date.now() + TTL_MS).toISOString()
  // Usa .ilike para tolerar variações de DDI (554499... vs 4499...) — mesmo padrão do webhook
  await supabase.from('conversas')
    .update({ simula_pendente: pendente, simula_pendente_expira: expira })
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .ilike('contato_telefone', `%${sufixo}`)
}

export async function buscarSimulaPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<WorkflowPendente | null> {
  const sufixo = buildSufixoQuery(telefone)
  const { data } = await supabase
    .from('conversas')
    .select('id, simula_pendente, simula_pendente_expira')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .ilike('contato_telefone', `%${sufixo}`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.simula_pendente) return null

  if (data.simula_pendente_expira && new Date(data.simula_pendente_expira) < new Date()) {
    await supabase.from('conversas')
      .update({ simula_pendente: null, simula_pendente_expira: null })
      .eq('id', data.id)
    return null
  }

  return data.simula_pendente as WorkflowPendente
}

export async function limparSimulaPendente(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<void> {
  const sufixo = buildSufixoQuery(telefone)
  await supabase.from('conversas')
    .update({ simula_pendente: null, simula_pendente_expira: null })
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .ilike('contato_telefone', `%${sufixo}`)
}

/**
 * Mescla dados do parser novo com dados capturados anteriormente.
 *
 * REGRA: campos não-null do novo parser têm precedência — o usuário pode
 * corrigir/complementar qualquer campo na nova mensagem.
 * Exceção: tipo_operacao='aquisicao' é apenas o default do classificador e não
 * sobrescreve um tipo mais específico já resolvido (construcao, comercial, etc.).
 */
export function mergeCapturados(
  anterior: Partial<DadosCaptacaoNormalizados>,
  novo: DadosCaptacaoNormalizados,
): Partial<DadosCaptacaoNormalizados> {
  const result: Partial<DadosCaptacaoNormalizados> = { ...anterior }

  // Campos escalares onde o novo parser vence quando não-null
  const camposEscalares: (keyof DadosCaptacaoNormalizados)[] = [
    'nome', 'cpf', 'telefone', 'data_nascimento', 'cidade_imovel',
    'tipo_imovel', 'valor_imovel', 'valor_entrada', 'valor_financiado',
    'renda_formal', 'renda_informal', 'prazo_meses',
    'tipo_amortizacao', 'correntista', 'usa_fgts', 'fgts_valor',
    'todos_bancos', 'finalidade_efetiva', 'valor_terreno', 'valor_obra',
    'solicitar_simulacao', 'modo_calculo', 'prazo_maximo',
    'produto', 'produto_normalizado',
  ]

  for (const campo of camposEscalares) {
    const val = novo[campo]
    if (val !== null && val !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(result as any)[campo] = val
    }
  }

  // bancos_ids: substituir apenas se o novo parser encontrou bancos explícitos
  if (novo.bancos_ids && novo.bancos_ids.length > 0) {
    result.bancos_ids = novo.bancos_ids
  }

  // tipo_operacao: 'aquisicao' é o default — não sobrescreve um valor já resolvido
  if (novo.tipo_operacao && novo.tipo_operacao !== 'aquisicao') {
    result.tipo_operacao = novo.tipo_operacao
  } else if (!result.tipo_operacao) {
    result.tipo_operacao = novo.tipo_operacao ?? 'aquisicao'
  }

  return result
}
