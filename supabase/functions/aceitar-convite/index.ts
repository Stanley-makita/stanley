import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token, nome, senha } = await req.json()

    if (!token || !nome || !senha) {
      return new Response(
        JSON.stringify({ erro: 'Dados incompletos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cliente com service_role — bypassa RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Busca e valida o convite
    const { data: convite, error: erroConvite } = await supabaseAdmin
      .from('convites')
      .select('*')
      .eq('token', token)
      .is('aceito_em', null)
      .gt('expira_em', new Date().toISOString())
      .single()

    if (erroConvite || !convite) {
      return new Response(
        JSON.stringify({ erro: 'Convite inválido ou expirado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Cria o usuário no Supabase Auth
    const { data: authUser, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({
      email: convite.email,
      password: senha,
      email_confirm: true, // Confirma email automaticamente via convite
    })

    if (erroAuth || !authUser.user) {
      return new Response(
        JSON.stringify({ erro: 'Erro ao criar conta: ' + erroAuth?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Insere na tabela usuarios (bypassa RLS com service_role)
    const { error: erroUsuario } = await supabaseAdmin
      .from('usuarios')
      .insert({
        auth_user_id: authUser.user.id,
        empresa_id: convite.empresa_id,
        nome: nome,
        email: convite.email,
        perfil: convite.perfil,
        ativo: true,
      })

    if (erroUsuario) {
      // Rollback: remove o auth user se não conseguiu criar o perfil
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      return new Response(
        JSON.stringify({ erro: 'Erro ao configurar perfil: ' + erroUsuario.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Marca o convite como aceito
    await supabaseAdmin
      .from('convites')
      .update({ aceito_em: new Date().toISOString() })
      .eq('id', convite.id)

    return new Response(
      JSON.stringify({ sucesso: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ erro: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})