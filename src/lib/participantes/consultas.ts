import type { SupabaseClient } from '@supabase/supabase-js'
import type { PapelParticipacao, PropostaRef } from './tipos'

type Opcoes = { timeoutMs?: number }
const coluna = (ref: PropostaRef) => (ref.tipo === 'lead' ? 'lead_id' : 'processo_id')

/** pessoa_id dos participantes da proposta com um dos papéis. Lança se a consulta falhar. */
export async function pessoasDaProposta(
  sb: SupabaseClient, ref: PropostaRef, papeis: readonly PapelParticipacao[], opts: Opcoes = {},
): Promise<string[]> {
  let q = sb.from('participacoes').select('pessoa_id').eq(coluna(ref), ref.id).in('papel', [...papeis])
  if (opts.timeoutMs) q = q.abortSignal(AbortSignal.timeout(opts.timeoutMs))
  const { data, error } = await q
  if (error) throw new Error(`participacoes: ${error.message}`)
  return Array.from(new Set(((data ?? []) as Array<{ pessoa_id: string }>).map(r => r.pessoa_id)))
}

export interface TitularProposta { pessoa_id: string; nome: string; cpf: string | null }

/**
 * Pessoa ativa do titular da proposta. null quando não há titular — casos reais: titular
 * excluído (soft delete) ou Pessoa de operador (nunca vira participante). Lança se a consulta falhar.
 */
export async function titularDaProposta(sb: SupabaseClient, ref: PropostaRef, opts: Opcoes = {}): Promise<TitularProposta | null> {
  let q = sb.from('participacoes').select('pessoa_id').eq(coluna(ref), ref.id).eq('papel', 'titular')
  if (opts.timeoutMs) q = q.abortSignal(AbortSignal.timeout(opts.timeoutMs))
  const { data: part, error } = await q.maybeSingle()
  if (error) throw new Error(`participacoes: ${error.message}`)
  if (!part) return null

  let qp = sb.from('pessoas').select('id, nome, cpf').eq('id', (part as { pessoa_id: string }).pessoa_id).is('deleted_at', null)
  if (opts.timeoutMs) qp = qp.abortSignal(AbortSignal.timeout(opts.timeoutMs))
  const { data: pessoa, error: eP } = await qp.maybeSingle()
  if (eP) throw new Error(`pessoas: ${eP.message}`)
  if (!pessoa) return null
  const pe = pessoa as { id: string; nome: string | null; cpf: string | null }
  return { pessoa_id: pe.id, nome: pe.nome ?? '', cpf: pe.cpf ?? null }
}

/** processo_id onde a Pessoa participa com um dos papéis (nunca devolve lead). Lança se a consulta falhar. */
export async function processosDaPessoa(
  sb: SupabaseClient, empresaId: string, pessoaId: string, papeis: readonly PapelParticipacao[], opts: Opcoes = {},
): Promise<string[]> {
  let q = sb.from('participacoes').select('processo_id')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId).in('papel', [...papeis]).not('processo_id', 'is', null)
  if (opts.timeoutMs) q = q.abortSignal(AbortSignal.timeout(opts.timeoutMs))
  const { data, error } = await q
  if (error) throw new Error(`participacoes: ${error.message}`)
  return Array.from(new Set(((data ?? []) as Array<{ processo_id: string }>).map(r => r.processo_id)))
}
