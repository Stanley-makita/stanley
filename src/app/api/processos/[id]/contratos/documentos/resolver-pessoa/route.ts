import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { incluirLinhaNegocio } from '@/lib/participantes/escritaNegocio'

/**
 * Resolve (ou cria) a Pessoa dona dos documentos de uma pasta fixa do
 * Construtor de Contratos (Comprador / Vendedor / Imóvel), pra permitir
 * anexar documentos livremente ANTES de o comprador/vendedor estar
 * formalmente cadastrado no processo — mesma filosofia de "IA propõe,
 * operador confirma depois" já usada em buscarOuCriarPessoa/
 * resolverPessoaConjuge (ver src/lib/pessoa.ts): cria um registro
 * provisório agora, o operador completa nome/CPF reais depois nas abas
 * Compradores/Vendedores.
 *
 * Imóvel, Terceiros Interessados e Certidões não têm Pessoa própria —
 * documentos deles ficam sob o comprador principal, mesma convenção do
 * resto do sistema.
 */

async function resolveUsuario(token: string): Promise<{ empresa_id: string } | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ? { empresa_id: usuario.empresa_id } : null
}

async function criarPessoaEParte(
  empresaId: string,
  processoId: string,
  papel: 'comprador' | 'vendedor',
): Promise<string> {
  const nomePlaceholder = papel === 'vendedor' ? 'Vendedor a definir' : 'Comprador a definir'

  const { data: pessoa, error: erroPessoa } = await supabase
    .from('pessoas')
    .insert({ empresa_id: empresaId, nome: nomePlaceholder })
    .select('id')
    .single()
  if (erroPessoa || !pessoa) throw new Error(erroPessoa?.message ?? 'Erro ao criar pessoa')

  // V2 (B2c-C1c): linha do negócio pelo serviço único
  const r = await incluirLinhaNegocio(supabase, empresaId, processoId, papel === 'vendedor' ? 'vendedores' : 'compradores', {
    pessoa_id: pessoa.id, nome: nomePlaceholder, ...(papel === 'comprador' ? { principal: true } : {}),
  })
  if ('erro' in r) throw new Error(r.erro)

  return pessoa.id as string
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const auth = await resolveUsuario(token)
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const processoId = params.id
  const { empresa_id } = auth

  const { data: processo } = await supabase
    .from('processos')
    .select('id')
    .eq('id', processoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()
  if (!processo) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const papelRecebido = body?.papel as 'comprador' | 'vendedor' | 'imovel' | 'terceiros' | 'certidoes' | undefined
  if (!papelRecebido || !['comprador', 'vendedor', 'imovel', 'terceiros', 'certidoes'].includes(papelRecebido)) {
    return NextResponse.json({ error: 'Papel inválido' }, { status: 400 })
  }
  // Imóvel, Terceiros e Certidões não têm Pessoa própria — documentos ficam sob o comprador principal.
  const papel: 'comprador' | 'vendedor' = papelRecebido === 'vendedor' ? 'vendedor' : 'comprador'

  try {
    // V2 (B2c): quem já participa do negócio vem de `participacoes` — titular primeiro (comprador) ou o
    // primeiro vendedor; nunca Pessoa excluída.
    const papeis = papel === 'vendedor' ? ['vendedor'] : ['titular', 'coparticipante', 'conjuge_anuente']
    const { data: parts, error: eParts } = await supabase
      .from('participacoes')
      .select('pessoa_id, papel, ordem, pessoa:pessoas!pessoa_id(deleted_at)')
      .eq('processo_id', processoId)
      .eq('empresa_id', empresa_id)
      .in('papel', papeis)
      .order('ordem', { ascending: true })
    if (eParts) throw new Error(eParts.message)
    const vivas = ((parts ?? []) as unknown as Array<{ pessoa_id: string; papel: string; pessoa: { deleted_at: string | null } | null }>)
      .filter(x => x.pessoa && !x.pessoa.deleted_at)
    const existente = vivas.find(x => x.papel === 'titular') ?? vivas[0]
    if (existente) return NextResponse.json({ pessoaId: existente.pessoa_id })

    const pessoaId = await criarPessoaEParte(empresa_id, processoId, papel)
    return NextResponse.json({ pessoaId })
  } catch (err) {
    console.error('[contratos/resolver-pessoa] erro ao resolver/criar pessoa:', err)
    const mensagem = err instanceof Error ? err.message : 'Erro ao preparar upload de documentos.'
    return NextResponse.json({ error: mensagem }, { status: 500 })
  }
}
