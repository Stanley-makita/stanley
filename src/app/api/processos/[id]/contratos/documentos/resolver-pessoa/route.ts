import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

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
 * Imóvel não tem Pessoa própria — documentos dele ficam sob o comprador
 * principal, mesma convenção do resto do sistema.
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

  const tabela = papel === 'vendedor' ? 'processo_vendedores' : 'processo_compradores'
  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    processo_id: processoId,
    pessoa_id: pessoa.id,
    nome: nomePlaceholder,
  }
  if (papel === 'comprador') payload.principal = true

  const { error: erroParte } = await supabase.from(tabela).insert(payload)
  if (erroParte) throw new Error(erroParte.message)

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
  const papelRecebido = body?.papel as 'comprador' | 'vendedor' | 'imovel' | undefined
  if (!papelRecebido || !['comprador', 'vendedor', 'imovel'].includes(papelRecebido)) {
    return NextResponse.json({ error: 'Papel inválido' }, { status: 400 })
  }
  // Imóvel não tem Pessoa própria — documentos ficam sob o comprador principal.
  const papel: 'comprador' | 'vendedor' = papelRecebido === 'vendedor' ? 'vendedor' : 'comprador'

  try {
    if (papel === 'vendedor') {
      const { data: existente } = await supabase
        .from('processo_vendedores')
        .select('pessoa_id')
        .eq('processo_id', processoId)
        .eq('empresa_id', empresa_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (existente?.pessoa_id) return NextResponse.json({ pessoaId: existente.pessoa_id })
    } else {
      const { data: principal } = await supabase
        .from('processo_compradores')
        .select('pessoa_id')
        .eq('processo_id', processoId)
        .eq('empresa_id', empresa_id)
        .eq('principal', true)
        .maybeSingle()
      if (principal?.pessoa_id) return NextResponse.json({ pessoaId: principal.pessoa_id })

      const { data: qualquer } = await supabase
        .from('processo_compradores')
        .select('pessoa_id')
        .eq('processo_id', processoId)
        .eq('empresa_id', empresa_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (qualquer?.pessoa_id) return NextResponse.json({ pessoaId: qualquer.pessoa_id })
    }

    const pessoaId = await criarPessoaEParte(empresa_id, processoId, papel)
    return NextResponse.json({ pessoaId })
  } catch (err) {
    console.error('[contratos/resolver-pessoa] erro ao resolver/criar pessoa:', err)
    const mensagem = err instanceof Error ? err.message : 'Erro ao preparar upload de documentos.'
    return NextResponse.json({ error: mensagem }, { status: 500 })
  }
}
