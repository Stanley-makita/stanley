import { type Acao, type UsuarioPerfil } from '@/types/auth'

const TODAS_ACOES: Acao[] = [
  'leads.ver', 'leads.criar', 'leads.editar', 'leads.excluir',
  'leads.ver_todas', 'leads.redistribuir',
  'processos.ver', 'processos.criar', 'processos.editar', 'processos.retroceder_fase', 'processos.reabrir',
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
    'pessoas.ver', 'pessoas.editar', // confirmado: fluxo real diário (aba Pessoa do Lead, Compradores/Vendedores do Processo)
    'imoveis.ver',
    'processos.ver', 'processos.criar', 'processos.editar', // "Negócios"
    'conversas.ver', 'conversas.transferir', // confirmado: qualquer perfil pode transferir conversa
    'operacional.ver', // "Solicitações"
    'simuladores.ver',
    'agenda.ver',
    'notificacoes.ver',
    'leads.redistribuir', // hoje já redistribui o próprio lead (RLS de UPDATE por ownership) — preservado, não é liberação nova
  ],

  operacional: [
    'dashboard.ver',
    'pessoas.ver', 'pessoas.editar', // confirmado: mesmo fluxo real diário do comercial em Compradores/Vendedores do Processo
    'imoveis.ver',
    'processos.ver', 'processos.editar', // sem processos.criar — não existe hoje pra este perfil
    'conversas.ver', 'conversas.transferir', // confirmado: qualquer perfil pode transferir conversa
    'operacional.ver',
    'simuladores.ver',
    'agenda.ver',
    'notificacoes.ver',
    'leads.ver_todas', // fiel ao RLS atual (perfil <> comercial vê tudo) — hoje inerte, pois este perfil não tem leads.ver
  ], // sem leads.* — sem Captação

  juridico: [
    'dashboard.ver',
    'pessoas.ver',
    'processos.ver', 'processos.editar',
    'conversas.ver', 'conversas.transferir', // confirmado: qualquer perfil pode transferir conversa
    'notificacoes.ver',
    'leads.ver_todas', // fiel ao RLS atual — hoje inerte, este perfil não tem leads.ver
  ],

  apoio: [
    'dashboard.ver',
    'notificacoes.ver',
    'leads.ver_todas',   // fiel ao RLS atual (perfil <> comercial) — hoje inerte, este perfil não tem leads.ver
    'leads.redistribuir', // apoio já tem bypass de ownership na RLS de UPDATE hoje — preservado, hoje também inerte (sem leads.ver/leads.editar)
  ],

  // Nasce sem nenhuma permissão fixa: todo acesso configurável (ações sem
  // configuravel:false no catálogo) fica disponível para ser liberado
  // manualmente em Configurações > Perfis de Acesso, um a um.
  assistente: [
    'dashboard.ver',
    'leads.ver_todas', // fiel ao RLS atual — hoje inerte, este perfil não tem leads.ver
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
    'leads.ver_todas', // já tem leads.ver e não é comercial — fiel ao RLS atual
  ],
  consultor: [
    'dashboard.ver', 'notificacoes.ver', 'leads.ver', 'processos.ver', 'pessoas.ver',
    'leads.ver_todas', // já tem leads.ver e não é comercial — fiel ao RLS atual
  ],
  // cliente permanece deliberadamente [] — não é uma leitura literal do RLS
  // (que hoje daria leads.ver_todas=true pra qualquer perfil <> comercial,
  // cliente incluído). "cliente" é o único perfil desenhado pra ter zero
  // acesso por princípio, sem caminho hoje pra ganhar leads.ver — manter em
  // [] preserva essa garantia e não muda nada observável (a ação já fica
  // inerte sem leads.ver de qualquer forma).
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
