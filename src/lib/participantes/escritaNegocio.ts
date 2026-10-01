import type { SupabaseClient } from '@supabase/supabase-js'
import { variantesTelefoneBR } from '@/lib/telefone'
import {
  casarComNovoConjuge, marcarExplicita, pessoaPorCpfOuNova, type ResultadoEscrita,
} from './escritaServidor'

/**
 * Serviço único de escrita dos participantes do NEGÓCIO (V2) — par de escritaServidor.ts (lead).
 * C2 (virada, migration 333): cada "linha" das abas Compradores/Vendedores é uma participação
 * (`participacoes`, incluída de propósito = `explicita`) e os dados ficam na Pessoa; a sincronização
 * (pv2_sincronizar_processo) deriva cônjuge anuente/cônjuge do vendedor, ordem e compõe renda.
 * processo_compradores/processo_vendedores estão congeladas.
 * `sb` = service role; quem chama confere permissão/visibilidade do negócio.
 */

export type LadoNegocio = 'compradores' | 'vendedores'

const CAMPOS: Record<LadoNegocio, readonly string[]> = {
  compradores: ['nome', 'cpf', 'email', 'telefone', 'renda_mensal', 'principal', 'pessoa_id'],
  vendedores: ['nome', 'cpf', 'email', 'telefone', 'banco', 'agencia', 'conta', 'estado_civil', 'conjuge_nome',
    'conjuge_cpf', 'conjuge_rg', 'conjuge_data_nasc', 'conjuge_papel', 'pessoa_id'],
}

const PAPEIS_COMPRA = ['titular', 'coparticipante', 'conjuge_anuente']
const ESTADOS = ['solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo']

export function camposPermitidos(lado: LadoNegocio, dados: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of CAMPOS[lado]) if (dados[k] !== undefined) out[k] = dados[k]
  return out
}

async function ehOperador(sb: SupabaseClient, pessoaId: string): Promise<boolean | { erro: string; status: number }> {
  const { data, error } = await sb.rpc('pessoa_e_de_operador', { p_pessoa_id: pessoaId })
  if (error) return { erro: 'Erro ao verificar a pessoa.', status: 500 }
  return data === true
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Dados digitados na aba vão para a Pessoa SÓ onde ela ainda não tem (nunca sobrescreve um cadastro);
 * telefone só se ela não tiver nenhum e não for de usuário da equipe.
 */
async function preencherPessoa(sb: SupabaseClient, empresaId: string, pessoaId: string, c: Record<string, unknown>): Promise<ResultadoEscrita> {
  const { data: p, error } = await sb.from('pessoas')
    .select('email, estado_civil, renda_formal, renda_informal, conta_bancaria_banco, conta_bancaria_agencia, conta_bancaria_numero')
    .eq('id', pessoaId).maybeSingle()
  if (error || !p) return { erro: 'Erro ao carregar a pessoa.', status: 500 }
  const patch: Record<string, unknown> = {}
  const email = texto(c.email)
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !p.email) patch.email = email
  const estado = texto(c.estado_civil)?.toLowerCase()
  if (estado && ESTADOS.includes(estado) && !p.estado_civil) patch.estado_civil = estado
  const renda = Number(c.renda_mensal)
  if (renda > 0 && p.renda_formal == null && p.renda_informal == null) patch.renda_formal = renda
  if (texto(c.banco) && !p.conta_bancaria_banco) patch.conta_bancaria_banco = texto(c.banco)
  if (texto(c.agencia) && !p.conta_bancaria_agencia) patch.conta_bancaria_agencia = texto(c.agencia)
  if (texto(c.conta) && !p.conta_bancaria_numero) patch.conta_bancaria_numero = texto(c.conta)
  if (Object.keys(patch).length) {
    const { error: eUp } = await sb.from('pessoas').update(patch).eq('id', pessoaId)
    if (eUp) return { erro: 'Erro ao gravar os dados da pessoa.', status: 500 }
  }
  const tel = texto(c.telefone)
  if (tel) {
    const variantes = variantesTelefoneBR(tel)
    const [{ data: tels }, { data: u1 }, { data: u2 }] = await Promise.all([
      sb.from('pessoa_telefones').select('id').eq('pessoa_id', pessoaId).eq('ativo', true),
      sb.from('usuarios').select('id').eq('empresa_id', empresaId).eq('ativo', true).in('telefone_whatsapp', variantes),
      sb.from('usuarios').select('id').eq('empresa_id', empresaId).eq('ativo', true).in('telefone', variantes),
    ])
    if (!(tels ?? []).length && !(u1 ?? []).length && !(u2 ?? []).length) {
      const { error: eTel } = await sb.from('pessoa_telefones').insert({
        pessoa_id: pessoaId, empresa_id: empresaId, telefone: tel, principal: true, whatsapp: true, ativo: true,
      })
      if (eTel && eTel.code !== '23505') console.error('[escritaNegocio] telefone não gravado:', eTel.message)
    }
  }
  return { ok: true }
}

async function sincronizarProcesso(sb: SupabaseClient, processoId: string): Promise<ResultadoEscrita> {
  const { error } = await sb.rpc('pv2_sincronizar_processo', { p_processo_id: processoId })
  if (error) return { erro: 'Erro ao atualizar os participantes do negócio.', status: 500 }
  return { ok: true }
}

/** Pessoa da linha: a informada (nunca de operador) ou reaproveitada pelo CPF / criada pelo nome. */
async function resolverPessoa(
  sb: SupabaseClient, empresaId: string, campos: Record<string, unknown>,
): Promise<{ id: string } | { erro: string; status: number }> {
  if (typeof campos.pessoa_id === 'string' && campos.pessoa_id) {
    const op = await ehOperador(sb, campos.pessoa_id)
    if (typeof op !== 'boolean') return op
    if (op) return { erro: 'Esse cadastro é de um usuário da equipe — não pode ser participante.', status: 422 }
    return { id: campos.pessoa_id }
  }
  return pessoaPorCpfOuNova(sb, empresaId, String(campos.nome ?? ''), typeof campos.cpf === 'string' ? campos.cpf : null)
}

/**
 * Cônjuge do vendedor casado: o já cadastrado (pessoas.conjuge_pessoa_id) ou o digitado na linha (Pessoa
 * própria + casamento). "Proprietário" = também vende (participação vendedor incluída de propósito);
 * "cônjuge" = só assina (a sincronização deriva conjuge_vendedor).
 */
async function conjugeDoVendedor(
  sb: SupabaseClient, empresaId: string, processoId: string, vendedorId: string, c: Record<string, unknown>,
): Promise<ResultadoEscrita> {
  const estado = texto(c.estado_civil)?.toLowerCase()
  if (estado !== 'casado' && estado !== 'uniao_estavel') return { ok: true }
  const { data: v, error } = await sb.from('pessoas').select('conjuge_pessoa_id').eq('id', vendedorId).maybeSingle()
  if (error) return { erro: 'Erro ao carregar o vendedor.', status: 500 }
  let conjugeId = (v?.conjuge_pessoa_id as string | null) ?? null
  const nome = texto(c.conjuge_nome)
  if (!conjugeId && nome) {
    const r = await casarComNovoConjuge(sb, empresaId, vendedorId, {
      nome, cpf: texto(c.conjuge_cpf), data_nascimento: texto(c.conjuge_data_nasc),
    }, { estadoCivil: estado, regime: null, data: null })
    if ('erro' in r) return r
    if ('confirmar' in r) return { ok: true } // casado com outra pessoa: não encerra casamento sem confirmação
    conjugeId = r.conjugeId
  }
  if (!conjugeId || c.conjuge_papel === undefined) return { ok: true }
  const alvo = { coluna: 'processo_id' as const, id: processoId }
  if (c.conjuge_papel === 'proprietario') {
    const m = await marcarExplicita(sb, empresaId, alvo, conjugeId, 'vendedor')
    if ('erro' in m) return m
  } else {
    // deixou de ser proprietário: sai como vendedor (a sincronização devolve como cônjuge que assina)
    const { error: eDel } = await sb.from('participacoes').delete()
      .eq('processo_id', processoId).eq('pessoa_id', conjugeId).eq('papel', 'vendedor')
    if (eDel) return { erro: 'Erro ao atualizar o cônjuge do vendedor.', status: 500 }
  }
  return { ok: true }
}

export async function incluirLinhaNegocio(
  sb: SupabaseClient, empresaId: string, processoId: string, lado: LadoNegocio, dados: Record<string, unknown>,
): Promise<{ ok: true; id: string; pessoa_id: string } | { erro: string; status: number }> {
  const campos = camposPermitidos(lado, dados)
  if (typeof campos.nome !== 'string' || !campos.nome.trim()) return { erro: 'Informe o nome.', status: 422 }
  const pessoa = await resolverPessoa(sb, empresaId, campos)
  if ('erro' in pessoa) return pessoa
  const pre = await preencherPessoa(sb, empresaId, pessoa.id, campos)
  if ('erro' in pre) return pre
  const papel = lado === 'vendedores' ? 'vendedor' : campos.principal === true ? 'titular' : 'coparticipante'
  const r = await marcarExplicita(sb, empresaId, { coluna: 'processo_id', id: processoId }, pessoa.id, papel)
  if ('erro' in r) return r
  if (lado === 'vendedores') {
    const c = await conjugeDoVendedor(sb, empresaId, processoId, pessoa.id, campos)
    if ('erro' in c) return c
  }
  const sync = await sincronizarProcesso(sb, processoId)
  if ('erro' in sync) return sync
  return { ok: true, id: r.participacaoId, pessoa_id: pessoa.id }
}

/**
 * Edição na aba (linhaId = id da participação). Os dados pessoais são gravados na Pessoa pelo hook da aba
 * (RLS + histórico); aqui: principal (titular), renda do comprador e cônjuge do vendedor.
 */
export async function editarLinhaNegocio(
  sb: SupabaseClient, empresaId: string, processoId: string, lado: LadoNegocio, linhaId: string, dados: Record<string, unknown>,
): Promise<{ ok: true; pessoa_id: string } | { erro: string; status: number }> {
  const { data: linha, error: eL } = await sb.from('participacoes').select('id, pessoa_id, papel')
    .eq('id', linhaId).eq('processo_id', processoId).eq('empresa_id', empresaId).maybeSingle()
  if (eL) return { erro: 'Erro ao carregar o participante.', status: 500 }
  if (!linha) return { erro: 'Participante não encontrado.', status: 404 }
  const pessoaId = linha.pessoa_id as string
  const campos = camposPermitidos(lado, dados)

  if (lado === 'compradores') {
    if (campos.principal === true && linha.papel !== 'titular') {
      const r = await marcarExplicita(sb, empresaId, { coluna: 'processo_id', id: processoId }, pessoaId, 'titular')
      if ('erro' in r) return r
    }
    if (campos.renda_mensal !== undefined) {
      // Renda total digitada: o informal da Pessoa é mantido, o formal completa o total.
      const total = Number(campos.renda_mensal) || 0
      const { data: p, error } = await sb.from('pessoas').select('renda_formal, renda_informal').eq('id', pessoaId).maybeSingle()
      if (error || !p) return { erro: 'Erro ao carregar a pessoa.', status: 500 }
      const atual = (Number(p.renda_formal) || 0) + (Number(p.renda_informal) || 0)
      if (total !== atual) {
        const formal = Math.max(0, total - (Number(p.renda_informal) || 0))
        const { error: eR } = await sb.from('pessoas').update({ renda_formal: formal || null }).eq('id', pessoaId)
        if (eR) return { erro: 'Erro ao gravar a renda.', status: 500 }
      }
    }
  } else {
    const c = await conjugeDoVendedor(sb, empresaId, processoId, pessoaId, campos)
    if ('erro' in c) return c
  }
  const pre = await preencherPessoa(sb, empresaId, pessoaId, campos)
  if ('erro' in pre) return pre
  const sync = await sincronizarProcesso(sb, processoId)
  if ('erro' in sync) return sync
  return { ok: true, pessoa_id: pessoaId }
}

export async function removerLinhaNegocio(
  sb: SupabaseClient, empresaId: string, processoId: string, lado: LadoNegocio, linhaId: string,
): Promise<ResultadoEscrita> {
  const papeis = lado === 'compradores' ? PAPEIS_COMPRA : ['vendedor', 'conjuge_vendedor']
  const { data: linha, error: eL } = await sb.from('participacoes').select('id, explicita')
    .eq('id', linhaId).eq('processo_id', processoId).eq('empresa_id', empresaId).in('papel', papeis).maybeSingle()
  if (eL) return { erro: 'Erro ao carregar o participante.', status: 500 }
  if (!linha) return { erro: 'Participante não encontrado.', status: 404 }
  if (!linha.explicita) {
    return { erro: 'Essa pessoa está no negócio por casamento com um participante — para tirar, ajuste o casamento.', status: 422 }
  }
  const { data, error } = await sb.from('participacoes').delete().eq('id', linhaId).select('id')
  if (error) return { erro: 'Erro ao remover o participante.', status: 500 }
  if (!data?.length) return { erro: 'Participante não encontrado.', status: 404 }
  return sincronizarProcesso(sb, processoId)
}

export interface TitularNovoNegocio {
  pessoa_id: string | null
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
}

export interface VendedorEscolhido { pessoa_id: string; nome: string; cpf: string | null }

/**
 * Participantes de um negócio recém-criado (Novo Processo, a partir de lead ou não):
 *  - comprador principal com os dados do modal;
 *  - demais participantes de compra do lead (coparticipantes + cônjuge), lidos de `participacoes`;
 *  - vendedores: os escolhidos no modal; sem nenhum, os vendedores do lead; sem nenhum, os campos soltos
 *    vendedor_* do lead (comportamento anterior).
 * Nunca repete a mesma Pessoa nem usa Pessoa de operador.
 */
export async function participantesIniciaisDoNegocio(
  sb: SupabaseClient, empresaId: string, processoId: string,
  p: { leadId: string | null; titular: TitularNovoNegocio | null; vendedores: VendedorEscolhido[] | null },
): Promise<ResultadoEscrita> {
  const alvo = { coluna: 'processo_id' as const, id: processoId }
  const usadas = new Set<string>()
  const podeUsar = async (pessoaId: string | null): Promise<boolean> => {
    if (!pessoaId || usadas.has(pessoaId)) return false
    const op = await ehOperador(sb, pessoaId)
    if (op !== false) return false
    usadas.add(pessoaId)
    return true
  }
  const incluir = async (pessoaId: string, papel: 'titular' | 'coparticipante' | 'vendedor'): Promise<ResultadoEscrita> => {
    const r = await marcarExplicita(sb, empresaId, alvo, pessoaId, papel)
    return 'erro' in r ? r : { ok: true }
  }

  if (p.titular?.nome.trim()) {
    let pid = p.titular.pessoa_id
    if (!pid) {
      const r = await pessoaPorCpfOuNova(sb, empresaId, p.titular.nome, p.titular.cpf)
      pid = 'erro' in r ? null : r.id
    }
    if (await podeUsar(pid)) {
      const pre = await preencherPessoa(sb, empresaId, pid as string, { email: p.titular.email, telefone: p.titular.telefone })
      if ('erro' in pre) return pre
      const r = await incluir(pid as string, 'titular')
      if ('erro' in r) return r
    }
  }

  type Part = { pessoa_id: string; papel: string; pessoa: { deleted_at: string | null } | null }
  let doLead: Part[] = []
  let lead: Record<string, unknown> | null = null
  if (p.leadId) {
    const [{ data: parts, error: eP }, { data: l, error: eL }] = await Promise.all([
      sb.from('participacoes').select('pessoa_id, papel, pessoa:pessoas!pessoa_id(deleted_at)')
        .eq('lead_id', p.leadId).eq('empresa_id', empresaId).order('ordem', { ascending: true }),
      sb.from('leads').select('vendedor_nome, vendedor_cpf, vendedor_telefone, vendedor_pessoa_id')
        .eq('id', p.leadId).eq('empresa_id', empresaId).maybeSingle(),
    ])
    if (eP || eL) return { erro: 'Erro ao carregar os participantes do lead.', status: 500 }
    doLead = ((parts ?? []) as unknown as Part[]).filter(x => x.pessoa && !x.pessoa.deleted_at)
    lead = l
  }

  for (const x of doLead) {
    if (x.papel !== 'coparticipante' && x.papel !== 'conjuge_anuente') continue
    if (!(await podeUsar(x.pessoa_id))) continue
    const r = await incluir(x.pessoa_id, 'coparticipante')
    if ('erro' in r) return r
  }

  let algumVendedor = false
  const vendedor = async (pessoaId: string | null): Promise<ResultadoEscrita> => {
    if (!(await podeUsar(pessoaId))) return { ok: true }
    algumVendedor = true
    return incluir(pessoaId as string, 'vendedor')
  }
  if (p.vendedores?.length) {
    for (const v of p.vendedores) { const r = await vendedor(v.pessoa_id); if ('erro' in r) return r }
  } else {
    for (const x of doLead) {
      if (x.papel !== 'vendedor') continue
      const r = await vendedor(x.pessoa_id); if ('erro' in r) return r
    }
    const vNome = typeof lead?.vendedor_nome === 'string' ? lead.vendedor_nome.trim() : ''
    let vPessoa = (lead?.vendedor_pessoa_id as string | null) ?? null
    if (!algumVendedor && (vNome || vPessoa)) {
      if (!vPessoa) {
        const r = await pessoaPorCpfOuNova(sb, empresaId, vNome, (lead?.vendedor_cpf as string | null) ?? null)
        vPessoa = 'erro' in r ? null : r.id
      }
      if (vPessoa) {
        const pre = await preencherPessoa(sb, empresaId, vPessoa, { telefone: lead?.vendedor_telefone })
        if ('erro' in pre) return pre
        const r = await vendedor(vPessoa); if ('erro' in r) return r
      }
    }
  }

  return sincronizarProcesso(sb, processoId)
}
