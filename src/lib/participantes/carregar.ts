import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParticipanteCarregado, PapelParticipacao, PessoaRow, PropostaRef, RelacionamentoVigente } from './tipos'

/** Colunas da Pessoa usadas por formulários/contratos. Sem conjuge_* nem regime/data: vêm do Relacionamento. */
export const SELECT_PESSOA_COMPLETA = `
  id, nome, cpf, email, data_nascimento, rg, profissao,
  estado_civil, sexo, renda_formal, renda_informal, nacionalidade,
  endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
  empresa_nome, empresa_cnpj, municipio_trabalho, uf_trabalho,
  conta_bancaria_banco, conta_bancaria_agencia, conta_bancaria_numero, conta_bancaria_digito,
  pessoa_telefones(telefone, principal, ativo)
`

const PRIORIDADE: Record<PapelParticipacao, number> = {
  titular: 0, coparticipante: 1, conjuge_anuente: 1, vendedor: 2, conjuge_vendedor: 2,
}
const SELECT_REL = 'id, pessoa_a_id, pessoa_b_id, tipo, regime_bens, data_inicio'

type LinhaParticipacao = { id: string; pessoa_id: string; papel: PapelParticipacao; compoe_renda: boolean; ordem: number }

export async function carregarParticipantes(sb: SupabaseClient, ref: PropostaRef, empresaId: string): Promise<ParticipanteCarregado[]> {
  const coluna = ref.tipo === 'lead' ? 'lead_id' : 'processo_id'
  const { data: parts, error } = await sb.from('participacoes')
    .select('id, pessoa_id, papel, compoe_renda, ordem')
    .eq(coluna, ref.id).eq('empresa_id', empresaId)
  if (error) throw new Error(`participacoes: ${error.message}`)
  const linhas = (parts ?? []) as LinhaParticipacao[]
  if (linhas.length === 0) return []

  const ids = linhas.map(l => l.pessoa_id)
  const [ra, rb] = await Promise.all([
    sb.from('pessoa_relacionamentos').select(SELECT_REL).in('pessoa_a_id', ids).is('data_fim', null),
    sb.from('pessoa_relacionamentos').select(SELECT_REL).in('pessoa_b_id', ids).is('data_fim', null),
  ])
  if (ra.error || rb.error) throw new Error(`pessoa_relacionamentos: ${(ra.error ?? rb.error)!.message}`)
  const rels = new Map<string, RelacionamentoVigente>()
  for (const r of [...(ra.data ?? []), ...(rb.data ?? [])] as RelacionamentoVigente[]) rels.set(r.id, r)
  const relDe = new Map<string, RelacionamentoVigente>()
  const relsArray: RelacionamentoVigente[] = []
  rels.forEach(r => { relsArray.push(r); relDe.set(r.pessoa_a_id, r); relDe.set(r.pessoa_b_id, r) })
  const outro = (r: RelacionamentoVigente, id: string) => (r.pessoa_a_id === id ? r.pessoa_b_id : r.pessoa_a_id)

  const todosSet = new Set(ids)
  relsArray.forEach(r => { todosSet.add(r.pessoa_a_id); todosSet.add(r.pessoa_b_id) })
  const todos = Array.from(todosSet)
  const { data: pessoas, error: eP } = await sb.from('pessoas').select(SELECT_PESSOA_COMPLETA).in('id', todos).is('deleted_at', null)
  if (eP) throw new Error(`pessoas: ${eP.message}`)
  const porId = new Map((pessoas ?? []).map(p => [(p as PessoaRow).id, p as PessoaRow]))

  const resultado: ParticipanteCarregado[] = []
  for (const l of linhas) {
    const pessoa = porId.get(l.pessoa_id)
    if (!pessoa) continue // Pessoa excluída (soft delete)
    const rel = relDe.get(l.pessoa_id)
    const conjPessoa = rel ? porId.get(outro(rel, l.pessoa_id)) : undefined
    resultado.push({
      participacao_id: l.id, papel: l.papel, compoe_renda: l.compoe_renda, ordem: l.ordem, pessoa,
      conjuge: rel && conjPessoa ? { pessoa: conjPessoa, relacionamento: rel } : null,
    })
  }
  return resultado.sort((a, b) => PRIORIDADE[a.papel] - PRIORIDADE[b.papel] || a.ordem - b.ordem)
}
