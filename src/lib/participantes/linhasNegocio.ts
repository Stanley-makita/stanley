import type { PessoaDetalhes, ProcessoComprador, ProcessoVendedor } from '@/types/processos'

/**
 * Abas Compradores/Vendedores do negócio (V2 C2): cada linha é uma participação; os dados vêm da Pessoa
 * (e do cônjuge cadastrado, para o vendedor). Mesmo formato ProcessoComprador/ProcessoVendedor de antes —
 * as telas, o contrato e as custas não mudam. `id` = id da participação (editar/remover usam esse id).
 */

const PESSOA_DETALHES = 'rg, registro_cnh, profissao, nacionalidade, data_nascimento, data_emissao, orgao_emissor, estado_civil, regime_casamento, data_casamento, conjuge_nome, conjuge_cpf, conjuge_data_nascimento, endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep'

export const SELECT_LINHAS_NEGOCIO = `id, processo_id, empresa_id, pessoa_id, papel, ordem, explicita, created_at,
  pessoa:pessoas!pessoa_id(id, nome, cpf, email, renda_formal, renda_informal, deleted_at,
    conta_bancaria_banco, conta_bancaria_agencia, conta_bancaria_numero, ${PESSOA_DETALHES},
    telefones:pessoa_telefones(telefone, principal, ativo),
    conjuge:pessoas!conjuge_pessoa_id(id, nome, cpf, rg, data_nascimento, deleted_at))`

type Telefone = { telefone: string; principal: boolean; ativo: boolean }
type Conjuge = { id: string; nome: string | null; cpf: string | null; rg: string | null; data_nascimento: string | null; deleted_at: string | null }
type PessoaLinha = PessoaDetalhes & {
  id: string; nome: string | null; cpf: string | null; email: string | null
  renda_formal: number | null; renda_informal: number | null; deleted_at: string | null
  conta_bancaria_banco: string | null; conta_bancaria_agencia: string | null; conta_bancaria_numero: string | null
  telefones?: Telefone[] | null
  conjuge?: Conjuge | Conjuge[] | null
}
export type LinhaParticipacao = {
  id: string; processo_id: string; empresa_id: string; pessoa_id: string; papel: string; ordem: number
  explicita: boolean; created_at: string
  pessoa: PessoaLinha | PessoaLinha[] | null
}

const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

function telefonePrincipal(tels: Telefone[] | null | undefined): string | null {
  const ativos = (tels ?? []).filter(t => t.ativo)
  return (ativos.find(t => t.principal) ?? ativos[0])?.telefone ?? null
}

function detalhes(p: PessoaLinha): PessoaDetalhes {
  const { telefones: _t, conjuge: _c, ...resto } = p
  void _t; void _c
  return resto as PessoaDetalhes
}

const COMPRA = ['titular', 'coparticipante', 'conjuge_anuente']

/** Titular primeiro, depois a ordem; Pessoa excluída nunca aparece. */
export function comoCompradores(linhas: LinhaParticipacao[]): ProcessoComprador[] {
  return linhas
    .map(l => ({ l, p: um(l.pessoa) }))
    .filter((x): x is { l: LinhaParticipacao; p: PessoaLinha } => COMPRA.includes(x.l.papel) && !!x.p && !x.p.deleted_at)
    .sort((a, b) => Number(b.l.papel === 'titular') - Number(a.l.papel === 'titular') || a.l.ordem - b.l.ordem)
    .map(({ l, p }) => {
      const renda = (Number(p.renda_formal) || 0) + (Number(p.renda_informal) || 0)
      return {
        id: l.id, processo_id: l.processo_id, empresa_id: l.empresa_id, pessoa_id: l.pessoa_id,
        nome: p.nome ?? '', cpf: p.cpf ?? null, email: p.email ?? null, telefone: telefonePrincipal(p.telefones),
        renda_mensal: renda > 0 ? renda : null, principal: l.papel === 'titular', created_at: l.created_at,
        pessoa: detalhes(p),
      }
    })
}

/** Só quem vende; o cônjuge que também é vendedor aparece como "proprietário" na linha do outro. */
export function comoVendedores(linhas: LinhaParticipacao[]): ProcessoVendedor[] {
  const vendedores = linhas
    .map(l => ({ l, p: um(l.pessoa) }))
    .filter((x): x is { l: LinhaParticipacao; p: PessoaLinha } => x.l.papel === 'vendedor' && !!x.p && !x.p.deleted_at)
    .sort((a, b) => a.l.ordem - b.l.ordem)
  const idsVendedores = new Set(vendedores.map(v => v.l.pessoa_id))
  return vendedores.map(({ l, p }) => {
    const c = um(p.conjuge)
    const conjuge = c && !c.deleted_at && ['casado', 'uniao_estavel'].includes(p.estado_civil ?? '') ? c : null
    return {
      id: l.id, processo_id: l.processo_id, empresa_id: l.empresa_id, pessoa_id: l.pessoa_id,
      nome: p.nome ?? '', cpf: p.cpf ?? null, email: p.email ?? null, telefone: telefonePrincipal(p.telefones),
      banco: p.conta_bancaria_banco ?? null, agencia: p.conta_bancaria_agencia ?? null, conta: p.conta_bancaria_numero ?? null,
      estado_civil: p.estado_civil ?? null,
      conjuge_nome: conjuge?.nome ?? null, conjuge_cpf: conjuge?.cpf ?? null, conjuge_rg: conjuge?.rg ?? null,
      conjuge_data_nasc: conjuge?.data_nascimento ?? null,
      conjuge_papel: conjuge ? (idsVendedores.has(conjuge.id) ? 'proprietario' : 'conjuge') : null,
      created_at: l.created_at,
      pessoa: detalhes(p),
    }
  })
}
