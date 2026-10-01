import type { SupabaseClient } from '@supabase/supabase-js'
import { cpfValido } from '@/lib/cpf'

/**
 * Serviço ÚNICO de escrita de "quem participa" (Participantes V2, B2c).
 * C1: grava no modelo antigo (lead_coparticipantes, lead_vendedores) e a sincronização da Fase A
 * mantém participacoes. C2 (virada): só o miolo destas funções muda para gravar em participacoes.
 * Nenhum componente/rota grava essas tabelas por fora daqui. `sb` = service role; quem chama
 * confere permissão e visibilidade (verificarDestino).
 */

export type ResultadoEscrita = { ok: true } | { erro: string; status: number }

async function ehOperador(sb: SupabaseClient, pessoaId: string): Promise<boolean | { erro: string; status: number }> {
  const { data, error } = await sb.rpc('pessoa_e_de_operador', { p_pessoa_id: pessoaId })
  if (error) return { erro: 'Erro ao verificar a pessoa.', status: 500 }
  return !!data
}

/**
 * Reaproveita a Pessoa pelo CPF (válido) ou cria só com o nome (tipo cliente). Invariante 1 do
 * CLAUDE.md: Pessoa de usuário interno nunca é reaproveitada para cliente.
 */
export async function pessoaPorCpfOuNova(
  sb: SupabaseClient, empresaId: string, nome: string, cpfBruto: string | undefined | null,
): Promise<{ id: string } | { erro: string; status: number }> {
  const cpf = (cpfBruto ?? '').replace(/\D/g, '')
  if (cpfValido(cpf)) {
    const { data: existente, error } = await sb.from('pessoas').select('id')
      .eq('empresa_id', empresaId).eq('cpf', cpf).is('deleted_at', null).maybeSingle()
    if (error) return { erro: 'Erro ao buscar a pessoa pelo CPF.', status: 500 }
    if (existente?.id) {
      const op = await ehOperador(sb, existente.id as string)
      if (typeof op !== 'boolean') return op
      if (op) return { erro: 'Esse CPF pertence ao cadastro de um usuário da equipe — não pode ser usado aqui.', status: 422 }
      return { id: existente.id as string }
    }
  }
  const nomeLimpo = nome.trim()
  if (!nomeLimpo) return { erro: 'Informe o nome.', status: 422 }
  const id = crypto.randomUUID()
  const { error } = await sb.from('pessoas').insert({
    id, empresa_id: empresaId, nome: nomeLimpo, tipo: 'cliente', ...(cpfValido(cpf) ? { cpf } : {}),
  })
  if (error) return { erro: 'Não foi possível criar a pessoa.', status: 500 }
  return { id }
}

async function titularDoLead(
  sb: SupabaseClient, empresaId: string, leadId: string,
): Promise<{ pessoaId: string | null } | { erro: string; status: number }> {
  const { data, error } = await sb.from('leads').select('id, pessoa_id')
    .eq('id', leadId).eq('empresa_id', empresaId).is('deleted_at', null).maybeSingle()
  if (error) return { erro: 'Erro ao carregar o lead.', status: 500 }
  if (!data) return { erro: 'Lead não encontrado.', status: 404 }
  return { pessoaId: (data.pessoa_id as string | null) ?? null }
}

/** Inclui um participante de compra (coparticipante) no lead. Idempotente. */
export async function incluirParticipanteLead(sb: SupabaseClient, empresaId: string, leadId: string, pessoaId: string): Promise<ResultadoEscrita> {
  const lead = await titularDoLead(sb, empresaId, leadId)
  if ('erro' in lead) return lead
  if (lead.pessoaId === pessoaId) return { erro: 'Essa pessoa já é o principal da proposta.', status: 422 }
  const op = await ehOperador(sb, pessoaId)
  if (typeof op !== 'boolean') return op
  if (op) return { erro: 'Pessoa de usuário da equipe não pode ser participante.', status: 422 }
  const { error } = await sb.from('lead_coparticipantes')
    .insert({ id: crypto.randomUUID(), empresa_id: empresaId, lead_id: leadId, pessoa_id: pessoaId })
  if (error && error.code !== '23505') return { erro: 'Não foi possível incluir o participante.', status: 500 }
  return { ok: true }
}

/** Remove um coparticipante do lead (a Pessoa e os documentos dela permanecem). */
export async function removerParticipanteLead(sb: SupabaseClient, empresaId: string, leadId: string, pessoaId: string): Promise<ResultadoEscrita> {
  const { data, error } = await sb.from('lead_coparticipantes').delete()
    .eq('lead_id', leadId).eq('pessoa_id', pessoaId).eq('empresa_id', empresaId).select('id')
  if (error) return { erro: 'Não foi possível remover o participante.', status: 500 }
  if (!data?.length) return { erro: 'Essa pessoa não é coparticipante deste lead.', status: 404 }
  return { ok: true }
}

/** Inclui um vendedor no lead (lead_vendedores). Idempotente. */
export async function incluirVendedorLead(sb: SupabaseClient, empresaId: string, leadId: string, pessoaId: string): Promise<ResultadoEscrita> {
  const lead = await titularDoLead(sb, empresaId, leadId)
  if ('erro' in lead) return lead
  const op = await ehOperador(sb, pessoaId)
  if (typeof op !== 'boolean') return op
  if (op) return { erro: 'Pessoa de usuário da equipe não pode ser vendedora.', status: 422 }
  const { error } = await sb.from('lead_vendedores')
    .insert({ id: crypto.randomUUID(), empresa_id: empresaId, lead_id: leadId, pessoa_id: pessoaId })
  if (error && error.code !== '23505') return { erro: 'Não foi possível incluir o vendedor.', status: 500 }
  return { ok: true }
}

/** Remove um vendedor do lead pelo id do vínculo. */
export async function removerVendedorLead(sb: SupabaseClient, empresaId: string, leadId: string, vinculoId: string): Promise<ResultadoEscrita> {
  const { data, error } = await sb.from('lead_vendedores').delete()
    .eq('id', vinculoId).eq('lead_id', leadId).eq('empresa_id', empresaId).select('id')
  if (error) return { erro: 'Não foi possível remover o vendedor.', status: 500 }
  if (!data?.length) return { erro: 'Vendedor não encontrado neste lead.', status: 404 }
  return { ok: true }
}
