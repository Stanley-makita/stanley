import type { Database } from '@/types/supabase'

export type Empresa = Database['public']['Tables']['empresas']['Row']
export type EmpresaUpdate = Database['public']['Tables']['empresas']['Update']

export type Usuario = Database['public']['Tables']['usuarios']['Row']
export type UsuarioInsert = Database['public']['Tables']['usuarios']['Insert']
export type UsuarioUpdate = Database['public']['Tables']['usuarios']['Update']
export type UsuarioPerfil = Database['public']['Enums']['usuario_perfil']

export type Fase = Database['public']['Tables']['fases']['Row']
export type FaseInsert = Database['public']['Tables']['fases']['Insert']
export type FaseUpdate = Database['public']['Tables']['fases']['Update']

export type Banco = Database['public']['Tables']['bancos']['Row']
export type BancoInsert = Database['public']['Tables']['bancos']['Insert']

export type Produto = Database['public']['Tables']['produtos']['Row']
export type ProdutoInsert = Database['public']['Tables']['produtos']['Insert']

export const PERFIS_ATIVOS: UsuarioPerfil[] = [
  'admin', 'gestor', 'comercial', 'operacional', 'juridico', 'apoio',
]

export const PERFIL_LABELS: Record<UsuarioPerfil, string> = {
  admin:       'Administrador',
  gestor:      'Gestor',
  comercial:   'Comercial',
  operacional: 'Operacional',
  juridico:    'Jurídico',
  apoio:       'Apoio',
  // legado
  gerente:     'Gerente',
  analista:    'Analista',
  consultor:   'Consultor',
  cliente:     'Cliente',
}

export const PERFIL_CORES: Record<UsuarioPerfil, string> = {
  admin:       'bg-fonti-primary text-white',
  gestor:      'bg-fonti-accent text-fonti-primary',
  comercial:   'bg-blue-100 text-blue-800',
  operacional: 'bg-indigo-100 text-indigo-800',
  juridico:    'bg-purple-100 text-purple-800',
  apoio:       'bg-teal-100 text-teal-800',
  // legado
  gerente:     'bg-fonti-accent text-fonti-primary',
  analista:    'bg-blue-100 text-blue-800',
  consultor:   'bg-purple-100 text-purple-800',
  cliente:     'bg-gray-100 text-gray-700',
}

export const FUNCOES = [
  'comercial',
  'operacional',
  'juridico',
  'recepcao',
  'apoio',
] as const

export type UsuarioFuncao = (typeof FUNCOES)[number]

export const FUNCAO_LABELS: Record<UsuarioFuncao, string> = {
  comercial:   'Comercial',
  operacional: 'Operacional',
  juridico:    'Jurídico',
  recepcao:    'Recepção',
  apoio:       'Apoio',
}
