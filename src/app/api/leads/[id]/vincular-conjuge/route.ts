import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino } from '@/lib/documentos/vinculosServidor'
import { definirConjugeTitularLead, pessoaPorCpfOuNova } from '@/lib/participantes/escritaServidor'

// POST /api/leads/[id]/vincular-conjuge — cônjuge do titular (aba Crédito).
// Body: { criar_de_lead?: boolean } | { pessoa_id: string } | { desvincular: true }
// V2 (B2c): casamento pelo serviço único (registrarCasamento, dois lados); a criação a partir dos
// campos soltos do lead reaproveita pelo CPF e nunca usa Pessoa de operador.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const leadId = params.id
  const negado = await verificarDestino(ctx, 'lead', leadId)
  if (negado) return negado
  const empresaId = ctx.usuario.empresa_id
  const body = await request.json().catch(() => ({})) as { criar_de_lead?: boolean; pessoa_id?: string; desvincular?: boolean }

  let conjugeId: string | null
  if (body.desvincular) {
    conjugeId = null
  } else if (body.pessoa_id) {
    conjugeId = body.pessoa_id
  } else if (body.criar_de_lead) {
    const { data: lead, error } = await supabase.from('leads')
      .select('conjuge_nome, conjuge_cpf, conjuge_data_nascimento').eq('id', leadId).eq('empresa_id', empresaId).maybeSingle()
    if (error || !lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    const r = await pessoaPorCpfOuNova(supabase, empresaId, (lead.conjuge_nome as string | null) || 'Cônjuge', lead.conjuge_cpf as string | null)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    conjugeId = r.id
    if (lead.conjuge_data_nascimento) {
      await supabase.from('pessoas').update({ data_nascimento: lead.conjuge_data_nascimento })
        .eq('id', conjugeId).is('data_nascimento', null)
    }
  } else {
    return NextResponse.json({ error: 'Forneça criar_de_lead ou pessoa_id' }, { status: 400 })
  }

  const r = await definirConjugeTitularLead(supabase, empresaId, leadId, conjugeId)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  if ('confirmar' in r) {
    const nomes = r.confirmar.map(x => x.nome).join(' e ')
    return NextResponse.json({ error: `${nomes} já tem outro casamento registrado — ajuste pelo "Casado(a) com" na aba Pessoa.` }, { status: 409 })
  }
  return NextResponse.json({ ok: true, conjuge_pessoa_id: conjugeId })
}
