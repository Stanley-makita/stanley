import { type Acao, type UsuarioPerfil } from '@/types/auth'

const TODAS_ACOES: Acao[] = [
  'leads.ver', 'leads.criar', 'leads.editar', 'leads.excluir',
  'processos.ver', 'processos.criar', 'processos.editar',
  'financeiro.ver', 'financeiro.editar',
  'rh.ver', 'rh.editar',
  'configuracoes.ver', 'configuracoes.editar',
  'usuarios.convidar', 'usuarios.desativar',
  'conversas.ver', 'conversas.ver_todas', 'conversas.transferir',
  'instancias.gerenciar',
  'pessoas.ver', 'pessoas.editar', 'pessoas.merge', 'pessoas.excluir',
  'biblioteca.ver', 'biblioteca.publicar', 'biblioteca.excluir',
  'dashboard.ver', 'imoveis.ver', 'operacional.ver',
  'simuladores.ver', 'relatorios.ver', 'notificacoes.ver',
  'agenda.ver', 'gestao.ver',
]

/**
 * Matriz oficial de permissões por perfil — usada como fallback sempre que
 * não houver override configurado em perfil_permissoes (tabela vazia = este
 * comportamento). Não é "o que já era visível hoje por falta de controle" —
 * é a matriz alvo definida para o sistema de Perfis de Acesso.
 */
export const PERMISSOES_PADRAO: Record<UsuarioPerfil, Acao[]> = {
  admin: TODAS_ACOES, // garantido também em código (ver usePerfilPermissoes), nunca só por esta lista

  gestor: TODAS_ACOES.filter(
    (a) => !(['rh.editar', 'usuarios.desativar', 'instancias.gerenciar'] as Acao[]).includes(a)
  ),

  comercial: [
    'dashboard.ver',
    'leads.ver', 'leads.criar', 'leads.editar',
    'pessoas.ver',
    'imoveis.ver',
    'processos.ver', 'processos.criar', 'processos.editar', // "Negócios"
    'conversas.ver',
    'operacional.ver', // "Solicitações"
    'simuladores.ver',
    'agenda.ver',
    'notificacoes.ver',
  ],

  operacional: [
    'dashboard.ver',
    'pessoas.ver',
    'imoveis.ver',
    'processos.ver', 'processos.editar', // sem processos.criar — não existe hoje pra este perfil
    'conversas.ver',
    'operacional.ver',
    'simuladores.ver',
    'agenda.ver',
    'notificacoes.ver',
  ], // sem leads.* — sem Captação

  juridico: [
    'dashboard.ver',
    'pessoas.ver',
    'processos.ver', 'processos.editar',
    'conversas.ver',
    'notificacoes.ver',
  ],

  apoio: [
    'dashboard.ver',
    'notificacoes.ver',
  ],

  // Perfis legados — fora do formulário de cadastro hoje (PERFIS_ATIVOS não os inclui).
  // Mantidos como estavam, sem redesenho: não fazem parte do escopo da matriz oficial.
  gerente: TODAS_ACOES.filter(
    (a) => !(['rh.editar', 'usuarios.desativar', 'instancias.gerenciar'] as Acao[]).includes(a)
  ),
  analista: [
    'dashboard.ver', 'notificacoes.ver',
    'leads.ver', 'leads.criar', 'leads.editar',
    'processos.ver', 'processos.criar', 'processos.editar',
    'configuracoes.ver',
    'conversas.transferir',
    'pessoas.ver', 'pessoas.editar',
  ],
  consultor: ['dashboard.ver', 'notificacoes.ver', 'leads.ver', 'processos.ver', 'pessoas.ver'],
  cliente: [],
}

/**
 * Checa a matriz oficial (fallback) — não considera overrides configurados em
 * perfil_permissoes nem o caso especial de admin fora dela (aqui admin já é
 * true via TODAS_ACOES). Usado tanto pelo hook client-side (usePerfilPermissoes,
 * como fallback quando não há override) quanto por rotas de API server-side que
 * não têm acesso à tabela de overrides — nestas, o comportamento continua
 * idêntico ao de antes desta entrega (dívida técnica documentada em
 * docs/permissoes.md: a config de Perfis de Acesso ainda não alcança essas rotas).
 */
export function podeExecutarPadrao(perfil: UsuarioPerfil, acao: Acao): boolean {
  return PERMISSOES_PADRAO[perfil]?.includes(acao) ?? false
}

/** @deprecated Nome antigo — mantido para não alterar as rotas de API que já o importam. */
export const podeExecutar = podeExecutarPadrao
