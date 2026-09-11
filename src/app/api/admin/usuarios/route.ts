import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

type VinculoRh =
  | { modo: 'existente'; funcionario_id: string }
  | { modo: 'novo'; funcionario: { tipo_contrato?: string; data_admissao: string; regra_comissao_id?: string | null } }

// Valida o vinculo_rh recebido e, quando modo==='novo', já cria o
// rh_funcionarios ANTES de qualquer coisa no Auth — se falhar aqui, nada
// mais foi criado, sem órfão pra limpar. Retorna o funcionario_id final
// (existente ou recém-criado) pra ser gravado em usuarios.funcionario_id.
async function resolverVinculoRh(
  vinculoRh: VinculoRh | undefined,
  empresaId: string,
  nome: string,
  email: string,
  cargoId: string | null,
): Promise<{ funcionarioId: string | null; funcionarioCriadoId: string | null; erro?: { status: number; error: string } }> {
  if (!vinculoRh) return { funcionarioId: null, funcionarioCriadoId: null }

  if (vinculoRh.modo === 'existente') {
    const { data: func } = await supabase
      .from('rh_funcionarios')
      .select('id')
      .eq('id', vinculoRh.funcionario_id)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    if (!func) {
      return { funcionarioId: null, funcionarioCriadoId: null, erro: { status: 400, error: 'Funcionário inválido' } }
    }
    const { data: jaVinculado } = await supabase
      .from('usuarios')
      .select('id')
      .eq('funcionario_id', vinculoRh.funcionario_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (jaVinculado) {
      return { funcionarioId: null, funcionarioCriadoId: null, erro: { status: 409, error: 'Este funcionário já está vinculado a outro usuário' } }
    }
    return { funcionarioId: vinculoRh.funcionario_id, funcionarioCriadoId: null }
  }

  // modo === 'novo'
  if (!vinculoRh.funcionario.data_admissao) {
    return { funcionarioId: null, funcionarioCriadoId: null, erro: { status: 400, error: 'Informe a data de admissão do funcionário' } }
  }
  // Tenant isolation: cargo_id e regra_comissao_id precisam pertencer à
  // mesma empresa — supabaseAdmin bypassa RLS aqui, então sem essa checagem
  // um request malicioso/com bug conseguiria vincular o novo funcionário à
  // regra de comissão (ou cargo) de outra empresa.
  if (cargoId) {
    const { data: cargo } = await supabase.from('rh_cargos').select('id').eq('id', cargoId).eq('empresa_id', empresaId).maybeSingle()
    if (!cargo) return { funcionarioId: null, funcionarioCriadoId: null, erro: { status: 400, error: 'Cargo inválido' } }
  }
  if (vinculoRh.funcionario.regra_comissao_id) {
    const { data: regra } = await supabase.from('rh_regras_comissao').select('id').eq('id', vinculoRh.funcionario.regra_comissao_id).eq('empresa_id', empresaId).maybeSingle()
    if (!regra) return { funcionarioId: null, funcionarioCriadoId: null, erro: { status: 400, error: 'Regra de comissão inválida' } }
  }
  const { data: novoFuncionario, error: erroFuncionario } = await supabase
    .from('rh_funcionarios')
    .insert({
      empresa_id: empresaId,
      nome,
      email,
      cargo_id: cargoId,
      tipo_contrato: vinculoRh.funcionario.tipo_contrato ?? 'clt',
      data_admissao: vinculoRh.funcionario.data_admissao,
      regra_comissao_id: vinculoRh.funcionario.regra_comissao_id ?? null,
      status: 'ativo',
    })
    .select('id')
    .single()
  if (erroFuncionario || !novoFuncionario) {
    return { funcionarioId: null, funcionarioCriadoId: null, erro: { status: 500, error: erroFuncionario?.message ?? 'Erro ao criar funcionário' } }
  }
  return { funcionarioId: novoFuncionario.id, funcionarioCriadoId: novoFuncionario.id }
}

async function resolveAdmin(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id, perfil')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario || usuario.perfil !== 'admin') return null
  return usuario
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const admin = await resolveAdmin(token)
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const { nome, email, senha, perfil, tipo_usuario = 'interno', funcao, cargo_id, ativo = true, perfil_customizado_id } = body
  const vinculo_rh = body.vinculo_rh as VinculoRh | undefined

  if (!nome?.trim() || !email?.trim() || !senha?.trim() || !perfil) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  // Tenant isolation: perfil_customizado_id precisa pertencer à mesma
  // empresa do admin logado — sem isso, um request malicioso/com bug
  // conseguiria vincular o novo usuário ao perfil customizado de outra
  // empresa (a query abaixo usa supabaseAdmin, que bypassa RLS).
  if (perfil_customizado_id) {
    const { data: perfilAcesso } = await supabase
      .from('perfis_acesso')
      .select('id')
      .eq('id', perfil_customizado_id)
      .eq('empresa_id', admin.empresa_id)
      .maybeSingle()
    if (!perfilAcesso) {
      return NextResponse.json({ error: 'Perfil de acesso customizado inválido' }, { status: 400 })
    }
  }

  const emailNormalizado = email.trim().toLowerCase()

  // Verifica ANTES de criar no Auth se já existe registro na tabela usuarios
  // com esse e-mail (ativo ou excluído). Excluir um usuário só faz
  // soft-delete (deleted_at) — a conta no Auth nunca é removida — então,
  // sem essa checagem, tentar recriar alguém que já foi excluído sempre
  // falhava com "e-mail já em uso" (o createUser abaixo rejeitava),
  // mesmo a pessoa não aparecendo em lugar nenhum da lista de usuários.
  const { data: existente } = await supabase
    .from('usuarios')
    .select('id, auth_user_id, deleted_at, funcionario_id')
    .eq('empresa_id', admin.empresa_id)
    .eq('email', emailNormalizado)
    .maybeSingle()

  if (existente && !existente.deleted_at) {
    return NextResponse.json({ error: 'Já existe um usuário ativo com esse e-mail' }, { status: 409 })
  }

  if (existente && existente.deleted_at) {
    // Reativa a linha excluída em vez de criar do zero — preserva o mesmo
    // id/auth_user_id, então qualquer vínculo histórico (processos,
    // comissões etc.) continua íntegro. Também reseta a senha no Auth,
    // já que o admin está efetivamente recriando o acesso dessa pessoa.
    const vinculo = await resolverVinculoRh(vinculo_rh, admin.empresa_id, nome.trim(), emailNormalizado, cargo_id ?? null)
    if (vinculo.erro) return NextResponse.json({ error: vinculo.erro.error }, { status: vinculo.erro.status })

    if (existente.auth_user_id) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(existente.auth_user_id, {
        password: senha,
        email_confirm: true,
      })
      if (authUpdateError) {
        if (vinculo.funcionarioCriadoId) await supabase.from('rh_funcionarios').delete().eq('id', vinculo.funcionarioCriadoId)
        return NextResponse.json({ error: authUpdateError.message }, { status: 400 })
      }
    }
    const { data, error } = await supabase
      .from('usuarios')
      .update({
        auth_user_id: existente.auth_user_id,
        nome: nome.trim(),
        perfil,
        tipo_usuario,
        funcao: funcao ?? null,
        cargo_id: cargo_id ?? null,
        // Se vinculo_rh não veio no request, preserva o funcionario_id que
        // o usuário já tinha antes do soft-delete — não é possível
        // reativar sem tocar no vínculo e acabar apagando ele sem querer.
        funcionario_id: vinculo_rh !== undefined ? vinculo.funcionarioId : existente.funcionario_id,
        ativo,
        deleted_at: null,
        motivo_exclusao: null,
        perfil_customizado_id: perfil_customizado_id ?? null,
      })
      .eq('id', existente.id)
      .select()
      .single()
    if (error) {
      if (vinculo.funcionarioCriadoId) await supabase.from('rh_funcionarios').delete().eq('id', vinculo.funcionarioCriadoId)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 200 })
  }

  const vinculo = await resolverVinculoRh(vinculo_rh, admin.empresa_id, nome.trim(), emailNormalizado, cargo_id ?? null)
  if (vinculo.erro) return NextResponse.json({ error: vinculo.erro.error }, { status: vinculo.erro.status })

  // Cria no Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: emailNormalizado,
    password: senha,
    email_confirm: true,
  })
  if (authError) {
    if (vinculo.funcionarioCriadoId) await supabase.from('rh_funcionarios').delete().eq('id', vinculo.funcionarioCriadoId)
    if (authError.message.includes('already registered')) {
      return NextResponse.json({ error: 'Este e-mail já está em uso' }, { status: 409 })
    }
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Cria registro na tabela usuarios (id = auth_user_id, sem DEFAULT na coluna)
  const { data, error: insertError } = await supabase
    .from('usuarios')
    .insert({
      id: authData.user.id,
      empresa_id: admin.empresa_id,
      auth_user_id: authData.user.id,
      nome: nome.trim(),
      email: emailNormalizado,
      perfil,
      tipo_usuario,
      funcao: funcao ?? null,
      cargo_id: cargo_id ?? null,
      funcionario_id: vinculo.funcionarioId,
      ativo,
      perfil_customizado_id: perfil_customizado_id ?? null,
    })
    .select()
    .single()

  if (insertError) {
    // Limpa o auth user criado para não deixar órfão
    await supabase.auth.admin.deleteUser(authData.user.id)
    if (vinculo.funcionarioCriadoId) await supabase.from('rh_funcionarios').delete().eq('id', vinculo.funcionarioCriadoId)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
