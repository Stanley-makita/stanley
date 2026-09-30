import type { DadosComprador, DadosVendedor } from '@/lib/formularios/dados'
import { PAPEIS_COMPRA, type ParticipanteCarregado, type PessoaRow } from './tipos'

const s = (p: PessoaRow, c: string) => (p[c] as string | null | undefined) ?? null
const n = (p: PessoaRow, c: string) => { const v = p[c]; return v == null ? null : Number(v) || 0 }

function telefonePrincipal(p: PessoaRow): string | null {
  const tels = ((p.pessoa_telefones as Array<{ telefone: string; principal: boolean; ativo: boolean }> | undefined) ?? []).filter(t => t.ativo)
  return (tels.find(t => t.principal) ?? tels[0])?.telefone ?? null
}

function paraComprador(pt: ParticipanteCarregado): DadosComprador {
  const p = pt.pessoa
  const c = pt.conjuge?.pessoa ?? null
  const rel = pt.conjuge?.relacionamento ?? null
  return {
    id: p.id,
    nome: s(p, 'nome') ?? '',
    cpf: s(p, 'cpf'),
    email: s(p, 'email'),
    telefone: telefonePrincipal(p),
    data_nascimento: s(p, 'data_nascimento'),
    rg: s(p, 'rg'),
    profissao: s(p, 'profissao'),
    estado_civil: s(p, 'estado_civil'),
    sexo: s(p, 'sexo'),
    renda_formal: n(p, 'renda_formal'),
    renda_informal: n(p, 'renda_informal'),
    nacionalidade: s(p, 'nacionalidade'),
    endereco_rua: s(p, 'endereco_rua'),
    endereco_numero: s(p, 'endereco_numero'),
    endereco_bairro: s(p, 'endereco_bairro'),
    endereco_cidade: s(p, 'endereco_cidade'),
    endereco_uf: s(p, 'endereco_uf'),
    endereco_cep: s(p, 'endereco_cep'),
    regime_casamento: rel?.regime_bens ?? null,
    data_casamento: rel?.data_inicio ?? null,
    conjuge_nome: c ? s(c, 'nome') : null,
    conjuge_cpf: c ? s(c, 'cpf') : null,
    conjuge_data_nascimento: c ? s(c, 'data_nascimento') : null,
    conjuge_profissao: c ? s(c, 'profissao') : null,
    conjuge_renda_formal: c ? n(c, 'renda_formal') : null,
    empresa_nome: s(p, 'empresa_nome'),
    empresa_cnpj: s(p, 'empresa_cnpj'),
    municipio_trabalho: s(p, 'municipio_trabalho'),
    uf_trabalho: s(p, 'uf_trabalho'),
    conta_bancaria_banco: s(p, 'conta_bancaria_banco'),
    conta_bancaria_agencia: s(p, 'conta_bancaria_agencia'),
    conta_bancaria_numero: s(p, 'conta_bancaria_numero'),
    conta_bancaria_digito: s(p, 'conta_bancaria_digito'),
    principal: pt.papel === 'titular',
  }
}

/** Lado da compra, na ordem da proposta (titular primeiro). Espera a lista já ordenada por carregarParticipantes. */
export function montarCompradores(ps: ParticipanteCarregado[]): DadosComprador[] {
  const compra = ps.filter(p => PAPEIS_COMPRA.includes(p.papel))
  const ordenada = [...compra.filter(p => p.papel === 'titular'), ...compra.filter(p => p.papel !== 'titular')]
  return ordenada.map(paraComprador)
}

/** Só quem vende (papel 'vendedor'); o cônjuge que só assina aparece como conjuge_* do vendedor. */
export function montarVendedores(ps: ParticipanteCarregado[]): DadosVendedor[] {
  return ps.filter(p => p.papel === 'vendedor').map(pt => {
    const p = pt.pessoa
    const c = pt.conjuge?.pessoa ?? null
    return {
      id: p.id,
      nome: s(p, 'nome') ?? '',
      cpf: s(p, 'cpf'),
      email: s(p, 'email'),
      telefone: telefonePrincipal(p),
      estado_civil: s(p, 'estado_civil'),
      banco: s(p, 'conta_bancaria_banco'),
      agencia: s(p, 'conta_bancaria_agencia'),
      conta: s(p, 'conta_bancaria_numero'),
      conjuge_nome: c ? s(c, 'nome') : null,
      conjuge_cpf: c ? s(c, 'cpf') : null,
    }
  })
}
