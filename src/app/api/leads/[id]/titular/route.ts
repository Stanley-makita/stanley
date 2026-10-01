import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino } from '@/lib/documentos/vinculosServidor'
import { PAPEIS_COMPRA, type PapelParticipacao } from '@/lib/participantes/tipos'

/**
 * "Tornar principal" (Participantes V2): troca o titular do lead por outro participante de compra,
 * gravando pelo modelo antigo (sincronização da Fase A ligada). Ordem pensada para a sincronização:
 *  1. congela o "compõe renda" atual de todos (compoe_renda_manual) — a troca não muda isso sozinha;
 *  2. o antigo titular e o cônjuge dele entram em lead_coparticipantes (senão sairiam da proposta);
 *  3. leads.pessoa_id = novo; nome/CPF/nascimento acompanham; o cônjuge do antigo é desligado do lead
 *     (conjuge_pessoa_id/nome/CPF/nascimento — NUNCA conjuge_renda_*: o trigger fn_pv2_leads copiaria o
 *     nulo para a renda da Pessoa do cônjuge); telefone/e-mail de contato do lead não mudam;
 *  4. o novo titular sai de lead_coparticipantes.
 * Novo titular que já é titular de outro lead aberto (índice leads_pessoa_aberto_unico) → 409 e o passo 2
 * é desfeito.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { pessoa_id?: unknown }
  if (typeof body.pessoa_id !== 'string') return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const leadId = params.id
  const novoId = body.pessoa_id
  const empresaId = ctx.usuario.empresa_id

  const negado = await verificarDestino(ctx, 'lead', leadId)
  if (negado) return negado

  const { data: lead, error: eLead } = await supabase.from('leads').select('id, pessoa_id')
    .eq('id', leadId).eq('empresa_id', empresaId).is('deleted_at', null).maybeSingle()
  if (eLead) return erro500('lead', eLead.message)
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 })
  if (lead.pessoa_id === novoId) return NextResponse.json({ ok: true, alterado: false })

  const { data: parts, error: eParts } = await supabase.from('participacoes')
    .select('id, pessoa_id, papel, compoe_renda, compoe_renda_manual').eq('lead_id', leadId).eq('empresa_id', empresaId)
  if (eParts) return erro500('participantes', eParts.message)
  const lista = (parts ?? []) as Array<{ id: string; pessoa_id: string; papel: PapelParticipacao; compoe_renda: boolean; compoe_renda_manual: boolean | null }>
  if (!lista.some(p => p.pessoa_id === novoId && PAPEIS_COMPRA.includes(p.papel) && p.papel !== 'titular')) {
    return NextResponse.json({ error: 'Essa pessoa não participa da compra nesta proposta.' }, { status: 422 })
  }

  const { data: novo, error: eNovo } = await supabase.from('pessoas').select('id, nome, cpf, data_nascimento')
    .eq('id', novoId).is('deleted_at', null).maybeSingle()
  if (eNovo) return erro500('pessoa', eNovo.message)
  if (!novo) return NextResponse.json({ error: 'Pessoa não encontrada.' }, { status: 404 })

  // 1. congela o compõe renda atual
  for (const p of lista.filter(x => x.compoe_renda_manual === null || x.compoe_renda_manual === undefined)) {
    const { error } = await supabase.from('participacoes').update({ compoe_renda_manual: p.compoe_renda }).eq('id', p.id)
    if (error) return erro500('congelar compõe renda', error.message)
  }

  // 2. antigo titular + cônjuge dele continuam na proposta
  const { data: copartAtuais, error: eCop } = await supabase.from('lead_coparticipantes').select('pessoa_id').eq('lead_id', leadId)
  if (eCop) return erro500('coparticipantes', eCop.message)
  const jaCopart = new Set(((copartAtuais ?? []) as Array<{ pessoa_id: string }>).map(c => c.pessoa_id))
  const manter = [
    ...(lead.pessoa_id ? [lead.pessoa_id as string] : []),
    ...lista.filter(p => p.papel === 'conjuge_anuente').map(p => p.pessoa_id),
  ].filter(id => id !== novoId && !jaCopart.has(id))
  const inseridos: string[] = []
  for (const pessoaId of manter) {
    const { error } = await supabase.from('lead_coparticipantes').insert({ empresa_id: empresaId, lead_id: leadId, pessoa_id: pessoaId })
    if (error && error.code !== '23505') { await desfazer(leadId, inseridos); return erro500('incluir antigo titular', error.message) }
    if (!error) inseridos.push(pessoaId)
  }

  // 3. troca o titular do lead
  const { data: trocado, error: eTroca } = await supabase.from('leads')
    .update({
      pessoa_id: novoId, nome: novo.nome, cpf: novo.cpf ?? null, data_nascimento: novo.data_nascimento ?? null,
      conjuge_pessoa_id: null, conjuge_nome: null, conjuge_cpf: null, conjuge_data_nascimento: null,
    })
    .eq('id', leadId).eq('empresa_id', empresaId).select('id')
  if (eTroca || !trocado?.length) {
    await desfazer(leadId, inseridos)
    if (eTroca?.code === '23505') {
      return NextResponse.json({ error: `${novo.nome} já é o principal de outro lead aberto — conclua ou junte os leads antes.` }, { status: 409 })
    }
    return erro500('trocar titular', eTroca?.message ?? 'nenhuma linha')
  }

  // 4. novo titular sai da lista de coparticipantes
  const { error: eDel } = await supabase.from('lead_coparticipantes').delete().eq('lead_id', leadId).eq('pessoa_id', novoId)
  if (eDel) console.error('[leads/titular] coparticipante não removido:', eDel.message)

  try {
    const { data: antigo } = lead.pessoa_id
      ? await supabase.from('pessoas').select('nome').eq('id', lead.pessoa_id).maybeSingle()
      : { data: null }
    const texto = `${ctx.usuario.nome} tornou ${novo.nome} o principal da proposta${antigo?.nome ? ` (antes: ${antigo.nome}, que continua como participante)` : ''}.`
    const { error: eHist } = await supabase.from('lead_historico')
      .insert({ lead_id: leadId, empresa_id: empresaId, usuario_id: ctx.usuario.id, tipo: 'acao_operacional', descricao: texto })
    if (eHist) console.error('[leads/titular] histórico não gravado:', eHist.message)
  } catch (err) {
    console.error('[leads/titular] histórico não gravado:', err)
  }
  return NextResponse.json({ ok: true, alterado: true })
}

async function desfazer(leadId: string, pessoaIds: string[]) {
  if (!pessoaIds.length) return
  const { error } = await supabase.from('lead_coparticipantes').delete().eq('lead_id', leadId).in('pessoa_id', pessoaIds)
  if (error) console.error('[leads/titular] não desfez coparticipantes:', error.message)
}

function erro500(etapa: string, msg: string) {
  console.error(`[leads/titular] erro em ${etapa}:`, msg)
  return NextResponse.json({ error: 'Não foi possível trocar o principal. Tente de novo.' }, { status: 500 })
}
