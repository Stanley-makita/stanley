import type { SupabaseClient } from '@supabase/supabase-js'
import { cpfValido } from '@/lib/cpf'
import { registrarCasamento } from './casamentoServidor'

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

/**
 * Troca o titular do lead ("Tornar principal"). C1: modelo antigo, ordem pensada para a sincronização:
 *  1. congela o "compõe renda" atual de todos (compoe_renda_manual);
 *  2. o antigo titular e o cônjuge dele entram em lead_coparticipantes;
 *  3. leads.pessoa_id = novo; nome/CPF/nascimento acompanham; o cônjuge do antigo é desligado do lead
 *     (conjuge_pessoa_id/nome/CPF/nascimento — NUNCA conjuge_renda_*: fn_pv2_leads copiaria o nulo para a
 *     renda da Pessoa do cônjuge); telefone/e-mail de contato do lead não mudam;
 *  4. o novo titular sai de lead_coparticipantes.
 * Novo titular já titular de outro lead aberto (leads_pessoa_aberto_unico) → 409, passo 2 desfeito.
 */
export async function trocarTitularLead(
  sb: SupabaseClient, empresaId: string, leadId: string, novoId: string,
): Promise<{ ok: true; alterado: boolean; antigoNome: string | null; novoNome: string } | { erro: string; status: number }> {
  const { data: lead, error: eLead } = await sb.from('leads').select('id, pessoa_id')
    .eq('id', leadId).eq('empresa_id', empresaId).is('deleted_at', null).maybeSingle()
  if (eLead) return { erro: 'Erro ao carregar o lead.', status: 500 }
  if (!lead) return { erro: 'Lead não encontrado.', status: 404 }
  const antigoId = (lead.pessoa_id as string | null) ?? null
  if (antigoId === novoId) return { ok: true, alterado: false, antigoNome: null, novoNome: '' }

  const { data: parts, error: eParts } = await sb.from('participacoes')
    .select('id, pessoa_id, papel, compoe_renda, compoe_renda_manual').eq('lead_id', leadId).eq('empresa_id', empresaId)
  if (eParts) return { erro: 'Erro ao carregar os participantes.', status: 500 }
  const lista = (parts ?? []) as Array<{ id: string; pessoa_id: string; papel: string; compoe_renda: boolean; compoe_renda_manual: boolean | null }>
  if (!lista.some(p => p.pessoa_id === novoId && ['coparticipante', 'conjuge_anuente'].includes(p.papel))) {
    return { erro: 'Essa pessoa não participa da compra nesta proposta.', status: 422 }
  }

  const { data: novo, error: eNovo } = await sb.from('pessoas').select('id, nome, cpf, data_nascimento')
    .eq('id', novoId).is('deleted_at', null).maybeSingle()
  if (eNovo) return { erro: 'Erro ao carregar a pessoa.', status: 500 }
  if (!novo) return { erro: 'Pessoa não encontrada.', status: 404 }

  for (const p of lista.filter(x => x.compoe_renda_manual === null || x.compoe_renda_manual === undefined)) {
    const { error } = await sb.from('participacoes').update({ compoe_renda_manual: p.compoe_renda }).eq('id', p.id)
    if (error) return { erro: 'Erro ao preservar o compõe renda.', status: 500 }
  }

  const { data: copartAtuais, error: eCop } = await sb.from('lead_coparticipantes').select('pessoa_id').eq('lead_id', leadId)
  if (eCop) return { erro: 'Erro ao carregar os coparticipantes.', status: 500 }
  const jaCopart = new Set(((copartAtuais ?? []) as Array<{ pessoa_id: string }>).map(c => c.pessoa_id))
  const manter = [
    ...(antigoId ? [antigoId] : []),
    ...lista.filter(p => p.papel === 'conjuge_anuente').map(p => p.pessoa_id),
  ].filter(id => id !== novoId && !jaCopart.has(id))
  const inseridos: string[] = []
  const desfazer = async () => {
    if (!inseridos.length) return
    const { error } = await sb.from('lead_coparticipantes').delete().eq('lead_id', leadId).in('pessoa_id', inseridos)
    if (error) console.error('[trocarTitularLead] não desfez coparticipantes:', error.message)
  }
  for (const pessoaId of manter) {
    const { error } = await sb.from('lead_coparticipantes')
      .insert({ id: crypto.randomUUID(), empresa_id: empresaId, lead_id: leadId, pessoa_id: pessoaId })
    if (error && error.code !== '23505') { await desfazer(); return { erro: 'Erro ao manter o antigo principal na proposta.', status: 500 } }
    if (!error) inseridos.push(pessoaId)
  }

  const { data: trocado, error: eTroca } = await sb.from('leads')
    .update({
      pessoa_id: novoId, nome: novo.nome, cpf: novo.cpf ?? null, data_nascimento: novo.data_nascimento ?? null,
      conjuge_pessoa_id: null, conjuge_nome: null, conjuge_cpf: null, conjuge_data_nascimento: null,
    })
    .eq('id', leadId).eq('empresa_id', empresaId).select('id')
  if (eTroca || !trocado?.length) {
    await desfazer()
    if (eTroca?.code === '23505') return { erro: `${novo.nome} já é o principal de outro lead aberto — conclua ou junte os leads antes.`, status: 409 }
    return { erro: 'Não foi possível trocar o principal.', status: 500 }
  }

  const { error: eDel } = await sb.from('lead_coparticipantes').delete().eq('lead_id', leadId).eq('pessoa_id', novoId)
  if (eDel) console.error('[trocarTitularLead] coparticipante não removido:', eDel.message)

  let antigoNome: string | null = null
  if (antigoId) {
    const { data: antigo } = await sb.from('pessoas').select('nome').eq('id', antigoId).maybeSingle()
    antigoNome = (antigo?.nome as string | undefined) ?? null
  }
  return { ok: true, alterado: true, antigoNome, novoNome: novo.nome as string }
}

/**
 * Cônjuge do TITULAR do lead (aba Crédito, bloco do cônjuge — rota vincular-conjuge). Casamento pelo
 * registrarCasamento (dois lados); o ponteiro antigo leads.conjuge_pessoa_id acompanha — sem limpá-lo no
 * desvínculo, a sincronização religaria o cônjuge antigo pelo ponteiro do lead.
 */
export async function definirConjugeTitularLead(
  sb: SupabaseClient, empresaId: string, leadId: string, conjugeId: string | null,
): Promise<ResultadoEscrita | { confirmar: Array<{ id: string; nome: string }> }> {
  const { data: lead, error: eLead } = await sb.from('leads').select('id, pessoa_id')
    .eq('id', leadId).eq('empresa_id', empresaId).is('deleted_at', null).maybeSingle()
  if (eLead) return { erro: 'Erro ao carregar o lead.', status: 500 }
  if (!lead?.pessoa_id) return { erro: 'Lead sem pessoa vinculada.', status: 422 }
  const titularId = lead.pessoa_id as string
  if (conjugeId) {
    const op = await ehOperador(sb, conjugeId)
    if (typeof op !== 'boolean') return op
    if (op) return { erro: 'Pessoa de usuário da equipe não pode ser cônjuge de cliente.', status: 422 }
  }
  const { data: titular } = await sb.from('pessoas').select('estado_civil').eq('id', titularId).maybeSingle()
  const r = await registrarCasamento(sb, empresaId, titularId, conjugeId, {
    estadoCivil: titular?.estado_civil === 'uniao_estavel' ? 'uniao_estavel' : 'casado', regime: null, data: null,
  })
  if ('erro' in r || 'confirmar' in r) return r
  const { error } = await sb.from('leads').update({ conjuge_pessoa_id: conjugeId }).eq('id', leadId).eq('empresa_id', empresaId)
  if (error) return { erro: 'Erro ao atualizar o cônjuge no lead.', status: 500 }
  return { ok: true }
}
