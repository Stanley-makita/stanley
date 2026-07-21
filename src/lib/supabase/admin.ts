import { createClient } from '@supabase/supabase-js'

// Client centralizado com a service_role key — usado por rotas/código server-side
// que precisa ignorar RLS (webhooks, jobs, rotas admin). Nunca importar de código
// que roda no navegador.
//
// Valida o formato da chave na primeira vez que o módulo é carregado (cada cold
// start): um JWT de service_role sempre começa com "eyJ" e tem 100+ caracteres.
// Sem essa checagem, uma chave errada (ex: a "secret key" curta do novo formato
// do Supabase, colada por engano no lugar do JWT) só aparece disfarçada como
// "Invalid API key" dentro de alguma consulta, muito depois do deploy problemático.
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!chave.startsWith('eyJ') || chave.length < 100) {
  console.error(
    '[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY não parece um JWT válido (tamanho:',
    chave.length, '). Consultas ao Supabase vão falhar com "Invalid API key". Verifique a variável na Vercel.'
  )
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
