import { podeExecutarPadrao } from '@/lib/auth/permissions'
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

/**
 * Resolução de permissões com camada de override — função pura, sem dependência
 * de React/Supabase, testável isoladamente:
 *   admin?             → sempre true, nunca depende da tabela
 *   dashboard.ver?      → sempre true, nunca depende da tabela (mesma garantia do
 *                         admin — evita que um override incorreto/manual bloqueie
 *                         justamente a rota para onde o RouteGuard redireciona
 *                         quando nega acesso, o que criaria um loop sem saída)
 *   existe override?    → usa o valor configurado (perfil_permissoes)
 *   senão               → usa PERMISSOES_PADRAO (matriz oficial em código)
 *
 * Tabela vazia, erro de rede ou ainda carregando: overrides chega como Map
 * vazio, então cai direto no fallback do código — nunca conclui "sem acesso"
 * por causa de um problema de infraestrutura.
 */
export function resolverPermissao(
  perfil: UsuarioPerfil,
  acao: Acao,
  overrides: Map<string, boolean>,
): boolean {
  if (perfil === 'admin') return true
  if (acao === 'dashboard.ver') return true

  const chave = `${perfil}:${acao}`
  if (overrides.has(chave)) return overrides.get(chave)!

  return podeExecutarPadrao(perfil, acao)
}
