import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { buscarOuCriarPessoa } from '@/lib/pessoa'
import { obterOrdemTopo } from '@/lib/leads/ordem'
import { type Lead } from '@/types/leads'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  // Autentica o usuário pela sessão (cookie)
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Carrega empresa_id do usuário
  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('empresa_id')
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .eq('ativo', true)
    .single()

  if (!usuario) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 })
  }

  const body = await request.json() as {
    nome: string
    telefone: string
    email?: string
    cpf?: string
    fase_id: string
    responsavel_id?: string
    origem: Lead['origem']
    valor_pretendido?: number
    observacoes?: string
  }

  const { nome, telefone, fase_id, origem } = body
  if (!nome || !telefone || !fase_id || !origem) {
    return NextResponse.json({ error: 'nome, telefone, fase_id e origem são obrigatórios' }, { status: 422 })
  }

  const empresa_id = usuario.empresa_id

  // Busca ou cria Pessoa (deduplicação por CPF e telefone)
  let pessoa_id: string | null = null
  try {
    pessoa_id = await buscarOuCriarPessoa(empresa_id, telefone.trim(), nome.trim(), body.cpf?.trim())
  } catch (err) {
    console.error('[POST /api/leads] erro ao buscar/criar pessoa:', err)
  }

  // Posiciona o novo lead no topo da fase (menor ordem_kanban que todos os existentes)
  const ordemTopo = await obterOrdemTopo(supabaseAdmin, empresa_id, fase_id)

  // Insere o lead já com pessoa_id vinculado
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .insert({
      empresa_id,
      nome:             nome.trim(),
      telefone:         telefone.trim(),
      email:            body.email?.trim()   || null,
      cpf:              body.cpf?.trim()     || null,
      fase_id,
      responsavel_id:   body.responsavel_id  || null,
      origem,
      valor_pretendido: body.valor_pretendido ?? null,
      observacoes:      body.observacoes     || null,
      ordem_kanban:     ordemTopo,
      pessoa_id,
    })
    .select(`
      *,
      responsavel:usuarios!responsavel_id(id, nome),
      fase:fases!fase_id(id, nome, cor)
    `)
    .single()

  if (leadError) {
    console.error('[POST /api/leads] erro ao criar lead:', leadError)
    return NextResponse.json({ error: leadError.message }, { status: 500 })
  }

  return NextResponse.json(lead, { status: 201 })
}
