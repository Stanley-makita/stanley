export type UsuarioPerfil =
  | 'admin' | 'gerente' | 'analista' | 'consultor' | 'cliente'
  | 'gestor' | 'comercial' | 'operacional' | 'juridico' | 'apoio'

export interface Usuario {
  id: string
  empresa_id: string
  auth_user_id: string
  nome: string
  email: string
  perfil: UsuarioPerfil
  ativo: boolean
  notificar_leads_aprovados_pendentes: boolean
  ultimo_acesso: string | null
  created_at: string
  updated_at: string
}

export interface Convite {
  id: string
  empresa_id: string
  email: string
  perfil: UsuarioPerfil
  token: string
  criado_por: string
  aceito_em: string | null
  expira_em: string
  created_at: string
}

export interface SessaoUsuario {
  id: string
  empresa_id: string
  perfil: UsuarioPerfil
  nome: string
  email: string
  ativo: boolean
}

export type Acao =
  | 'leads.ver' | 'leads.criar' | 'leads.editar' | 'leads.excluir'
  | 'processos.ver' | 'processos.criar' | 'processos.editar'
  | 'financeiro.ver' | 'financeiro.editar'
  | 'rh.ver' | 'rh.editar'
  | 'configuracoes.ver' | 'configuracoes.editar'
  | 'usuarios.convidar' | 'usuarios.desativar'
  | 'conversas.ver_todas' | 'conversas.transferir'
  | 'instancias.gerenciar'
  | 'pessoas.ver' | 'pessoas.editar' | 'pessoas.merge' | 'pessoas.excluir'
  | 'biblioteca.ver' | 'biblioteca.publicar' | 'biblioteca.excluir'
