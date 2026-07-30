import { podeExecutarPadrao } from '@/lib/auth/permissions'
import { ACOES_NAO_CONFIGURAVEIS } from '@/lib/auth/modulos'
import { type Acao, type UsuarioPerfil } from '@/types/auth'

export interface OverrideRow {
  perfil: string
  acao: string
  permitido: boolean
}

export function construirMapaOverrides(rows: OverrideRow[]): Map<string, boolean> {
  const overrides = new Map<string, boolean>()
  for (const row of rows) {
    overrides.set(`${row.perfil}:${row.acao}`, row.permitido)
  }
  return overrides
}

export interface UsuarioOverrideRow {
  acao: string
  permitido: boolean
}

/**
 * Mapa de exceções individuais — já vem escopado a um usuário só (a query
 * que popula isso filtra por usuario_id), então a chave é só a ação, sem
 * prefixo de usuário.
 */
export function construirMapaOverridesUsuario(rows: UsuarioOverrideRow[]): Map<string, boolean> {
  const overrides = new Map<string, boolean>()
  for (const row of rows) {
    overrides.set(row.acao, row.permitido)
  }
  return overrides
}

/**
 * Resolução de permissões em 3 camadas — função pura, sem dependência de
 * React/Supabase, testável isoladamente:
 *   admin?                     → sempre true, nunca depende de nenhuma tabela
 *   dashboard.ver?              → sempre true, nunca depende de nenhuma tabela (mesma
 *                                 garantia do admin — evita que um override incorreto/
 *                                 manual bloqueie justamente a rota para onde o
 *                                 RouteGuard redireciona quando nega acesso, o que
 *                                 criaria um loop sem saída)
 *   ação não-configurável?      → sempre PERMISSOES_PADRAO, ignora qualquer override —
 *                                 essas ações têm regra fixa no servidor (RLS/API alinhadas
 *                                 em feat/alinhamento-permissoes-servidor); um override
 *                                 salvo antes de a ação virar fixa (ou por engano) nunca
 *                                 pode voltar a ter efeito na interface, senão a tela
 *                                 prometeria algo que o banco recusa
 *   1. exceção individual?      → usa o valor configurado (usuario_permissoes) — prevalece
 *                                 sobre o perfil, permite tanto ampliar quanto restringir
 *                                 uma pessoa específica sem mexer no perfil inteiro
 *   2. override de perfil?      → usa o valor configurado (perfil_permissoes)
 *   3. senão                    → usa PERMISSOES_PADRAO (matriz oficial em código)
 *
 * Tabela vazia, erro de rede ou ainda carregando: overrides chega como Map
 * vazio, então cai direto no fallback do código — nunca conclui "sem acesso"
 * por causa de um problema de infraestrutura.
 *
 * `overridesUsuario` é opcional — a maioria dos call sites hoje só resolve a
 * própria permissão do usuário logado (passa o mapa dele); a tela de admin
 * que edita a exceção de outra pessoa monta esse mapa à parte, sem depender
 * desta função.
 */
export function resolverPermissao(
  perfil: UsuarioPerfil,
  acao: Acao,
  overrides: Map<string, boolean>,
  overridesUsuario?: Map<string, boolean>,
): boolean {
  if (perfil === 'admin') return true
  if (acao === 'dashboard.ver') return true
  if (ACOES_NAO_CONFIGURAVEIS.has(acao)) return podeExecutarPadrao(perfil, acao)

  if (overridesUsuario?.has(acao)) return overridesUsuario.get(acao)!

  const chave = `${perfil}:${acao}`
  if (overrides.has(chave)) return overrides.get(chave)!

  return podeExecutarPadrao(perfil, acao)
}
