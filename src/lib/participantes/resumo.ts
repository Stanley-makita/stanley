import { PAPEIS_COMPRA, type PapelParticipacao, type ParticipanteLista } from './tipos'

/**
 * Embed PostgREST das participações de um lead/processo com o mínimo da Pessoa para listas,
 * cabeçalhos e buscas. Uso: `.select(\`*, ${EMBED_PARTICIPANTES}\`)` em `processos`/`leads`,
 * ou aninhado (`processo:processos!processo_id(id, ${EMBED_PARTICIPANTES})`).
 * Nome/CPF sempre da Pessoa — nunca de processo_compradores/processo_vendedores/lead_vendedores.
 */
export const EMBED_PARTICIPANTES =
  'participantes:participacoes(id, papel, ordem, pessoa:pessoas!pessoa_id(id, nome, cpf, deleted_at))'

type PessoaEmbed = { id: string; nome: string | null; cpf: string | null; deleted_at?: string | null }

export type ParticipacaoEmbed = {
  id: string
  papel: PapelParticipacao
  ordem: number
  pessoa: PessoaEmbed | PessoaEmbed[] | null
}

// Mesma prioridade de carregarParticipantes (carregar.ts): titular antes, o resto pela ordem.
const PRIORIDADE: Record<PapelParticipacao, number> = {
  titular: 0, coparticipante: 1, conjuge_anuente: 1, vendedor: 0, conjuge_vendedor: 1,
}

function lista(parts: ParticipacaoEmbed[] | null | undefined, papeis: readonly PapelParticipacao[]): ParticipanteLista[] {
  return (parts ?? [])
    .map(pa => ({ pa, pessoa: Array.isArray(pa.pessoa) ? (pa.pessoa[0] ?? null) : pa.pessoa }))
    // Pessoa excluída (soft delete) nunca aparece: a sincronização não observa exclusão de Pessoa.
    .filter((x): x is { pa: ParticipacaoEmbed; pessoa: PessoaEmbed } => papeis.includes(x.pa.papel) && !!x.pessoa && !x.pessoa.deleted_at)
    .sort((a, b) => PRIORIDADE[a.pa.papel] - PRIORIDADE[b.pa.papel] || a.pa.ordem - b.pa.ordem)
    .map(({ pa, pessoa }) => ({
      id: pa.id,
      pessoa_id: pessoa.id,
      nome: pessoa.nome ?? '',
      cpf: pessoa.cpf ?? null,
      papel: pa.papel,
      principal: pa.papel === 'titular',
    }))
}

/** Lado da compra (titular, coparticipantes, cônjuges anuentes), titular primeiro. */
export function compradoresDaProposta(parts: ParticipacaoEmbed[] | null | undefined): ParticipanteLista[] {
  return lista(parts, PAPEIS_COMPRA)
}

/** Só quem vende (papel 'vendedor'); o cônjuge do vendedor só assina e não entra na lista. */
export function vendedoresDaProposta(parts: ParticipacaoEmbed[] | null | undefined): ParticipanteLista[] {
  return lista(parts, ['vendedor'])
}

/** Nome do titular; sem titular (ex.: Pessoa excluída), o 1º comprador; sem ninguém, null. */
export function nomeTitular(parts: ParticipacaoEmbed[] | null | undefined): string | null {
  return compradoresDaProposta(parts)[0]?.nome || null
}

/** Troca o embed `participantes` pelas listas `compradores`/`vendedores` que as telas já usam. */
export function comListasDeParticipantes<T extends { participantes?: ParticipacaoEmbed[] | null }>(
  row: T,
): Omit<T, 'participantes'> & { compradores: ParticipanteLista[]; vendedores: ParticipanteLista[] } {
  const { participantes, ...resto } = row
  return { ...resto, compradores: compradoresDaProposta(participantes), vendedores: vendedoresDaProposta(participantes) }
}

/** Vendedores no formato `LeadVendedor` (src/types/leads.ts) — lista de leads. */
export function comoLeadVendedores(parts: ParticipacaoEmbed[] | null | undefined) {
  return vendedoresDaProposta(parts).map(v => ({
    id: v.id, pessoa_id: v.pessoa_id, pessoa: { id: v.pessoa_id, nome: v.nome, cpf: v.cpf },
  }))
}
