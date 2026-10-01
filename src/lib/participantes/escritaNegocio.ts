import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResultadoEscrita } from './escritaServidor'

/**
 * Serviço único de escrita dos participantes do NEGÓCIO (V2 B2c-C1c) — par de escritaServidor.ts (lead).
 * Ainda grava nas tabelas antigas (processo_compradores/processo_vendedores, sincronização da Fase A ligada);
 * na virada (C2) só o miolo destas funções muda. Nenhum componente grava essas tabelas direto.
 * `sb` = service role; quem chama confere permissão/visibilidade do negócio.
 */

export type LadoNegocio = 'compradores' | 'vendedores'

const TABELA: Record<LadoNegocio, string> = {
  compradores: 'processo_compradores',
  vendedores: 'processo_vendedores',
}

const CAMPOS: Record<LadoNegocio, readonly string[]> = {
  compradores: ['nome', 'cpf', 'email', 'telefone', 'renda_mensal', 'principal', 'pessoa_id'],
  vendedores: ['nome', 'cpf', 'email', 'telefone', 'banco', 'agencia', 'conta', 'estado_civil', 'conjuge_nome',
    'conjuge_cpf', 'conjuge_rg', 'conjuge_data_nasc', 'conjuge_papel', 'pessoa_id'],
}

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

/** Pessoa pelo CPF (mesma empresa, não excluída, nunca de operador) — só vincula, nunca cria. */
async function pessoaIdPorCpf(sb: SupabaseClient, empresaId: string, cpfBruto: unknown): Promise<string | null> {
  if (typeof cpfBruto !== 'string') return null
  const cpf = cpfBruto.replace(/\D/g, '')
  if (!cpf) return null
  const { data, error } = await sb.from('pessoas').select('id')
    .eq('empresa_id', empresaId).is('deleted_at', null)
    .or(`cpf.eq.${cpf},cpf.eq.${cpfBruto.trim()}`).limit(1).maybeSingle()
  if (error || !data) return null
  const op = await ehOperador(sb, data.id as string)
  return op === false ? (data.id as string) : null
}

export async function incluirLinhaNegocio(
  sb: SupabaseClient, empresaId: string, processoId: string, lado: LadoNegocio, dados: Record<string, unknown>,
): Promise<{ ok: true; id: string; pessoa_id: string | null } | { erro: string; status: number }> {
  const campos = camposPermitidos(lado, dados)
  if (typeof campos.nome !== 'string' || !campos.nome.trim()) return { erro: 'Informe o nome.', status: 422 }
  if (typeof campos.pessoa_id === 'string' && campos.pessoa_id) {
    const op = await ehOperador(sb, campos.pessoa_id)
    if (typeof op !== 'boolean') return op
    if (op) return { erro: 'Esse cadastro é de um usuário da equipe — não pode ser participante.', status: 422 }
  } else {
    campos.pessoa_id = await pessoaIdPorCpf(sb, empresaId, campos.cpf)
  }
  const { data, error } = await sb.from(TABELA[lado])
    .insert({ ...campos, processo_id: processoId, empresa_id: empresaId }).select('id').single()
  if (error || !data) return { erro: `Erro ao adicionar ${lado === 'compradores' ? 'comprador' : 'vendedor'}.`, status: 500 }
  return { ok: true, id: data.id as string, pessoa_id: (campos.pessoa_id as string | null) ?? null }
}

export async function editarLinhaNegocio(
  sb: SupabaseClient, empresaId: string, processoId: string, lado: LadoNegocio, linhaId: string, dados: Record<string, unknown>,
): Promise<{ ok: true; pessoa_id: string | null } | { erro: string; status: number }> {
  const { data: linha, error: eL } = await sb.from(TABELA[lado]).select('id, pessoa_id, cpf')
    .eq('id', linhaId).eq('processo_id', processoId).eq('empresa_id', empresaId).maybeSingle()
  if (eL) return { erro: 'Erro ao carregar o participante.', status: 500 }
  if (!linha) return { erro: 'Participante não encontrado.', status: 404 }

  const campos = camposPermitidos(lado, dados)
  // Trocar a Pessoa vinculada não é edição de campo (vira outro participante) — só o vínculo pelo CPF.
  delete campos.pessoa_id
  let pessoaId = (linha.pessoa_id as string | null) ?? null
  if (!pessoaId) {
    pessoaId = await pessoaIdPorCpf(sb, empresaId, campos.cpf ?? linha.cpf)
    if (pessoaId) campos.pessoa_id = pessoaId
  }
  if (Object.keys(campos).length === 0) return { ok: true, pessoa_id: pessoaId }
  const { data, error } = await sb.from(TABELA[lado]).update(campos).eq('id', linhaId).select('id')
  if (error) return { erro: 'Erro ao salvar o participante.', status: 500 }
  if (!data?.length) return { erro: 'Nada foi gravado.', status: 409 }
  return { ok: true, pessoa_id: pessoaId }
}

export async function removerLinhaNegocio(
  sb: SupabaseClient, empresaId: string, processoId: string, lado: LadoNegocio, linhaId: string,
): Promise<ResultadoEscrita> {
  const { data, error } = await sb.from(TABELA[lado]).delete()
    .eq('id', linhaId).eq('processo_id', processoId).eq('empresa_id', empresaId).select('id')
  if (error) return { erro: 'Erro ao remover o participante.', status: 500 }
  if (!data?.length) return { erro: 'Participante não encontrado.', status: 404 }
  return { ok: true }
}

export interface TitularNovoNegocio {
  pessoa_id: string | null
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
}

export interface VendedorEscolhido { pessoa_id: string; nome: string; cpf: string | null }

function rendaTotal(f: unknown, i: unknown): number | null {
  const t = (Number(f) || 0) + (Number(i) || 0)
  return t > 0 ? t : null
}

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
  const usadas = new Set<string>()
  const podeUsar = async (pessoaId: string | null): Promise<boolean> => {
    if (!pessoaId) return true
    if (usadas.has(pessoaId)) return false
    const op = await ehOperador(sb, pessoaId)
    if (op !== false) return false
    usadas.add(pessoaId)
    return true
  }

  const compradores: Record<string, unknown>[] = []
  const vendedores: Record<string, unknown>[] = []

  if (p.titular?.nome.trim()) {
    const pessoaId = (await podeUsar(p.titular.pessoa_id)) ? p.titular.pessoa_id : null
    compradores.push({
      nome: p.titular.nome.trim(), cpf: p.titular.cpf || null, email: p.titular.email || null,
      telefone: p.titular.telefone || null, principal: true, pessoa_id: pessoaId,
    })
  }

  type Part = { pessoa_id: string; papel: string; pessoa: { nome: string | null; cpf: string | null; renda_formal: number | null; renda_informal: number | null; deleted_at: string | null } | null }
  let doLead: Part[] = []
  let lead: Record<string, unknown> | null = null
  if (p.leadId) {
    const [{ data: parts, error: eP }, { data: l, error: eL }] = await Promise.all([
      sb.from('participacoes').select('pessoa_id, papel, pessoa:pessoas!pessoa_id(nome, cpf, renda_formal, renda_informal, deleted_at)')
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
    if (!x.pessoa?.nome || !(await podeUsar(x.pessoa_id))) continue
    compradores.push({
      nome: x.pessoa.nome, cpf: x.pessoa.cpf ?? null, pessoa_id: x.pessoa_id, principal: false,
      renda_mensal: rendaTotal(x.pessoa.renda_formal, x.pessoa.renda_informal),
    })
  }

  if (p.vendedores?.length) {
    for (const v of p.vendedores) {
      if (!(await podeUsar(v.pessoa_id))) continue
      vendedores.push({ nome: v.nome, cpf: v.cpf ?? null, pessoa_id: v.pessoa_id })
    }
  } else {
    for (const x of doLead) {
      if (x.papel !== 'vendedor' || !(await podeUsar(x.pessoa_id))) continue
      vendedores.push({ nome: x.pessoa?.nome?.trim() || '(a definir)', cpf: x.pessoa?.cpf?.trim() || null, pessoa_id: x.pessoa_id })
    }
    const vNome = typeof lead?.vendedor_nome === 'string' ? lead.vendedor_nome.trim() : ''
    const vPessoa = (lead?.vendedor_pessoa_id as string | null) ?? null
    if (!vendedores.length && (vNome || vPessoa) && (await podeUsar(vPessoa))) {
      vendedores.push({
        nome: vNome || '(a definir)', cpf: (lead?.vendedor_cpf as string | null)?.trim() || null,
        telefone: (lead?.vendedor_telefone as string | null)?.trim() || null, pessoa_id: vPessoa,
      })
    }
  }

  const base = { processo_id: processoId, empresa_id: empresaId }
  if (compradores.length) {
    const { error } = await sb.from('processo_compradores').insert(compradores.map(c => ({ ...c, ...base })))
    if (error) return { erro: 'Erro ao gravar os compradores do negócio.', status: 500 }
  }
  if (vendedores.length) {
    const { error } = await sb.from('processo_vendedores').insert(vendedores.map(v => ({ ...v, ...base })))
    if (error) return { erro: 'Erro ao gravar os vendedores do negócio.', status: 500 }
  }
  return { ok: true }
}
