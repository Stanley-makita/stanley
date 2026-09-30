import { NextRequest, NextResponse } from 'next/server'
import { type Interessado } from '@/types/comunicacao'
import { motivoIndisponibilidade } from '@/lib/comunicacao/interessados'
import { supabaseAdmin as supabaseService } from '@/lib/supabase/admin'
import { PAPEIS_COMPRA } from '@/lib/participantes/tipos'
import { telefonePrincipalAtivo } from '@/lib/participantes/contato'

// Lista os destinatários possíveis de comunicação manual para um Processo (Negócio) —
// comprador(es), corretores, parceiros e imobiliárias/construtoras vinculados. Espelha
// GET /api/leads/[id]/interessados. Lista TODOS os vínculos reais, inclusive os sem
// telefone/inativos (apto=false + motivo) -- não esconde o vínculo.
//
// Diferença do Lead: pode haver mais de um comprador por Processo (V2: participações de compra —
// titular, coparticipante, cônjuge anuente — não 1:1 como leads). 'vendedora' (processo_imobiliarias.papel) fica de fora de propósito -- sem
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

  // V2: compradores = participações de compra (titular, coparticipante, cônjuge anuente);
  // nome e telefone sempre da Pessoa. interessado_id = id da participação.
  const { data: compradores, error: erroCompradores } = await supabaseService
    .from('participacoes')
    .select('id, papel, ordem, pessoa:pessoas!pessoa_id!inner(id, nome, deleted_at, pessoa_telefones(telefone, principal, ativo))')
    .eq('processo_id', processoId)
    .in('papel', [...PAPEIS_COMPRA])
    .is('pessoa.deleted_at', null)
  if (erroCompradores) return NextResponse.json({ error: 'Erro ao carregar os compradores.' }, { status: 500 })

  const ordenados = [...(compradores ?? [])].sort((a, b) =>
    (a.papel === 'titular' ? 0 : 1) - (b.papel === 'titular' ? 0 : 1) || a.ordem - b.ordem)
  for (const c of ordenados) {
    const pessoa = Array.isArray(c.pessoa) ? c.pessoa[0] : c.pessoa
    if (!pessoa) continue
    const telefone = telefonePrincipalAtivo(pessoa.pessoa_telefones)
    interessados.push({
      tipo_interessado: 'comprador',
      interessado_id: c.id,
      nome: pessoa.nome,
      apto: !!telefone,
      motivo_indisponibilidade: telefone ? null : 'Telefone não cadastrado',
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
