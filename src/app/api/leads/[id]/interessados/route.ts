import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface Interessado {
  tipo_interessado: 'comprador' | 'corretor'
  interessado_id: string
  nome: string
  apto: boolean
  motivo_indisponibilidade: string | null
}

// Lista os destinatários possíveis de comunicação manual para um Lead — comprador (o próprio
// Lead) e corretores vinculados via lead_corretores. Alimenta o seletor de destinatário do
// modal "Comunicar partes". Lista TODOS os vínculos reais, inclusive os sem telefone/inativos
// (apto=false + motivo) -- não esconde o vínculo, só marca como indisponível para envio.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: usuario } = await supabaseService
    .from('usuarios')
    .select('id, empresa_id')
    .eq('id', user.id)
    .single()
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })

  const leadId = params.id

  const { data: lead } = await supabaseService
    .from('leads')
    .select('id, nome, telefone')
    .eq('id', leadId)
    .eq('empresa_id', usuario.empresa_id)
    .is('deleted_at', null)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const interessados: Interessado[] = [{
    tipo_interessado: 'comprador',
    interessado_id: lead.id,
    nome: lead.nome,
    apto: !!lead.telefone?.trim(),
    motivo_indisponibilidade: lead.telefone?.trim() ? null : 'Telefone não cadastrado',
  }]

  const { data: vinculos } = await supabaseService
    .from('lead_corretores')
    .select('corretor:corretores(id, nome, telefone, ativo)')
    .eq('lead_id', leadId)

  for (const vinculo of vinculos ?? []) {
    const corretor = Array.isArray(vinculo.corretor) ? vinculo.corretor[0] : vinculo.corretor
    if (!corretor) continue

    let motivo: string | null = null
    if (!corretor.ativo) motivo = 'Corretor inativo'
    else if (!corretor.telefone?.trim()) motivo = 'Telefone não cadastrado'

    interessados.push({
      tipo_interessado: 'corretor',
      interessado_id: corretor.id,
      nome: corretor.nome,
      apto: motivo === null,
      motivo_indisponibilidade: motivo,
    })
  }

  return NextResponse.json({ interessados })
}
