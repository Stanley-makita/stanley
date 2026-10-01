import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino } from '@/lib/documentos/vinculosServidor'
import { incluirParticipanteLead, pessoaPorCpfOuNova, removerParticipanteLead } from '@/lib/participantes/escritaServidor'

// Participantes de compra do lead (aba Pessoa, "+ Participante" / "Remover da proposta").
// Toda escrita passa por escritaServidor (B2c): nenhum componente grava lead_coparticipantes direto.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { pessoa_id?: unknown; nome?: unknown; cpf?: unknown }
  const temPessoa = typeof body.pessoa_id === 'string' && body.pessoa_id.length > 0
  const temNome = typeof body.nome === 'string' && body.nome.trim().length > 0
  if (!temPessoa && !temNome) return NextResponse.json({ error: 'Informe a pessoa.' }, { status: 400 })

  const negado = await verificarDestino(ctx, 'lead', params.id)
  if (negado) return negado
  const empresaId = ctx.usuario.empresa_id

  let pessoaId: string
  if (temPessoa) {
    pessoaId = body.pessoa_id as string
  } else {
    const r = await pessoaPorCpfOuNova(supabase, empresaId, body.nome as string, typeof body.cpf === 'string' ? body.cpf : null)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    pessoaId = r.id
  }
  const r = await incluirParticipanteLead(supabase, empresaId, params.id, pessoaId)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  return NextResponse.json({ ok: true, pessoa_id: pessoaId })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { pessoa_id?: unknown }
  if (typeof body.pessoa_id !== 'string') return NextResponse.json({ error: 'Informe a pessoa.' }, { status: 400 })
  const negado = await verificarDestino(ctx, 'lead', params.id)
  if (negado) return negado
  const r = await removerParticipanteLead(supabase, ctx.usuario.empresa_id, params.id, body.pessoa_id)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  return NextResponse.json({ ok: true })
}
