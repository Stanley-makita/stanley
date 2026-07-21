import { NextRequest, NextResponse } from 'next/server'
import { type Interessado } from '@/types/comunicacao'
import { motivoIndisponibilidade } from '@/lib/comunicacao/interessados'
import { supabaseAdmin as supabaseService } from '@/lib/supabase/admin'

// Lista os destinatários possíveis de comunicação manual para um Processo (Negócio) —
// comprador(es), corretores, parceiros e imobiliárias/construtoras vinculados. Espelha
// GET /api/leads/[id]/interessados. Lista TODOS os vínculos reais, inclusive os sem
// telefone/inativos (apto=false + motivo) -- não esconde o vínculo.
//
// Diferença do Lead: pode haver mais de um comprador por Processo (processo_compradores não é
// 1:1 como leads). 'vendedora' (processo_imobiliarias.papel) fica de fora de propósito -- sem
// equivalente no Lead. Vendedor não aparece aqui (mesma exclusão do Lead).
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

  const processoId = params.id

  const { data: processo } = await supabaseService
    .from('processos')
    .select('id')
    .eq('id', processoId)
    .eq('empresa_id', usuario.empresa_id)
    .single()
  if (!processo) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  const interessados: Interessado[] = []

  const { data: compradores } = await supabaseService
    .from('processo_compradores')
    .select('id, nome, telefone')
    .eq('processo_id', processoId)

  for (const comprador of compradores ?? []) {
    interessados.push({
      tipo_interessado: 'comprador',
      interessado_id: comprador.id,
      nome: comprador.nome,
      apto: !!comprador.telefone?.trim(),
      motivo_indisponibilidade: comprador.telefone?.trim() ? null : 'Telefone não cadastrado',
    })
  }

  const { data: corretorVinculos } = await supabaseService
    .from('processo_corretores')
    .select('corretor:corretores(id, nome, telefone, ativo)')
    .eq('processo_id', processoId)

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
    .from('processo_parceiros')
    .select('parceiro:parceiros(id, nome, telefone, ativo)')
    .eq('processo_id', processoId)

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
    .from('processo_imobiliarias')
    .select('papel, imobiliaria:imobiliarias(id, nome, telefone, ativo)')
    .eq('processo_id', processoId)
    .in('papel', ['imobiliaria', 'construtora'])

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
