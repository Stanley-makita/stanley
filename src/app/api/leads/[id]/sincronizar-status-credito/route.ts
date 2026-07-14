import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario
}

type StatusAnalise = 'em_analise' | 'aprovado' | 'recusado' | 'pendente'

const LABELS: Record<StatusAnalise, string> = {
  em_analise: 'Em Análise',
  aprovado:   'Aprovado',
  recusado:   'Recusado',
  pendente:   'Pendente',
}

const CORES: Record<StatusAnalise, string> = {
  em_analise: '#d97706',
  aprovado:   '#16a34a',
  recusado:   '#dc2626',
  pendente:   '#6b7280',
}

// POST /api/leads/[id]/sincronizar-status-credito
// Body: { status: 'em_analise' | 'aprovado' | 'recusado' | 'pendente' }
//
// Espelha o status da análise de crédito marcada como "Banco Definido" no
// lead.status_id (fase_statuses) — evita ter que escolher o mesmo status em
// dois lugares (card Análises de Crédito e card Status da Fase). RLS de
// fase_statuses só permite insert/update/delete pra admin/gerente, então a
// criação automática da linha (quando ainda não existe pra essa fase)
// precisa passar por aqui (service role), não pelo client direto.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const leadId = params.id
  const body = await request.json().catch(() => ({})) as { status?: StatusAnalise }
  const status = body.status
  if (!status || !LABELS[status]) {
    return NextResponse.json({ error: 'status inválido' }, { status: 422 })
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, fase_id')
    .eq('id', leadId)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const nome = LABELS[status]

  let { data: statusRow } = await supabase
    .from('fase_statuses')
    .select('id')
    .eq('fase_id', lead.fase_id)
    .ilike('nome', nome)
    .maybeSingle()

  if (!statusRow) {
    const { data: novoStatus, error: erroInsert } = await supabase
      .from('fase_statuses')
      .insert({
        fase_id:    lead.fase_id,
        empresa_id: usuario.empresa_id,
        nome,
        cor:        CORES[status],
      })
      .select('id')
      .single()
    if (erroInsert || !novoStatus) {
      return NextResponse.json({ error: 'Erro ao criar status da fase' }, { status: 500 })
    }
    statusRow = novoStatus
  }

  const { error: erroUpdate } = await supabase
    .from('leads')
    .update({ status_id: statusRow.id })
    .eq('id', leadId)
  if (erroUpdate) {
    return NextResponse.json({ error: 'Erro ao atualizar status do lead' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status_id: statusRow.id })
}
