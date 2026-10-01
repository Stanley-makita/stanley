import type { SupabaseClient } from '@supabase/supabase-js'
import { planoCasamento } from './casamento'

const REGIMES = ['comunhao_parcial', 'comunhao_total', 'separacao_total', 'participacao_final']

/** Regime no domínio do cadastro. O OCR devolve comunhao_universal para o que o cadastro chama de comunhao_total. */
export function normalizarRegime(r: string | null | undefined): string | null {
  if (!r) return null
  const v = r === 'comunhao_universal' ? 'comunhao_total' : r
  return REGIMES.includes(v) ? v : null
}

export type ResultadoCasamento =
  | { ok: true }
  | { confirmar: Array<{ id: string; nome: string }> }
  | { erro: string; status: number }

/**
 * Registra (ou desfaz, com conjugeId null) o casamento pelos ponteiros pessoas.conjuge_pessoa_id dos
 * DOIS lados, com estado civil/regime/data; a sincronização da Fase A cria/encerra o Relacionamento.
 * Encerrar o casamento de terceiros só com `confirmarEncerrar` (senão devolve quem seria afetado).
 * Quem chama confere permissão/visibilidade. `sb` = service role.
 */
export async function registrarCasamento(
  sb: SupabaseClient,
  empresaId: string,
  pessoaId: string,
  conjugeId: string | null,
  opts: { estadoCivil: string; regime: string | null; data: string | null; confirmarEncerrar?: boolean },
): Promise<ResultadoCasamento> {
  const estadoCivil = opts.estadoCivil === 'uniao_estavel' ? 'uniao_estavel' : 'casado'
  const regime = normalizarRegime(opts.regime)
  const data = opts.data && /^\d{4}-\d{2}-\d{2}$/.test(opts.data) ? opts.data : null
  const ids = conjugeId ? [pessoaId, conjugeId] : [pessoaId]

  const { data: atuais, error: eAt } = await sb.from('pessoas')
    .select('id, nome, conjuge_pessoa_id').eq('empresa_id', empresaId).in('id', ids).is('deleted_at', null)
  if (eAt) return { erro: 'Erro ao carregar as pessoas.', status: 500 }
  if (!atuais || atuais.length !== ids.length) return { erro: 'Pessoa não encontrada.', status: 404 }
  const conjugeAtualDe: Record<string, string | null> = {}
  for (const p of atuais as Array<{ id: string; conjuge_pessoa_id: string | null }>) conjugeAtualDe[p.id] = p.conjuge_pessoa_id
  const outros = Object.values(conjugeAtualDe).filter((x): x is string => !!x && !ids.includes(x))
  if (outros.length) {
    const { data: ex, error: eEx } = await sb.from('pessoas').select('id, conjuge_pessoa_id').in('id', outros)
    if (eEx) return { erro: 'Erro ao carregar o casamento atual.', status: 500 }
    for (const p of (ex ?? []) as Array<{ id: string; conjuge_pessoa_id: string | null }>) conjugeAtualDe[p.id] = p.conjuge_pessoa_id
  }

  let plano: ReturnType<typeof planoCasamento>
  try { plano = planoCasamento({ conjugeAtualDe }, pessoaId, conjugeId) }
  catch (e) { return { erro: (e as Error).message, status: 422 } }

  // Desfazer o casamento da própria pessoa é o pedido; encerrar o de terceiros exige confirmação.
  const terceiros = plano.encerrar.filter(id => id !== pessoaId && id !== conjugeAtualDe[pessoaId])
  if (terceiros.length && !opts.confirmarEncerrar) {
    const { data: nomes } = await sb.from('pessoas').select('id, nome').in('id', terceiros)
    return { confirmar: ((nomes ?? []) as Array<{ id: string; nome: string }>) }
  }

  for (const id of plano.encerrar) {
    const { error } = await sb.from('pessoas').update({ conjuge_pessoa_id: null }).eq('id', id).eq('empresa_id', empresaId)
    if (error) return { erro: 'Erro ao atualizar o casamento.', status: 500 }
  }
  if (plano.ligar) {
    const [a, b] = plano.ligar
    for (const [de, para] of [[a, b], [b, a]] as const) {
      const { data: gravado, error } = await sb.from('pessoas')
        .update({ conjuge_pessoa_id: para, estado_civil: estadoCivil, regime_casamento: regime, data_casamento: data })
        .eq('id', de).eq('empresa_id', empresaId).select('id')
      if (error || !gravado?.length) return { erro: 'Erro ao gravar o casamento.', status: 500 }
    }
  }
  return { ok: true }
}
