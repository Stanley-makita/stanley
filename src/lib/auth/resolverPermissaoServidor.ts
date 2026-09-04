import { supabaseAdmin } from '@/lib/supabase/admin'
import { podeExecutarPadrao } from '@/lib/auth/permissions'
import { ACOES_NAO_CONFIGURAVEIS } from '@/lib/auth/modulos'
import type { Acao, UsuarioPerfil } from '@/types/auth'

/**
 * Espelho server-side da mesma resolução em 3 camadas usada no client
 * (resolverPermissao, src/hooks/auth/permissaoResolver.ts) e no banco
 * (usuario_atual_pode(), migration 20260730_216): exceção individual
 * (usuario_permissoes) → perfil (perfil_permissoes) → padrão do sistema
 * (PERMISSOES_PADRAO).
 *
 * Usar só em rotas de API que usam supabaseAdmin (service-role, bypassa
 * RLS) e precisam checar uma Acao configurável que não tem enforcement
 * próprio em RLS/trigger — ex.: leads.criar, pessoas.merge/excluir,
 * biblioteca.publicar/excluir, usuarios.desativar. Ações com RLS/trigger
 * dedicados (leads.ver_todas, processos.*, rh.editar etc.) já são
 * protegidas pelo banco — não precisam desta checagem na rota.
 *
 * perfil === 'customizado': resolve o perfil_customizado_id do usuário e
 * consulta perfil_customizado_permissoes em vez de perfil_permissoes —
 * mesma regra de usuario_atual_pode() (migration 283) e de resolverPermissao
 * (client-side, src/hooks/auth/permissaoResolver.ts). Nunca cai em
 * podeExecutarPadrao, que para 'customizado' é sempre [] (sem "padrão do
 * sistema" pra perfil customizado). Ausência de perfil_customizado_id ou de
 * linha correspondente = false, sempre.
 */
export async function podeServidor(
  usuarioId: string,
  perfil: UsuarioPerfil,
  empresaId: string,
  acao: Acao,
): Promise<boolean> {
  if (perfil === 'admin') return true
  if (ACOES_NAO_CONFIGURAVEIS.has(acao)) return podeExecutarPadrao(perfil, acao)

  const { data: overrideUsuario } = await supabaseAdmin
    .from('usuario_permissoes')
    .select('permitido')
    .eq('usuario_id', usuarioId)
    .eq('acao', acao)
    .maybeSingle()
  if (overrideUsuario) return overrideUsuario.permitido

  if (perfil === 'customizado') {
    const { data: usuarioRow } = await supabaseAdmin
      .from('usuarios')
      .select('perfil_customizado_id')
      .eq('id', usuarioId)
      .maybeSingle()
    if (!usuarioRow?.perfil_customizado_id) return false

    const { data: overrideCustomizado } = await supabaseAdmin
      .from('perfil_customizado_permissoes')
      .select('permitido')
      .eq('perfil_customizado_id', usuarioRow.perfil_customizado_id)
      .eq('acao', acao)
      .maybeSingle()
    return overrideCustomizado?.permitido ?? false
  }

  const { data: overridePerfil } = await supabaseAdmin
    .from('perfil_permissoes')
    .select('permitido')
    .eq('empresa_id', empresaId)
    .eq('perfil', perfil)
    .eq('acao', acao)
    .maybeSingle()
  if (overridePerfil) return overridePerfil.permitido

  return podeExecutarPadrao(perfil, acao)
}
