// ============================================================
// types/parceiros.ts
// Empresas, Corretores, Parceiros e vínculos com Processo
// ============================================================

// ── Empresas (imobiliárias + construtoras) ──────────────────

export type TipoEmpresa = 'imobiliaria' | 'construtora' | 'ambos'

export interface Empresa {
  id: string
  nome: string
  telefone?: string | null
  email?: string | null
  cnpj?: string | null
  tipo: TipoEmpresa
  observacao?: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface EmpresaForm {
  nome: string
  telefone?: string
  email?: string
  cnpj?: string
  tipo: TipoEmpresa
  observacao?: string
}

// ── Corretores ───────────────────────────────────────────────

export interface Corretor {
  id: string
  nome: string
  telefone?: string | null
  email?: string | null
  creci?: string | null
  empresa_id?: string | null
  observacao?: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
  // join
  empresa?: Pick<Empresa, 'id' | 'nome' | 'tipo'> | null
}

export interface CorretorForm {
  nome: string
  telefone?: string
  email?: string
  creci?: string
  empresa_id?: string | null
  observacao?: string
}

// ── Parceiros comerciais ─────────────────────────────────────

export type TipoParceiro = 'pessoa_fisica' | 'empresa'

export interface Parceiro {
  id: string
  nome: string
  telefone?: string | null
  email?: string | null
  tipo: TipoParceiro
  cpf_cnpj?: string | null
  observacao?: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface ParceiroForm {
  nome: string
  telefone?: string
  email?: string
  tipo: TipoParceiro
  cpf_cnpj?: string
  observacao?: string
}

// ── Vínculos com Processo ────────────────────────────────────

export type PapelEmpresaProcesso = 'imobiliaria' | 'construtora' | 'vendedora'
export type PapelCorretorProcesso = 'corretor_comprador' | 'corretor_vendedor' | 'corretor_parceiro'

export interface ProcessoEmpresa {
  id: string
  processo_id: string
  empresa_id: string
  papel: PapelEmpresaProcesso
  criado_em: string
  // join
  empresa?: Empresa
}

export interface ProcessoCorretor {
  id: string
  processo_id: string
  corretor_id: string
  papel: PapelCorretorProcesso
  principal: boolean
  criado_em: string
  // join
  corretor?: Corretor
}

export interface ProcessoParceiro {
  id: string
  processo_id: string
  parceiro_id: string
  observacao?: string | null
  criado_em: string
  // join
  parceiro?: Parceiro
}

// ── View agregada para o formulário do processo ──────────────

export interface ProcessoParceiroBloco {
  empresas: ProcessoEmpresa[]
  corretores: ProcessoCorretor[]
  parceiros: ProcessoParceiro[]
}

// ── Labels utilitários ───────────────────────────────────────

export const TIPO_EMPRESA_LABEL: Record<TipoEmpresa, string> = {
  imobiliaria: 'Imobiliária',
  construtora: 'Construtora',
  ambos: 'Imobiliária / Construtora',
}

export const PAPEL_EMPRESA_LABEL: Record<PapelEmpresaProcesso, string> = {
  imobiliaria: 'Imobiliária',
  construtora: 'Construtora',
  vendedora: 'Vendedora',
}

export const PAPEL_CORRETOR_LABEL: Record<PapelCorretorProcesso, string> = {
  corretor_comprador: 'Corretor do Comprador',
  corretor_vendedor: 'Corretor do Vendedor',
  corretor_parceiro: 'Corretor Parceiro',
}

export const TIPO_PARCEIRO_LABEL: Record<TipoParceiro, string> = {
  pessoa_fisica: 'Pessoa Física',
  empresa: 'Empresa',
}
