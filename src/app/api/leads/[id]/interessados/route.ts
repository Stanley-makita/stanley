import { NextRequest, NextResponse } from 'next/server'
import { type Interessado } from '@/types/comunicacao'
import { motivoIndisponibilidade } from '@/lib/comunicacao/interessados'
import { supabaseAdmin as supabaseService } from '@/lib/supabase/admin'

// Lista os destinatários possíveis de comunicação manual para um Lead — comprador (o próprio
// Lead), corretores, parceiros e imobiliárias/construtoras vinculados. Alimenta o seletor de
// destinatário do modal "Comunicar partes". Lista TODOS os vínculos reais, inclusive os sem
// telefone/inativos (apto=false + motivo) -- não esconde o vínculo, só marca como indisponível
// para envio.
//
// Vendedor não aparece aqui de propósito — sem identidade estável, ver migration 20260719_172.
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

  const { data: corretorVinculos } = await supabaseService
    .from('lead_corretores')
    .select('corretor:corretores(id, nome, telefone, ativo)')
    .eq('lead_id', leadId)

  for (const vinculo of corretorVinculos ?? []) {
    const corretor = Array.isArray(vinculo.corretor) ? vinculo.corretor[0] : vinculo.corretor
    if (!corretor) continue
    interessados.push({
      tipo_interessado: 'corretor',
      interessado_id: corretor.id,
      nome: corretor.nome,
      apto: motivoIndisponibilidade(corretor, 'Corretor inativo') === null,
      motivo_indisponibilidade: motivoIndisponibilidade(corretor, 'Corretor inativo'),
    })
  }

  const { data: parceiroVinculos } = await supabaseService
    .from('lead_parceiros')
    .select('parceiro:parceiros(id, nome, telefone, ativo)')
    .eq('lead_id', leadId)

  for (const vinculo of parceiroVinculos ?? []) {
    const parceiro = Array.isArray(vinculo.parceiro) ? vinculo.parceiro[0] : vinculo.parceiro
    if (!parceiro) continue
    interessados.push({
      tipo_interessado: 'parceiro',
      interessado_id: parceiro.id,
      nome: parceiro.nome,
      apto: motivoIndisponibilidade(parceiro, 'Parceiro inativo') === null,
      motivo_indisponibilidade: motivoIndisponibilidade(parceiro, 'Parceiro inativo'),
    })
  }

  const { data: imobiliariaVinculos } = await supabaseService
    .from('lead_imobiliarias')
    .select('papel, imobiliaria:imobiliarias(id, nome, telefone, ativo)')
    .eq('lead_id', leadId)

  for (const vinculo of imobiliariaVinculos ?? []) {
    const imobiliaria = Array.isArray(vinculo.imobiliaria) ? vinculo.imobiliaria[0] : vinculo.imobiliaria
    if (!imobiliaria) continue
    const tipo = vinculo.papel as 'imobiliaria' | 'construtora'
    const labelInativo = tipo === 'imobiliaria' ? 'Imobiliária inativa' : 'Construtora inativa'
    interessados.push({
      tipo_interessado: tipo,
      interessado_id: imobiliaria.id,
      nome: imobiliaria.nome,
      apto: motivoIndisponibilidade(imobiliaria, labelInativo) === null,
      motivo_indisponibilidade: motivoIndisponibilidade(imobiliaria, labelInativo),
    })
  }

  return NextResponse.json({ interessados })
}
