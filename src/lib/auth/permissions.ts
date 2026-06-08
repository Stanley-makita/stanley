import { type Acao, type UsuarioPerfil } from '@/types/auth'

const TODAS_ACOES: Acao[] = [
  'leads.ver', 'leads.criar', 'leads.editar', 'leads.excluir',
  'processos.ver', 'processos.criar', 'processos.editar',
  'financeiro.ver', 'financeiro.editar',
  'rh.ver', 'rh.editar',
  'configuracoes.ver', 'configuracoes.editar',
  'usuarios.convidar', 'usuarios.desativar',
  'conversas.ver_todas', 'conversas.transferir',
  'instancias.gerenciar',
  'pessoas.ver', 'pessoas.editar', 'pessoas.merge', 'pessoas.excluir',
  'biblioteca.ver', 'biblioteca.publicar', 'biblioteca.excluir',
]

export const PERMISSOES: Record<UsuarioPerfil, Acao[]> = {
  admin: TODAS_ACOES,
  gerente: TODAS_ACOES.filter(
    (a) => !(['rh.editar', 'usuarios.desativar', 'instancias.gerenciar'] as Acao[]).includes(a)
  ),
  gestor: TODAS_ACOES.filter(
    (a) => !(['rh.editar', 'usuarios.desativar', 'instancias.gerenciar'] as Acao[]).includes(a)
  ),
  analista: [
    'leads.ver', 'leads.criar', 'leads.editar',
    'processos.ver', 'processos.criar', 'processos.editar',
    'configuracoes.ver',
    'conversas.transferir',
    'pessoas.ver', 'pessoas.editar',
    'biblioteca.ver',
  ],
  comercial: [
    'leads.ver', 'leads.criar', 'leads.editar',
    'processos.ver', 'processos.criar', 'processos.editar',
    'pessoas.ver',
    'biblioteca.ver',
  ],
  operacional: [
    'processos.ver', 'processos.editar',
    'pessoas.ver',
    'biblioteca.ver',
  ],
  juridico: [
    'processos.ver', 'processos.editar',
    'pessoas.ver',
    'biblioteca.ver',
  ],
  apoio: [
    'leads.ver',
    'processos.ver',
    'pessoas.ver',
    'biblioteca.ver',
  ],
  consultor: ['leads.ver', 'processos.ver', 'pessoas.ver', 'biblioteca.ver'],
  cliente: [],
}

export function podeExecutar(perfil: UsuarioPerfil, acao: Acao): boolean {
  return PERMISSOES[perfil].includes(acao)
}