import { createClient } from '@supabase/supabase-js'

// Client centralizado com a service_role key — usado por rotas/código server-side
// que precisa ignorar RLS (webhooks, jobs, rotas admin). Nunca importar de código
// que roda no navegador.
//
// Valida o formato da chave na primeira vez que o módulo é carregado (cada cold
// start). O Supabase tem dois formatos válidos de service_role key em uso hoje:
//   - legado: JWT, começa com "eyJ", 100+ caracteres;
//   - novo: "secret key" curta, começa com "sb_secret_" (o projeto deste
//     repositório usa esse formato — confirmado, não é uma chave errada).
// Sem essa checagem, uma chave genuinamente errada (vazia, truncada, ou de
// outro tipo) só apareceria disfarçada como "Invalid API key" dentro de
// alguma consulta, muito depois do deploy problemático.
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const chaveValida =
  (chave.startsWith('eyJ') && chave.length >= 100) ||
  (chave.startsWith('sb_secret_') && chave.length >= 20)
if (!chaveValida) {
  console.error(
    '[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY não parece válida (tamanho:',
    chave.length, '). Consultas ao Supabase vão falhar com "Invalid API key". Verifique a variável na Vercel.'
  )
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
