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
