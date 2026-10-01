import type { SupabaseClient } from '@supabase/supabase-js'
import { cpfValido } from '@/lib/cpf'
import { registrarCasamento } from './casamentoServidor'
import { variantesTelefoneBR } from '@/lib/telefone'

/**
 * Serviço ÚNICO de escrita de "quem participa" (Participantes V2, B2c).
 * C2 (virada, migration 333): grava direto em `participacoes`, marcando `explicita` (incluído de
 * propósito), e chama a sincronização (pv2_sincronizar_lead), que deriva o resto — titular pelo
 * leads.pessoa_id, cônjuge anuente pelo casamento, ordem e compõe renda. As tabelas antigas
 * (lead_coparticipantes, lead_vendedores) estão congeladas. `sb` = service role; quem chama
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

const PAPEIS_COMPRA = ['titular', 'coparticipante', 'conjuge_anuente']

export type AlvoParticipacao = { coluna: 'lead_id' | 'processo_id'; id: string }

/**
 * Marca a Pessoa como incluída de propósito na proposta. Já participa (ex.: cônjuge derivado) → só ganha a
 * marca; senão entra com o papel pedido (a sincronização acerta papel/ordem/compõe renda depois).
 * Participar do outro lado (compra x venda) é recusado; cônjuge que só assina pode virar vendedor.
 */
export async function marcarExplicita(
  sb: SupabaseClient, empresaId: string, alvo: AlvoParticipacao, pessoaId: string,
  papel: 'coparticipante' | 'vendedor' | 'titular',
): Promise<{ ok: true; participacaoId: string } | { erro: string; status: number }> {
  const ladoCompra = papel !== 'vendedor'
  const buscar = () => sb.from('participacoes').select('id, papel, explicita')
    .eq(alvo.coluna, alvo.id).eq('pessoa_id', pessoaId).eq('empresa_id', empresaId).maybeSingle()
  let { data: atual, error } = await buscar()
  if (error) return { erro: 'Erro ao carregar os participantes.', status: 500 }
  if (!atual) {
    const id = crypto.randomUUID()
    const { error: eIns } = await sb.from('participacoes').insert({
      id, empresa_id: empresaId, [alvo.coluna]: alvo.id, pessoa_id: pessoaId,
      papel: papel === 'titular' ? 'coparticipante' : papel, compoe_renda: ladoCompra, ordem: 99, explicita: true,
    })
    if (eIns && eIns.code !== '23505') return { erro: 'Não foi possível incluir o participante.', status: 500 }
    if (!eIns && papel !== 'titular') return { ok: true, participacaoId: id }
    ;({ data: atual, error } = await buscar())
    if (error || !atual) return { erro: 'Não foi possível incluir o participante.', status: 500 }
  }
  const atualCompra = PAPEIS_COMPRA.includes(atual.papel as string)
  if (atualCompra !== ladoCompra && atual.papel !== 'conjuge_vendedor') {
    return {
      erro: ladoCompra ? 'Essa pessoa já está como vendedora nesta proposta.' : 'Essa pessoa já participa da compra nesta proposta.',
      status: 422,
    }
  }
  const patch: Record<string, unknown> = {}
  if (!atual.explicita) patch.explicita = true
  if (atual.papel === 'conjuge_vendedor') patch.papel = ladoCompra ? 'coparticipante' : 'vendedor'
  if (papel === 'titular' && atual.papel !== 'titular') {
    // Um titular por proposta: o atual vira coparticipante (continua incluído de propósito).
    const { error: eDem } = await sb.from('participacoes').update({ papel: 'coparticipante', explicita: true })
      .eq(alvo.coluna, alvo.id).eq('papel', 'titular')
    if (eDem) return { erro: 'Não foi possível trocar o principal.', status: 500 }
    patch.papel = 'titular'
  }
  if (Object.keys(patch).length) {
    const { error: eUp } = await sb.from('participacoes').update(patch).eq('id', atual.id as string)
    if (eUp) return { erro: 'Não foi possível incluir o participante.', status: 500 }
  }
  return { ok: true, participacaoId: atual.id as string }
}

export async function sincronizarLead(sb: SupabaseClient, leadId: string): Promise<ResultadoEscrita> {
  const { error } = await sb.rpc('pv2_sincronizar_lead', { p_lead_id: leadId })
  if (error) return { erro: 'Erro ao atualizar os participantes do lead.', status: 500 }
  return { ok: true }
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
  const r = await marcarExplicita(sb, empresaId, { coluna: 'lead_id', id: leadId }, pessoaId, 'coparticipante')
  if ('erro' in r) return r
  return sincronizarLead(sb, leadId)
}

/** Remove um coparticipante do lead (a Pessoa e os documentos dela permanecem). */
export async function removerParticipanteLead(sb: SupabaseClient, empresaId: string, leadId: string, pessoaId: string): Promise<ResultadoEscrita> {
  const lead = await titularDoLead(sb, empresaId, leadId)
  if ('erro' in lead) return lead
  if (lead.pessoaId === pessoaId) return { erro: 'Essa pessoa não é coparticipante deste lead.', status: 404 }
  const { data, error } = await sb.from('participacoes').delete()
    .eq('lead_id', leadId).eq('pessoa_id', pessoaId).eq('empresa_id', empresaId).eq('explicita', true)
    .in('papel', PAPEIS_COMPRA).select('id')
  if (error) return { erro: 'Não foi possível remover o participante.', status: 500 }
  if (!data?.length) return { erro: 'Essa pessoa não é coparticipante deste lead.', status: 404 }
  return sincronizarLead(sb, leadId)
}

/** Inclui um vendedor no lead. Idempotente. */
export async function incluirVendedorLead(sb: SupabaseClient, empresaId: string, leadId: string, pessoaId: string): Promise<ResultadoEscrita> {
  const lead = await titularDoLead(sb, empresaId, leadId)
  if ('erro' in lead) return lead
  const op = await ehOperador(sb, pessoaId)
  if (typeof op !== 'boolean') return op
  if (op) return { erro: 'Pessoa de usuário da equipe não pode ser vendedora.', status: 422 }
  const r = await marcarExplicita(sb, empresaId, { coluna: 'lead_id', id: leadId }, pessoaId, 'vendedor')
  if ('erro' in r) return r
  return sincronizarLead(sb, leadId)
}

/** Remove um vendedor do lead pelo id da participação (o ponteiro antigo leads.vendedor_pessoa_id acompanha). */
export async function removerVendedorLead(sb: SupabaseClient, empresaId: string, leadId: string, vinculoId: string): Promise<ResultadoEscrita> {
  const { data, error } = await sb.from('participacoes').delete()
    .eq('id', vinculoId).eq('lead_id', leadId).eq('empresa_id', empresaId).eq('papel', 'vendedor').select('id, pessoa_id')
  if (error) return { erro: 'Não foi possível remover o vendedor.', status: 500 }
  if (!data?.length) return { erro: 'Vendedor não encontrado neste lead.', status: 404 }
  // Sem limpar o ponteiro, a sincronização devolveria o vendedor.
  const { error: eL } = await sb.from('leads').update({ vendedor_pessoa_id: null })
    .eq('id', leadId).eq('vendedor_pessoa_id', data[0].pessoa_id as string)
  if (eL) return { erro: 'Não foi possível remover o vendedor.', status: 500 }
  return sincronizarLead(sb, leadId)
}

/**
 * Troca o titular do lead ("Tornar principal"):
 *  1. congela o "compõe renda" atual de todos (compoe_renda_manual);
 *  2. o antigo titular e o cônjuge dele ficam incluídos de propósito (participacoes.explicita);
 *  3. leads.pessoa_id = novo; nome/CPF/nascimento acompanham; o cônjuge do antigo é desligado do lead
 *     (conjuge_pessoa_id/nome/CPF/nascimento — NUNCA conjuge_renda_*); telefone/e-mail do lead não mudam;
 *  4. a sincronização promove o novo e rebaixa o antigo.
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

  // C2: o antigo titular segue incluído de propósito (vira coparticipante pela sincronização, já que não é
  // mais o leads.pessoa_id); o cônjuge dele (derivado) também passa a ser incluído de propósito.
  const marcados: string[] = []
  const desfazer = async () => {
    if (!marcados.length) return
    const { error } = await sb.from('participacoes').update({ explicita: false }).in('id', marcados)
    if (error) console.error('[trocarTitularLead] não desfez as marcas:', error.message)
  }
  const marcar = lista.filter(p => p.pessoa_id !== novoId && (p.pessoa_id === antigoId || p.papel === 'conjuge_anuente'))
  for (const p of marcar) {
    const { data: m, error } = await sb.from('participacoes').update({ explicita: true })
      .eq('id', p.id).eq('explicita', false).select('id')
    if (error) { await desfazer(); return { erro: 'Erro ao manter o antigo principal na proposta.', status: 500 } }
    if (m?.length) marcados.push(p.id)
  }

  // Ponteiro do lead = titular (trg_pv2_leads ressincroniza); cônjuge do antigo desligado do lead —
  // NUNCA conjuge_renda_*: fn_pv2_leads copiaria o nulo para a renda da Pessoa do cônjuge.
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
  const sync = await sincronizarLead(sb, leadId)
  if ('erro' in sync) return sync

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

export interface DadosNovoConjuge {
  nome: string
  cpf?: string | null
  data_nascimento?: string | null
  telefone?: string | null
  profissao?: string | null
  renda_formal?: number | null
  renda_informal?: number | null
}

/**
 * Cônjuge digitado num formulário (seção "Cônjuge" de quem ainda não tem cônjuge cadastrado): reaproveita
 * a Pessoa pelo CPF ou cria; preenche só campos VAZIOS dela (nunca sobrescreve um cadastro existente);
 * telefone só se ela não tiver nenhum e não for de usuário da equipe; registra o casamento nos dois lados.
 * Substitui a gravação dos campos soltos conjuge_* (que a sincronização da Fase A convertia).
 */
export async function casarComNovoConjuge(
  sb: SupabaseClient, empresaId: string, pessoaId: string, dados: DadosNovoConjuge,
  casamento: { estadoCivil: string; regime: string | null; data: string | null; confirmarEncerrar?: boolean },
): Promise<{ ok: true; conjugeId: string } | { confirmar: Array<{ id: string; nome: string }>; conjugeId: string } | { erro: string; status: number }> {
  const r = await pessoaPorCpfOuNova(sb, empresaId, dados.nome, dados.cpf)
  if ('erro' in r) return r
  const conjugeId = r.id
  if (conjugeId === pessoaId) return { erro: 'O cônjuge não pode ser a própria pessoa.', status: 422 }

  const { data: atual, error: eAt } = await sb.from('pessoas')
    .select('data_nascimento, profissao, renda_formal, renda_informal').eq('id', conjugeId).maybeSingle()
  if (eAt) return { erro: 'Erro ao carregar o cônjuge.', status: 500 }
  const preencher: Record<string, unknown> = {}
  const dataOk = dados.data_nascimento && /^\d{4}-\d{2}-\d{2}$/.test(dados.data_nascimento)
  if (dataOk && !atual?.data_nascimento) preencher.data_nascimento = dados.data_nascimento
  if (dados.profissao?.trim() && !atual?.profissao) preencher.profissao = dados.profissao.trim()
  if (dados.renda_formal != null && atual?.renda_formal == null) preencher.renda_formal = dados.renda_formal
  if (dados.renda_informal != null && atual?.renda_informal == null) preencher.renda_informal = dados.renda_informal
  if (Object.keys(preencher).length) {
    const { error } = await sb.from('pessoas').update(preencher).eq('id', conjugeId)
    if (error) return { erro: 'Erro ao gravar os dados do cônjuge.', status: 500 }
  }

  const tel = dados.telefone?.trim()
  if (tel) {
    const { data: tels } = await sb.from('pessoa_telefones').select('id').eq('pessoa_id', conjugeId).eq('ativo', true)
    const variantes = variantesTelefoneBR(tel)
    const [{ data: u1 }, { data: u2 }] = await Promise.all([
      sb.from('usuarios').select('id').eq('empresa_id', empresaId).eq('ativo', true).in('telefone_whatsapp', variantes),
      sb.from('usuarios').select('id').eq('empresa_id', empresaId).eq('ativo', true).in('telefone', variantes),
    ])
    const ehDaEquipe = (u1 ?? []).length > 0 || (u2 ?? []).length > 0
    if (!(tels ?? []).length && !ehDaEquipe) {
      const { error } = await sb.from('pessoa_telefones').insert({
        pessoa_id: conjugeId, empresa_id: empresaId, telefone: tel, principal: true, whatsapp: true, ativo: true,
      })
      if (error && error.code !== '23505') console.error('[casarComNovoConjuge] telefone não gravado:', error.message)
    }
  }

  const c = await registrarCasamento(sb, empresaId, pessoaId, conjugeId, casamento)
  if ('erro' in c) return c
  if ('confirmar' in c) return { confirmar: c.confirmar, conjugeId }
  return { ok: true, conjugeId }
}
