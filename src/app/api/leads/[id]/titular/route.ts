import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino } from '@/lib/documentos/vinculosServidor'
import { trocarTitularLead } from '@/lib/participantes/escritaServidor'

/** "Tornar principal" (Participantes V2) — regras e ordem em trocarTitularLead (serviço único de escrita). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { pessoa_id?: unknown }
  if (typeof body.pessoa_id !== 'string') return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const negado = await verificarDestino(ctx, 'lead', params.id)
  if (negado) return negado

  const r = await trocarTitularLead(supabase, ctx.usuario.empresa_id, params.id, body.pessoa_id)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  if (!r.alterado) return NextResponse.json({ ok: true, alterado: false })

  try {
    const texto = `${ctx.usuario.nome} tornou ${r.novoNome} o principal da proposta${r.antigoNome ? ` (antes: ${r.antigoNome}, que continua como participante)` : ''}.`
    const { error: eHist } = await supabase.from('lead_historico')
      .insert({ lead_id: params.id, empresa_id: ctx.usuario.empresa_id, usuario_id: ctx.usuario.id, tipo: 'acao_operacional', descricao: texto })
    if (eHist) console.error('[leads/titular] histórico não gravado:', eHist.message)
  } catch (err) {
    console.error('[leads/titular] histórico não gravado:', err)
  }
  return NextResponse.json({ ok: true, alterado: true })
}
