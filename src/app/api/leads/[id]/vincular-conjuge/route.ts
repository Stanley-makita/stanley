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

// POST /api/leads/[id]/vincular-conjuge
// Body: { criar_de_lead?: boolean } | { pessoa_id: string } | { desvincular: true }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const leadId = params.id
  const body = await request.json().catch(() => ({}))

  // Buscar o lead
  const { data: lead } = await supabase
    .from('leads')
    .select('id, pessoa_id, conjuge_nome, conjuge_cpf, conjuge_data_nascimento, conjuge_pessoa_id')
    .eq('id', leadId)
    .eq('empresa_id', usuario.empresa_id)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  // Desvincular
  if (body.desvincular) {
    const conjugeAnteriorId = lead.conjuge_pessoa_id
    await supabase.from('leads').update({ conjuge_pessoa_id: null }).eq('id', leadId)
    // Remover vínculo bidirecional do cônjuge anterior
    if (conjugeAnteriorId) {
      await supabase.from('pessoas').update({ conjuge_pessoa_id: null }).eq('id', conjugeAnteriorId)
    }
    // Remover do proponente também
    if (lead.pessoa_id) {
      await supabase.from('pessoas').update({ conjuge_pessoa_id: null }).eq('id', lead.pessoa_id)
    }
    return NextResponse.json({ ok: true })
  }

  let conjugePessoaId: string

  if (body.criar_de_lead) {
    // Verificar se já existe pessoa com o CPF do cônjuge
    if (lead.conjuge_cpf) {
      const { data: existente } = await supabase
        .from('pessoas')
        .select('id')
        .eq('empresa_id', usuario.empresa_id)
        .eq('cpf', lead.conjuge_cpf)
        .is('deleted_at', null)
        .maybeSingle()

      if (existente) {
        conjugePessoaId = existente.id
      } else {
        // Criar nova pessoa com os dados do cônjuge
        const { data: novaPessoa, error: errPessoa } = await supabase
          .from('pessoas')
          .insert({
            empresa_id:      usuario.empresa_id,
            nome:            lead.conjuge_nome ?? 'Cônjuge',
            cpf:             lead.conjuge_cpf ?? null,
            data_nascimento: lead.conjuge_data_nascimento ?? null,
            tipo:            'cliente',
          })
          .select('id')
          .single()

        if (errPessoa || !novaPessoa) {
          return NextResponse.json({ error: 'Erro ao criar pessoa do cônjuge' }, { status: 500 })
        }
        conjugePessoaId = novaPessoa.id
      }
    } else {
      // Sem CPF — criar mesmo assim
      const { data: novaPessoa, error: errPessoa } = await supabase
        .from('pessoas')
        .insert({
          empresa_id:      usuario.empresa_id,
          nome:            lead.conjuge_nome ?? 'Cônjuge',
          cpf:             null,
          data_nascimento: lead.conjuge_data_nascimento ?? null,
          tipo:            'cliente',
        })
        .select('id')
        .single()

      if (errPessoa || !novaPessoa) {
        return NextResponse.json({ error: 'Erro ao criar pessoa do cônjuge' }, { status: 500 })
      }
      conjugePessoaId = novaPessoa.id
    }
  } else if (body.pessoa_id) {
    conjugePessoaId = body.pessoa_id
  } else {
    return NextResponse.json({ error: 'Forneça criar_de_lead ou pessoa_id' }, { status: 400 })
  }

  // Salvar vínculo no lead
  await supabase.from('leads').update({ conjuge_pessoa_id: conjugePessoaId }).eq('id', leadId)

  // Vínculo bidirecional entre pessoas
  if (lead.pessoa_id) {
    await supabase.from('pessoas')
      .update({ conjuge_pessoa_id: conjugePessoaId })
      .eq('id', lead.pessoa_id)
  }
  await supabase.from('pessoas')
    .update({ conjuge_pessoa_id: lead.pessoa_id ?? null })
    .eq('id', conjugePessoaId)

  return NextResponse.json({ ok: true, conjuge_pessoa_id: conjugePessoaId })
}
